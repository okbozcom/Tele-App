import mongoose, { Types } from 'mongoose';
import { Pipeline, IPipelineDoc, IStage } from '../models/pipeline.model';
import { CreatePipelineInput, UpdatePipelineInput } from '../validations/pipeline.validation';
import { AppError } from '../utils/AppError';

export class PipelineService {
  public static async listPipelines(): Promise<IPipelineDoc[]> {
    return Pipeline.find().sort({ createdAt: -1 });
  }

  public static async getPipelineById(id: string): Promise<IPipelineDoc> {
    const pipeline = await Pipeline.findById(id);
    if (!pipeline) {
      throw new AppError('Pipeline not found', 404);
    }
    return pipeline;
  }

  public static async createPipeline(input: CreatePipelineInput): Promise<IPipelineDoc> {
    const existing = await Pipeline.findOne({ name: input.name });
    if (existing) {
      throw new AppError('A pipeline with this name already exists', 400);
    }

    // Ensure stage names are unique inside this pipeline
    const stageNames = input.stages.map((s) => s.name.trim().toLowerCase());
    if (new Set(stageNames).size !== stageNames.length) {
      throw new AppError('Stage names must be unique inside a pipeline', 400);
    }

    // Map stages with assigned order if not set
    const stagesWithOrder: IStage[] = input.stages.map((stage, index) => ({
      name: stage.name.trim(),
      isClosed: stage.isClosed ?? false,
      tags: stage.tags || [],
      order: stage.order !== undefined ? stage.order : index,
    }));

    const pipeline = await Pipeline.create({
      name: input.name.trim(),
      stages: stagesWithOrder,
    });

    return pipeline;
  }

  public static async updatePipeline(
    id: string,
    updates: UpdatePipelineInput,
  ): Promise<IPipelineDoc> {
    const pipeline = await Pipeline.findById(id);
    if (!pipeline) {
      throw new AppError('Pipeline not found', 404);
    }

    if (updates.name && updates.name !== pipeline.name) {
      const duplicate = await Pipeline.findOne({ name: updates.name });
      if (duplicate) {
        throw new AppError('Another pipeline with this name already exists', 400);
      }
      pipeline.name = updates.name.trim();
    }

    if (updates.stages) {
      // Validate unique stage names
      const stageNames = updates.stages.map((s) => s.name.trim().toLowerCase());
      if (new Set(stageNames).size !== stageNames.length) {
        throw new AppError('Stage names must be unique inside a pipeline', 400);
      }

      // Check if any removed stage contains active leads
      const newStageNames = new Set(updates.stages.map((s) => s.name.trim()));
      const removedStages = pipeline.stages
        .map((s) => s.name.trim())
        .filter((oldName) => !newStageNames.has(oldName));

      if (removedStages.length > 0 && mongoose.modelNames().includes('Lead')) {
        const Lead = mongoose.model('Lead');
        const activeLeadsCount = await Lead.countDocuments({
          stage: { $in: removedStages },
        });
        if (activeLeadsCount > 0) {
          throw new AppError(
            `Cannot remove stage(s) [${removedStages.join(', ')}] because ${activeLeadsCount} lead(s) currently belong to these stage(s). Reassign them first.`,
            400,
          );
        }
      }

      pipeline.stages = updates.stages.map((s, index) => ({
        ...(s._id ? { _id: new Types.ObjectId(s._id) } : {}),
        name: s.name.trim(),
        isClosed: s.isClosed ?? false,
        tags: s.tags || [],
        order: s.order !== undefined ? s.order : index,
      }));
    }

    await pipeline.save();
    return pipeline;
  }

  public static async deletePipeline(id: string): Promise<void> {
    const pipeline = await Pipeline.findById(id);
    if (!pipeline) {
      throw new AppError('Pipeline not found', 404);
    }

    // Block deletion if any campaign uses this pipeline
    if (mongoose.modelNames().includes('Campaign')) {
      const Campaign = mongoose.model('Campaign');
      const inUseCount = await Campaign.countDocuments({ pipelineId: id });
      if (inUseCount > 0) {
        throw new AppError('Cannot delete pipeline because it is in use by one or more campaigns', 400);
      }
    }

    // Block deletion if any lead is associated with this pipeline
    if (mongoose.modelNames().includes('Lead')) {
      const Lead = mongoose.model('Lead');
      const leadsInUseCount = await Lead.countDocuments({ pipelineId: id });
      if (leadsInUseCount > 0) {
        throw new AppError('Cannot delete pipeline because it is in use by one or more active leads', 400);
      }
    }

    await pipeline.deleteOne();
  }

  /**
   * Helper to retrieve a specific stage by name from a pipeline.
   * Useful for downstream modules (Campaigns, Leads, Activities).
   */
  public static async getStage(
    pipelineId: string | Types.ObjectId,
    stageName: string,
  ): Promise<IStage | null> {
    const pipeline = await Pipeline.findById(pipelineId);
    if (!pipeline) {
      return null;
    }

    const matched = pipeline.stages.find(
      (s) => s.name.toLowerCase() === stageName.trim().toLowerCase(),
    );

    return matched || null;
  }
}
