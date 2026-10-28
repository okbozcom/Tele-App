import mongoose, { Types } from 'mongoose';
import { Campaign, ICampaignDoc } from '../models/campaign.model';
import { Lead } from '../models/lead.model';
import { Pipeline } from '../models/pipeline.model';
import { User, IUserDoc } from '../models/user.model';
import {
  CreateCampaignInput,
  UpdateCampaignInput,
  CopyCampaignInput,
} from '../validations/campaign.validation';
import { AppError } from '../utils/AppError';

export interface UpdateCampaignResult {
  campaign: ICampaignDoc;
  warning?: string;
}

export class CampaignService {
  private static async validateAgents(agentIdStrings: string[]): Promise<void> {
    if (agentIdStrings.length === 0) return;

    const uniqueIdStrings = Array.from(new Set(agentIdStrings));
    const objectIds = uniqueIdStrings.map((id) => new Types.ObjectId(id));

    const users = await User.find({ _id: { $in: objectIds } });

    if (users.length !== uniqueIdStrings.length) {
      throw new AppError('One or more assigned agents do not exist', 400);
    }

    for (const u of users) {
      if (u.role !== 'AGENT') {
        throw new AppError(`User '${u.name}' (${u.email}) is not an AGENT`, 400);
      }
      if (!u.isActive) {
        throw new AppError(`Agent '${u.name}' (${u.email}) is deactivated`, 400);
      }
    }
  }

  private static async validatePipeline(pipelineId: string): Promise<void> {
    const pipeline = await Pipeline.findById(pipelineId);
    if (!pipeline) {
      throw new AppError('Specified pipeline does not exist', 400);
    }
  }

  public static async createCampaign(
    requester: IUserDoc,
    input: CreateCampaignInput,
  ): Promise<ICampaignDoc> {
    await this.validatePipeline(input.pipelineId);

    // Collect all agent IDs that need validation
    const agentsToValidate: string[] = [...input.agentIds];
    if (input.conditionalRules) {
      for (const rule of input.conditionalRules) {
        agentsToValidate.push(...rule.agentIds);
      }
    }
    if (input.fallbackAgentId) {
      agentsToValidate.push(input.fallbackAgentId);
    }

    await this.validateAgents(agentsToValidate);

    // Determine branch and manager ID
    let branch = input.branch ? input.branch.trim() : null;
    if (requester.role === 'MANAGER') {
      branch = requester.branch || null;
    }

    let managerId: Types.ObjectId;
    if (requester.role === 'MANAGER') {
      managerId = requester._id;
    } else {
      if (input.managerId) {
        const mgr = await User.findById(input.managerId);
        if (!mgr || (mgr.role !== 'MANAGER' && mgr.role !== 'ADMIN') || !mgr.isActive) {
          throw new AppError('Assigned manager must be an active MANAGER or ADMIN user', 400);
        }
        managerId = mgr._id;
      } else if (branch) {
        const branchMgr = await User.findOne({ role: 'MANAGER', branch, isActive: true });
        managerId = branchMgr ? branchMgr._id : requester._id;
      } else {
        managerId = requester._id;
      }
    }

    const campaign = await Campaign.create({
      name: input.name.trim(),
      pipelineId: new Types.ObjectId(input.pipelineId),
      managerId,
      branch,
      agentIds: input.agentIds.map((id) => new Types.ObjectId(id)),
      distributionMode: input.distributionMode,
      conditionalRules: input.conditionalRules.map((rule) => ({
        field: rule.field.trim(),
        value: rule.value.trim(),
        agentIds: rule.agentIds.map((id) => new Types.ObjectId(id)),
      })),
      fallbackAgentId: input.fallbackAgentId ? new Types.ObjectId(input.fallbackAgentId) : null,
      priority: input.priority,
      duplicateMode: input.duplicateMode,
      engagementForm: input.engagementForm,
      isActive: input.isActive ?? true,
    });

    return campaign;
  }

  public static async listCampaigns(
    requester: IUserDoc,
    queryParam?: { branch?: string },
  ): Promise<ICampaignDoc[]> {
    let query: Record<string, unknown> = {};

    if (requester.role === 'ADMIN') {
      if (queryParam?.branch && queryParam.branch !== 'ALL') {
        query = { branch: queryParam.branch };
      } else {
        query = {};
      }
    } else if (requester.role === 'MANAGER') {
      query = {
        $or: [
          { managerId: requester._id },
          ...(requester.branch ? [{ branch: requester.branch }] : []),
        ],
      };
    } else if (requester.role === 'AGENT') {
      const assignedCampaignIds = await Lead.distinct('campaignId', { assignedTo: requester._id });
      const branchCondition = requester.branch
        ? [{ branch: requester.branch }, { branch: null }]
        : [{ branch: null }];

      query = {
        isActive: true,
        $or: [
          { agentIds: requester._id },
          { _id: { $in: assignedCampaignIds } },
          { $and: [{ agentIds: { $size: 0 } }, { $or: branchCondition }] },
        ],
      };
    }

    const campaigns = await Campaign.find(query)
      .populate('pipelineId', 'name')
      .populate('managerId', 'name email')
      .populate('agentIds', 'name email phone')
      .sort({ createdAt: -1 });

    if (campaigns.length === 0) {
      return [];
    }

    // Aggregate real lead statistics for each campaign from MongoDB
    const campIds = campaigns.map((c) => c._id);
    const leadMatch: Record<string, unknown> = { campaignId: { $in: campIds } };
    if (requester.role === 'AGENT') {
      leadMatch.assignedTo = requester._id;
    }

    const leadCounts = await Lead.aggregate<{
      _id: Types.ObjectId;
      total: number;
      newCount: number;
      followUpCount: number;
    }>([
      { $match: leadMatch },
      {
        $group: {
          _id: '$campaignId',
          total: { $sum: 1 },
          newCount: {
            $sum: {
              $cond: [
                { $or: [{ $eq: ['$attemptCount', 0] }, { $not: ['$attemptCount'] }] },
                1,
                0,
              ],
            },
          },
          followUpCount: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$stage', 'Follow Up'] },
                    { $eq: ['$stage', 'Follow-up'] },
                    { $ne: [{ $ifNull: ['$nextFollowUpAt', null] }, null] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const countMap = new Map<string, { total: number; newCount: number; followUpCount: number }>();
    for (const item of leadCounts) {
      countMap.set(item._id.toString(), {
        total: item.total,
        newCount: item.newCount,
        followUpCount: item.followUpCount,
      });
    }

    const result = campaigns.map((camp) => {
      const campObj = camp.toObject ? camp.toObject() : camp;
      const stats = countMap.get(camp._id.toString()) || { total: 0, newCount: 0, followUpCount: 0 };
      return {
        ...campObj,
        totalLeads: stats.total,
        newLeads: stats.newCount,
        followUpLeads: stats.followUpCount,
      };
    });

    return result as unknown as ICampaignDoc[];
  }

  public static async getCampaignById(
    requester: IUserDoc,
    id: string,
  ): Promise<ICampaignDoc> {
    const campaign = await Campaign.findById(id)
      .populate('pipelineId')
      .populate('managerId', 'name email role')
      .populate('agentIds', 'name email phone isActive')
      .populate('fallbackAgentId', 'name email');

    if (!campaign) {
      throw new AppError('Campaign not found', 404);
    }

    // Access authorization check
    if (requester.role === 'MANAGER') {
      const isOwner = campaign.managerId._id.toString() === requester._id.toString();
      const isBranchMatch = Boolean(requester.branch && campaign.branch && requester.branch === campaign.branch);
      if (!isOwner && !isBranchMatch) {
        throw new AppError('Forbidden: You can only view your own campaigns', 403);
      }
    } else if (requester.role === 'AGENT') {
      const isAssigned = campaign.agentIds.some(
        (agent: unknown) => (agent as { _id: Types.ObjectId })._id.toString() === requester._id.toString(),
      );
      if (!isAssigned) {
        throw new AppError('Forbidden: You are not assigned to this campaign', 403);
      }
    }

    return campaign;
  }

  public static async updateCampaign(
    requester: IUserDoc,
    id: string,
    updates: UpdateCampaignInput,
  ): Promise<UpdateCampaignResult> {
    const campaign = await Campaign.findById(id);
    if (!campaign) {
      throw new AppError('Campaign not found', 404);
    }

    if (requester.role === 'MANAGER') {
      const isOwner = campaign.managerId.toString() === requester._id.toString();
      const isBranchMatch = Boolean(requester.branch && campaign.branch && requester.branch === campaign.branch);
      if (!isOwner && !isBranchMatch) {
        throw new AppError('Forbidden: You can only edit your own campaigns', 403);
      }
    }

    if (updates.branch !== undefined && requester.role === 'ADMIN') {
      campaign.branch = updates.branch ? updates.branch.trim() : null;
    }

    if (updates.pipelineId) {
      await this.validatePipeline(updates.pipelineId);
      campaign.pipelineId = new Types.ObjectId(updates.pipelineId);
    }

    // Validate agents if agentIds, conditionalRules, or fallbackAgentId changed
    const agentsToValidate: string[] = [];
    if (updates.agentIds) agentsToValidate.push(...updates.agentIds);
    if (updates.conditionalRules) {
      for (const rule of updates.conditionalRules) {
        agentsToValidate.push(...rule.agentIds);
      }
    }
    if (updates.fallbackAgentId) {
      agentsToValidate.push(updates.fallbackAgentId);
    }

    if (agentsToValidate.length > 0) {
      await this.validateAgents(agentsToValidate);
    }

    let warning: string | undefined;

    // Check if distribution mode is modified on a campaign that already has leads
    if (updates.distributionMode && updates.distributionMode !== campaign.distributionMode) {
      if (mongoose.modelNames().includes('Lead')) {
        const Lead = mongoose.model('Lead');
        const leadCount = await Lead.countDocuments({ campaignId: id });
        if (leadCount > 0) {
          warning =
            'Warning: Leads already exist for this campaign. The distribution mode was changed, but existing leads will not be automatically redistributed.';
        }
      }
      campaign.distributionMode = updates.distributionMode;
    }

    if (updates.name !== undefined) campaign.name = updates.name.trim();
    if (updates.agentIds !== undefined) {
      campaign.agentIds = updates.agentIds.map((aid) => new Types.ObjectId(aid));
    }
    if (updates.conditionalRules !== undefined) {
      campaign.conditionalRules = updates.conditionalRules.map((r) => ({
        field: r.field.trim(),
        value: r.value.trim(),
        agentIds: r.agentIds.map((aid) => new Types.ObjectId(aid)),
      }));
    }
    if (updates.fallbackAgentId !== undefined) {
      campaign.fallbackAgentId = updates.fallbackAgentId
        ? new Types.ObjectId(updates.fallbackAgentId)
        : null;
    }
    if (updates.priority !== undefined) campaign.priority = updates.priority;
    if (updates.duplicateMode !== undefined) campaign.duplicateMode = updates.duplicateMode;
    if (updates.engagementForm !== undefined) campaign.engagementForm = updates.engagementForm;
    if (updates.isActive !== undefined) campaign.isActive = updates.isActive;

    if (updates.managerId !== undefined && requester.role === 'ADMIN') {
      campaign.managerId = new Types.ObjectId(updates.managerId);
    }

    // Check conditional mode completeness
    if (campaign.distributionMode === 'CONDITIONAL') {
      if (!campaign.conditionalRules || campaign.conditionalRules.length === 0) {
        throw new AppError('conditionalRules are required when distributionMode is CONDITIONAL', 400);
      }
      if (!campaign.fallbackAgentId) {
        throw new AppError('fallbackAgentId is required when distributionMode is CONDITIONAL', 400);
      }
    }

    await campaign.save();
    return { campaign, warning };
  }

  public static async copyCampaign(
    requester: IUserDoc,
    id: string,
    input?: CopyCampaignInput,
  ): Promise<ICampaignDoc> {
    const original = await Campaign.findById(id);
    if (!original) {
      throw new AppError('Original campaign not found', 404);
    }

    if (requester.role === 'MANAGER' && original.managerId.toString() !== requester._id.toString()) {
      throw new AppError('Forbidden: You can only copy your own campaigns', 403);
    }

    const newName = input?.name ? input.name.trim() : `${original.name} (Copy)`;

    const duplicated = await Campaign.create({
      name: newName,
      pipelineId: original.pipelineId,
      managerId: requester.role === 'MANAGER' ? requester._id : original.managerId,
      agentIds: [...original.agentIds],
      distributionMode: original.distributionMode,
      conditionalRules: original.conditionalRules.map((r) => ({
        field: r.field,
        value: r.value,
        agentIds: [...r.agentIds],
      })),
      fallbackAgentId: original.fallbackAgentId,
      priority: original.priority,
      duplicateMode: original.duplicateMode,
      engagementForm: [...original.engagementForm],
      isActive: true,
    });

    return duplicated;
  }

  public static async deleteCampaign(requester: IUserDoc, id: string): Promise<void> {
    if (requester.role !== 'ADMIN') {
      throw new AppError('Forbidden: Only administrators can delete campaigns', 403);
    }

    const campaign = await Campaign.findById(id);
    if (!campaign) {
      throw new AppError('Campaign not found', 404);
    }

    // Cascade clean-up: remove all leads and activities associated with this campaign
    if (mongoose.modelNames().includes('Lead')) {
      const Lead = mongoose.model('Lead');
      const leads = await Lead.find({ campaignId: id }, '_id');
      const leadIds = leads.map((l: { _id: unknown }) => l._id);

      if (leadIds.length > 0) {
        if (mongoose.modelNames().includes('Activity')) {
          const Activity = mongoose.model('Activity');
          await Activity.deleteMany({ leadId: { $in: leadIds } });
        }
        await Lead.deleteMany({ campaignId: id });
      }
    }

    await campaign.deleteOne();
  }
}
