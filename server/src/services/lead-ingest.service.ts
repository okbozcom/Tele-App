import { Types } from 'mongoose';
import { Campaign } from '../models/campaign.model';
import { Pipeline } from '../models/pipeline.model';
import { Lead, ILeadDoc } from '../models/lead.model';
import { User, IUserDoc } from '../models/user.model';
import { LeadAssignmentService } from './lead-assignment.service';
import { normalizePhone } from '../utils/phone.util';
import { AppError } from '../utils/AppError';

export interface RawLeadRow {
  name?: string;
  phone?: string;
  email?: string;
  assignedTo?: string;
  agent?: string;
  [key: string]: unknown;
}

export interface IngestFailedRow {
  row: RawLeadRow;
  reason: string;
}

export interface IngestResult {
  created: number;
  merged: number;
  skipped: number;
  failed: IngestFailedRow[];
}

export class LeadIngestService {
  public static async ingest(
    campaignId: string | Types.ObjectId,
    rows: RawLeadRow[],
    source = 'UPLOAD',
    targetAgentId?: string | Types.ObjectId,
  ): Promise<IngestResult> {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      throw new AppError('Campaign not found', 404);
    }

    if (!campaign.isActive) {
      throw new AppError('Cannot ingest leads into an inactive campaign', 400);
    }

    // Retrieve the campaign's pipeline to get the initial stage
    const pipeline = await Pipeline.findById(campaign.pipelineId);
    if (!pipeline || pipeline.stages.length === 0) {
      throw new AppError('Campaign pipeline is missing or contains no stages', 400);
    }

    const sortedStages = [...pipeline.stages].sort((a, b) => a.order - b.order);
    const initialStage = sortedStages[0];

    const result: IngestResult = {
      created: 0,
      merged: 0,
      skipped: 0,
      failed: [],
    };

    // Pre-cache active agents for fast matching
    const activeAgents = await User.find({ role: 'AGENT', isActive: true });
    const agentByEmail = new Map<string, Types.ObjectId>();
    const agentByName = new Map<string, Types.ObjectId>();
    const agentById = new Map<string, Types.ObjectId>();

    for (const ag of activeAgents) {
      agentByEmail.set(ag.email.toLowerCase(), ag._id);
      agentByName.set(ag.name.toLowerCase(), ag._id);
      agentById.set(ag._id.toString(), ag._id);
    }

    let targetUser: IUserDoc | null = null;
    if (targetAgentId && Types.ObjectId.isValid(targetAgentId)) {
      targetUser = await User.findById(targetAgentId);
    }

    // Auto-scope distribution to branch agents if campaign is branch-specific and has no agent list
    if (campaign.branch && (!campaign.agentIds || campaign.agentIds.length === 0)) {
      const branchAgents = await User.find({
        role: 'AGENT',
        branch: campaign.branch,
        isActive: true,
        canReceiveLeads: true,
      }, '_id');
      if (branchAgents.length > 0) {
        campaign.agentIds = branchAgents.map((a) => a._id);
      }
    }

    const leadBranch = campaign.branch || targetUser?.branch || null;

    // Chunk size: 250 rows per batch
    const CHUNK_SIZE = 250;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const validChunkRows: Array<{
        row: RawLeadRow;
        name: string;
        normalizedPhone: string;
        email: string;
        customProperties: Map<string, string>;
      }> = [];

      for (const row of chunk) {
        const name = typeof row.name === 'string' ? row.name.trim() : '';
        if (!name) {
          result.failed.push({ row, reason: 'Missing or empty lead name' });
          continue;
        }

        const normalizedPhone = normalizePhone(row.phone);
        if (!normalizedPhone) {
          result.failed.push({
            row,
            reason: 'Invalid phone number (must be a valid 10-digit number)',
          });
          continue;
        }

        const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : '';
        const customProperties = new Map<string, string>();
        for (const [key, val] of Object.entries(row)) {
          const lowerKey = key.toLowerCase();
          if (
            lowerKey !== 'name' &&
            lowerKey !== 'phone' &&
            lowerKey !== 'email' &&
            val !== undefined &&
            val !== null
          ) {
            customProperties.set(key, String(val).trim());
          }
        }

        validChunkRows.push({
          row,
          name,
          normalizedPhone,
          email,
          customProperties,
        });
      }

      if (validChunkRows.length === 0) continue;

      // Batch query existing leads for the current chunk's phone numbers
      const chunkPhones = validChunkRows.map((r) => r.normalizedPhone);
      const existingLeads = await Lead.find({
        campaignId: campaign._id,
        phone: { $in: chunkPhones },
      });

      const existingMap = new Map<string, ILeadDoc>();
      for (const el of existingLeads) {
        existingMap.set(el.phone, el);
      }

      const leadsToInsert: Partial<ILeadDoc>[] = [];

      for (const item of validChunkRows) {
        const existingLead = existingMap.get(item.normalizedPhone);

        if (existingLead) {
          if (campaign.duplicateMode === 'SKIP') {
            result.skipped += 1;
            continue;
          }

          if (campaign.duplicateMode === 'MERGE') {
            for (const [k, v] of item.customProperties.entries()) {
              if (v) existingLead.customProperties.set(k, v);
            }
            if (item.email && !existingLead.email) {
              existingLead.email = item.email;
            }

            if (existingLead.status === 'CLOSED') {
              const currentStageLower = (existingLead.stage || '').toLowerCase();
              const isSuppressed =
                currentStageLower === 'not interested' ||
                currentStageLower === 'lost' ||
                currentStageLower === 'closed' ||
                (existingLead.tag && existingLead.tag.toUpperCase() === 'DND');

              if (!isSuppressed) {
                existingLead.status = 'OPEN';
                existingLead.stage = initialStage.name;
                existingLead.tag = null;
              }
            }

            await existingLead.save();
            result.merged += 1;
            continue;
          }
        }

        // Resolve Assigned Agent
        let assignedTo: Types.ObjectId | null = null;
        if (targetAgentId && Types.ObjectId.isValid(targetAgentId)) {
          assignedTo = new Types.ObjectId(targetAgentId);
        } else if (item.row.assignedTo || item.row.agent) {
          const ident = String(item.row.assignedTo || item.row.agent).trim();
          assignedTo =
            agentByEmail.get(ident.toLowerCase()) ||
            agentByName.get(ident.toLowerCase()) ||
            agentById.get(ident) ||
            (await LeadAssignmentService.assignLead(campaign, item.customProperties));
        } else {
          assignedTo = await LeadAssignmentService.assignLead(campaign, item.customProperties);
        }

        leadsToInsert.push({
          campaignId: campaign._id,
          name: item.name,
          phone: item.normalizedPhone,
          email: item.email,
          source,
          branch: leadBranch,
          customProperties: item.customProperties,
          assignedTo,
          stage: initialStage.name,
          tag: null,
          status: initialStage.isClosed ? 'CLOSED' : 'OPEN',
          attemptCount: 0,
        });
      }

      if (leadsToInsert.length > 0) {
        await Lead.insertMany(leadsToInsert, { ordered: false });
        result.created += leadsToInsert.length;
      }
    }

    return result;
  }
}
