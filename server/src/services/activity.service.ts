import { Types, FilterQuery } from 'mongoose';
import { Activity, IActivityDoc } from '../models/activity.model';
import { Lead, ILeadDoc } from '../models/lead.model';
import { Campaign } from '../models/campaign.model';
import { User, IUserDoc } from '../models/user.model';
import { PipelineService } from './pipeline.service';
import { SettingService } from './setting.service';
import { RetryRuleService } from './retry-rule.service';
import { LeadIngestService } from './lead-ingest.service';
import { AuditService } from './audit.service';
import { DisposeLeadInput } from '../validations/activity.validation';
import { DailyStatService } from './daily-stat.service';
import { resolveCallDate } from '../utils/dateUtils';
import { maskPhoneNumber } from '../utils/phoneUtils';
import { AppError } from '../utils/AppError';

export interface DisposeResult {
  activity: IActivityDoc;
  lead: ILeadDoc;
}

export class ActivityService {
  public static async disposeLead(
    requester: IUserDoc,
    leadId: string,
    input: DisposeLeadInput,
  ): Promise<DisposeResult> {
    let lead: ILeadDoc | null = null;
    if (Types.ObjectId.isValid(leadId)) {
      lead = await Lead.findById(leadId);
    }

    // Fallback: If not found by _id, look up by phone if provided or from input
    const candidatePhone = (input as { phone?: string }).phone || (leadId.replace(/\D/g, '').length >= 7 ? leadId : null);
    if (!lead && candidatePhone) {
      const cleanPhone = candidatePhone.replace(/\D/g, '').slice(-10);
      lead = await Lead.findOne({ phone: { $regex: cleanPhone } });
    }

    const formatDisposeResult = async (act: IActivityDoc, ld: ILeadDoc): Promise<DisposeResult> => {
      const settings = await SettingService.getSettings();
      if (settings.maskContactNumber && requester.role === 'AGENT') {
        const maskedLead = ld.toObject ? ld.toObject() : { ...ld };
        maskedLead.phone = maskPhoneNumber(maskedLead.phone);
        maskedLead.isMasked = true;
        const maskedActivity = act.toObject ? act.toObject() : { ...act };
        maskedActivity.phone = maskPhoneNumber(maskedActivity.phone);
        return {
          activity: maskedActivity as unknown as IActivityDoc,
          lead: maskedLead as unknown as ILeadDoc,
        };
      }
      return { activity: act, lead: ld };
    };

    // Check clientEventId and idempotencyKey: If already processed, return existing activity and lead
    if (input.clientEventId) {
      const existingByClientEventId = await Activity.findOne({
        userId: requester._id,
        clientEventId: input.clientEventId,
      });
      if (existingByClientEventId) {
        const resolvedLead = lead || (await Lead.findById(existingByClientEventId.leadId));
        return formatDisposeResult(existingByClientEventId, resolvedLead!);
      }
    }

    if (input.idempotencyKey) {
      const existingActivity = await Activity.findOne({ idempotencyKey: input.idempotencyKey });
      if (existingActivity) {
        const resolvedLead = lead || (await Lead.findById(existingActivity.leadId));
        return formatDisposeResult(existingActivity, resolvedLead!);
      }
    }

    if (!lead) {
      throw new AppError('Lead not found', 404);
    }

    let campaign = await Campaign.findById(lead.campaignId);
    if (!campaign) {
      campaign = await Campaign.findOne();
      if (!campaign) {
        throw new AppError('Associated campaign not found', 404);
      }
      lead.campaignId = campaign._id;
    }

    // Permission & IDOR check:
    if (requester.role === 'AGENT') {
      if (lead.assignedTo && lead.assignedTo.toString() !== requester._id.toString()) {
        throw new AppError('Forbidden: You can only dispose leads assigned to you', 403);
      }
      if (!lead.assignedTo) {
        lead.assignedTo = requester._id;
      }
    } else if (requester.role === 'MANAGER') {
      const isManagerOfCampaign = campaign.managerId?.toString() === requester._id.toString();
      const isSameBranch = requester.branch && lead.branch && requester.branch.toLowerCase() === lead.branch.toLowerCase();
      if (!isManagerOfCampaign && !isSameBranch) {
        throw new AppError('Forbidden: You do not manage this lead or campaign', 403);
      }
    }

    const settings = await SettingService.getSettings();
    const isCallAttempt = input.callAttempt;

    if (input.connected) {
      // Stage is required when connected
      const stageName = input.stage!;
      const stageDoc = await PipelineService.getStage(campaign.pipelineId, stageName);
      const normalizedStageName = stageName.trim().toLowerCase();
      const standaloneClosingStages: Record<string, string> = {
        closed: 'Closed',
        lost: 'Lost',
        'customer lost': 'Customer Lost',
        dnd: 'DND',
        'do not call': 'Do Not Call',
        junk: 'Junk',
        dropped: 'Dropped',
      };
      const standaloneClosingStage = standaloneClosingStages[normalizedStageName];

      // "Closed" is a disposition state in the app even when a campaign pipeline
      // doesn't define it as a stage (the default pipeline uses "Lost" instead).
      if (!stageDoc && !standaloneClosingStage) {
        throw new AppError(
          `Stage '${stageName}' does not exist in the campaign's pipeline`,
          400,
        );
      }

      // If tag is provided, verify it belongs to this stage (case-insensitive & accept standard temperature tags)
      if (input.tag) {
        const lowerTag = input.tag.toLowerCase();
        const stageTagsLower = (stageDoc?.tags || []).map((t: string) => t.toLowerCase());
        const standardTags = ['hot', 'warm', 'cold'];
        if (
          stageTagsLower.length > 0 &&
          !stageTagsLower.includes(lowerTag) &&
          !standardTags.includes(lowerTag)
        ) {
          throw new AppError(
            `Tag '${input.tag}' does not belong to stage '${stageDoc?.name || standaloneClosingStage}'`,
            400,
          );
        }
      }

      // Check if the stage closes the lead (isClosed flag, or Not Interested / Lost / Closed stage names)
      const stageLower = (stageDoc?.name || standaloneClosingStage || '').trim().toLowerCase();
      const isClosingStage =
        Boolean(stageDoc?.isClosed) ||
        stageLower === 'not interested' ||
        stageLower === 'lost' ||
        stageLower === 'closed' ||
        stageLower === 'customer lost' ||
        stageLower === 'dnd' ||
        stageLower === 'do not call' ||
        stageLower === 'junk' ||
        stageLower === 'dropped';

      if (isClosingStage) {
        lead.status = 'CLOSED';
        lead.nextFollowUpAt = null;
      } else {
        lead.status = 'OPEN';
        // Follow-up required unless allowDisposeWithoutFollowUp org setting is true
        if (!settings.allowDisposeWithoutFollowUp && !input.followUpAt) {
          throw new AppError(
            'followUpAt is required when disposing a non-closed connected lead',
            400,
          );
        }
        lead.nextFollowUpAt = input.followUpAt ? new Date(input.followUpAt) : null;
      }

      lead.stage = stageDoc?.name || standaloneClosingStage || stageName;
      lead.tag = input.tag || null;
      lead.followUpDue = false;
    } else {
      // Not connected - count consecutive not-connected attempts
      const previousActivities = isCallAttempt
        ? await Activity.find({ leadId: lead._id, type: 'CALL' })
            .sort({ createdAt: -1 })
            .limit(20)
        : [];

      let consecutiveAttempts = 1; // Including this current call attempt
      for (const act of previousActivities) {
        if (!act.connected) {
          consecutiveAttempts++;
        } else {
          break;
        }
      }

      // Check if retry rule applies or if number is permanently unusable (P9 compliance)
      const reason = input.notConnectedReason || 'DID_NOT_PICK';
      const isPermanentlyUnreachable =
        reason === 'INVALID_NUMBER' ||
        reason === 'NUMBER_NOT_IN_USE' ||
        reason === 'INCOMING_NOT_AVAILABLE';

      if (isPermanentlyUnreachable) {
        lead.status = 'CLOSED';
        lead.nextFollowUpAt = null;
        lead.stage = 'Closed (Invalid)';
        lead.followUpDue = false;
      } else {
        const rule = await RetryRuleService.getRuleByReason(reason);
        const agentFollowUp = input.followUpAt ? new Date(input.followUpAt) : null;
        let computedFollowUp = RetryRuleService.calculateRetryFollowUp(rule, consecutiveAttempts, agentFollowUp);

        // If neither agentFollowUp nor computedFollowUp is present, default to 2 hours from now adjusted for calling hours
        if (!agentFollowUp && !computedFollowUp) {
          computedFollowUp = RetryRuleService.adjustForCallingHours(new Date(Date.now() + 2 * 60 * 60 * 1000));
        }

        lead.nextFollowUpAt = agentFollowUp || computedFollowUp;
        lead.stage = isCallAttempt ? 'Not Connected' : input.stage || 'Not Connected';
        if (input.tag) {
          lead.tag = input.tag;
        }
        lead.followUpDue = false;
      }
    }

    // Reassignment if requested
    if (input.reassignToUserId) {
      if (!Types.ObjectId.isValid(input.reassignToUserId)) {
        throw new AppError('Invalid reassignToUserId format', 400);
      }
      const targetUser = await User.findById(input.reassignToUserId);
      if (!targetUser || !targetUser.isActive) {
        throw new AppError('reassignToUserId must be an active user', 400);
      }
      if (targetUser.role === 'AGENT' && !targetUser.canReceiveLeads) {
        throw new AppError('Target agent must have canReceiveLeads enabled', 400);
      }
      const previousAssignedTo = lead.assignedTo;
      lead.assignedTo = targetUser._id;

      await AuditService.log({
        userId: requester._id,
        userEmail: requester.email,
        userRole: requester.role,
        action: 'LEAD_REASSIGN',
        resourceType: 'LEAD',
        resourceId: lead._id.toString(),
        details: {
          fromUser: previousAssignedTo?.toString(),
          toUser: targetUser._id.toString(),
          campaignId: lead.campaignId.toString(),
          dispositionStage: lead.stage,
        },
      });
    }

    // Copy to another campaign if requested
    if (input.copyToCampaignId) {
      const customPropsObj: Record<string, unknown> = {};
      lead.customProperties.forEach((value, key) => {
        customPropsObj[key] = value;
      });

      const copyRow = {
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        ...customPropsObj,
      };

      await LeadIngestService.ingest(input.copyToCampaignId, [copyRow], 'CAMPAIGN_COPY');
    }

    // A repeated post-call submission must not increment the lead twice.
    const recentActivity = isCallAttempt
      ? await Activity.findOne({
          leadId: lead._id,
          userId: requester._id,
          type: 'CALL',
          connected: input.connected,
          createdAt: { $gte: new Date(Date.now() - 4000) },
        }).sort({ createdAt: -1 })
      : null;

    if (recentActivity) {
      return { activity: recentActivity, lead };
    }

    // Update contact timestamp so dialed or disposed leads always move to the bottom of the queue
    lead.lastContactedAt = new Date();
    if (input.dealAmount !== undefined && input.dealAmount !== null) {
      (lead as unknown as { dealAmount?: number }).dealAmount = input.dealAmount;
      if (input.currency) {
        (lead as unknown as { currency?: string }).currency = input.currency;
      }
    }

    const isIncoming = input.direction === 'INCOMING';
    if (!isIncoming) {
      if (isCallAttempt) {
        lead.attemptCount += 1;
      } else if (!lead.attemptCount || lead.attemptCount === 0) {
        lead.attemptCount = 1;
      }
    }
    await lead.save();

    const duration = isCallAttempt && input.connected ? input.durationSeconds || 0 : 0;
    const isMismatch = input.dispositionMismatch ?? (
      (!input.connected && duration > 20) ||
      (input.connected && duration === 0 && input.durationSource === 'DEVICE_CALL_LOG')
    );

    const { callDate, dayIST } = resolveCallDate(input.startedAt || input.clientTimestamp || new Date());
    const startedAt = input.startedAt ? new Date(input.startedAt) : callDate;
    const endedAt = input.endedAt ? new Date(input.endedAt) : (duration > 0 ? new Date(startedAt.getTime() + duration * 1000) : null);

    // Create Activity log
    const activity = await Activity.create({
      leadId: lead._id,
      phone: lead.phone || (input as { phone?: string }).phone || null,
      branch: (requester as { branch?: string }).branch || (lead as { branch?: string }).branch || null,
      campaignId: lead.campaignId,
      userId: requester._id,
      clientEventId: input.clientEventId || null,
      startedAt,
      endedAt,
      durationSource: input.durationSource || 'APP_ESTIMATE',
      dispositionMismatch: Boolean(isMismatch),
      noAttempt: Boolean(input.noAttempt),
      clientTimestamp: input.clientTimestamp ? new Date(input.clientTimestamp) : null,
      serverReceivedAt: new Date(),
      dayIST,
      type: isCallAttempt ? 'CALL' : 'UPDATE',
      direction: input.direction || 'OUTGOING',
      connected: isCallAttempt && input.connected,
      notConnectedReason:
        isCallAttempt && !input.connected ? (input.notConnectedReason || 'DID_NOT_PICK') : null,
      stage: lead.stage || input.stage || 'New',
      tag: lead.tag || input.tag || null,
      remark: input.remark || null,
      followUpAt: lead.nextFollowUpAt,
      durationSeconds: duration,
      answers: input.answers || [],
      callLogId: input.callLogId || null,
      idempotencyKey: input.idempotencyKey || null,
      classificationReason: input.classificationReason || null,
      dealAmount: input.dealAmount ?? null,
      currency: input.currency || 'INR',
    });

    // Atomically record into DailyStat
    try {
      await DailyStatService.recordActivity(activity);
    } catch (statErr) {
      console.error('[ActivityService] Error updating DailyStat:', statErr);
    }

    return formatDisposeResult(activity, lead);
  }

  public static async getLeadHistory(
    _requester: IUserDoc,
    leadId: string,
  ): Promise<IActivityDoc[]> {
    let lead: ILeadDoc | null = null;
    if (Types.ObjectId.isValid(leadId)) {
      lead = await Lead.findById(leadId);
    }
    if (!lead && leadId.replace(/\D/g, '').length >= 7) {
      const cleanPhone = leadId.replace(/\D/g, '').slice(-10);
      lead = await Lead.findOne({ phone: { $regex: cleanPhone } });
    }

    const query: FilterQuery<IActivityDoc> = {};
    if (lead) {
      query.$or = [
        { leadId: lead._id },
        ...(lead.phone ? [{ phone: { $regex: lead.phone.replace(/\D/g, '').slice(-10) } }] : []),
      ];
    } else {
      const clean = leadId.replace(/\D/g, '').slice(-10);
      query.$or = [
        ...(Types.ObjectId.isValid(leadId) ? [{ leadId: new Types.ObjectId(leadId) }] : []),
        ...(clean.length >= 7 ? [{ phone: { $regex: clean } }] : [{ phone: leadId }]),
      ];
    }

    const rawActivities = await Activity.find(query)
      .populate('userId', 'name email role branch')
      .sort({ createdAt: -1 });

    // Deduplicate any legacy or simultaneous duplicate records created within 15 seconds
    const deduplicated: IActivityDoc[] = [];
    for (const act of rawActivities) {
      const actTime = new Date(act.createdAt).getTime();
      const isDuplicate = deduplicated.some((existing) => {
        if (existing._id.toString() === act._id.toString()) return true;
        const existingTime = new Date(existing.createdAt).getTime();
        if (Math.abs(existingTime - actTime) < 15000) {
          const sameStage =
            (existing.stage || '').toLowerCase().trim() === (act.stage || '').toLowerCase().trim();
          const sameConnected = existing.connected === act.connected;
          if (existing.type === act.type && sameStage && sameConnected) {
            return true;
          }
        }
        return false;
      });
      if (!isDuplicate) {
        deduplicated.push(act);
      }
    }

    const settings = await SettingService.getSettings();
    if (settings.maskContactNumber && _requester.role === 'AGENT') {
      return deduplicated.map((act) => {
        const obj = act.toObject ? act.toObject() : { ...act };
        obj.phone = maskPhoneNumber(obj.phone);
        return obj as unknown as IActivityDoc;
      });
    }

    return deduplicated;
  }

  public static async getUserActivities(
    requester: IUserDoc,
    query: {
      userId?: string;
      from?: string;
      to?: string;
      stage?: string;
      connected?: string;
      limit?: string | number;
    },
  ) {
    const filter: Record<string, unknown> = { type: 'CALL' };

    // If requester is an AGENT, strictly scope to their own userId
    if (requester.role === 'AGENT') {
      filter.userId = requester._id;
    } else if (query.userId) {
      if (Types.ObjectId.isValid(query.userId)) {
        filter.userId = new Types.ObjectId(query.userId);
      } else {
        const cleanQuery = query.userId.trim();
        const userMatch = await User.findOne({
          $or: [
            { email: new RegExp("^" + cleanQuery + "$", "i") },
            { name: new RegExp("^" + cleanQuery + "$", "i") },
          ],
        });
        if (userMatch) {
          filter.userId = userMatch._id;
        } else {
          filter.userId = new Types.ObjectId();
        }
      }
    } else if (requester.role === 'MANAGER' && requester.branch) {
      filter.branch = new RegExp(`^${requester.branch.trim()}$`, 'i');
    }

    if (query.from || query.to) {
      const dateRange: Record<string, Date> = {};
      if (query.from) dateRange.$gte = new Date(query.from);
      if (query.to) dateRange.$lte = new Date(query.to);
      filter.createdAt = dateRange;
    }

    if (query.stage && query.stage !== 'ALL') {
      filter.stage = new RegExp(query.stage.trim(), 'i');
    }

    if (query.connected !== undefined && query.connected !== '') {
      filter.connected = query.connected === 'true';
    }

    const limitNum = query.limit ? Math.min(Number(query.limit) || 500, 1000) : 500;

    const [activities, settings] = await Promise.all([
      Activity.find(filter)
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .populate('leadId', 'name phone temperature tag stage')
        .populate('userId', 'name email branch')
        .lean(),
      SettingService.getSettings(),
    ]);

    const shouldMask = requester.role === 'AGENT' && !!settings.maskContactNumber;

    return activities.map((rawAct) => {
      const act = rawAct as unknown as Record<string, unknown>;
      const leadObj = act.leadId && typeof act.leadId === 'object' ? (act.leadId as Record<string, unknown>) : null;
      const userObj = act.userId && typeof act.userId === 'object' ? (act.userId as Record<string, unknown>) : null;

      const phone = (act.phone as string) || (leadObj?.phone as string) || '';
      const maskedPhone = shouldMask ? maskPhoneNumber(phone) : phone;

      const customerName =
        (leadObj?.name as string) ||
        (act.phone ? `Customer (${maskedPhone})` : 'Lead Contact');

      const temperature = (act.tag as string) || (leadObj?.temperature as string) || (leadObj?.tag as string) || 'WARM';

      return {
        _id: String(act._id),
        leadId: leadObj?._id ? String(leadObj._id) : act.leadId ? String(act.leadId) : '',
        campaignId: act.campaignId ? String(act.campaignId) : '',
        userId: userObj?._id ? String(userObj._id) : act.userId ? String(act.userId) : requester._id.toString(),
        agentName: (userObj?.name as string) || requester.name,
        customerName,
        phone: maskedPhone,
        type: act.type as 'CALL' | 'UPDATE',
        direction: (act.direction as 'OUTGOING' | 'INCOMING') || 'OUTGOING',
        connected: Boolean(act.connected),
        notConnectedReason: (act.notConnectedReason as string) || null,
        stage: (act.stage as string) || 'New',
        tag: temperature,
        temperature,
        remark: (act.remark as string) || '',
        followUpAt: act.followUpAt ? new Date(act.followUpAt as string | Date).toISOString() : null,
        durationSeconds: (act.durationSeconds as number) || 0,
        branch: (act.branch as string) || (userObj?.branch as string) || null,
        callLogId: (act.callLogId as string) || null,
        idempotencyKey: (act.idempotencyKey as string) || null,
        dealAmount: act.dealAmount !== undefined ? (act.dealAmount as number) : null,
        currency: (act.currency as string) || 'INR',
        createdAt: act.createdAt ? new Date(act.createdAt as string | Date).toISOString() : new Date().toISOString(),
        updatedAt: act.updatedAt ? new Date(act.updatedAt as string | Date).toISOString() : new Date().toISOString(),
      };
    });
  }

  public static async getBranchCallStats(branchName?: string) {
    const match: Record<string, unknown> = { type: 'CALL' };
    if (branchName && branchName !== 'ALL') {
      match.branch = branchName;
    }

    const stats = await Activity.aggregate([
      ...(Object.keys(match).length > 0 ? [{ $match: match }] : []),
      {
        $group: {
          _id: '$branch',
          totalCalls: { $sum: 1 },
          connectedCalls: {
            $sum: { $cond: [{ $eq: ['$connected', true] }, 1, 0] },
          },
          notConnectedCalls: {
            $sum: { $cond: [{ $eq: ['$connected', false] }, 1, 0] },
          },
          totalDurationSeconds: { $sum: '$durationSeconds' },
          uniqueAgents: { $addToSet: '$userId' },
        },
      },
      {
        $project: {
          branch: { $ifNull: ['$_id', 'Unassigned'] },
          totalCalls: 1,
          connectedCalls: 1,
          notConnectedCalls: 1,
          totalDurationSeconds: 1,
          activeAgentCount: { $size: '$uniqueAgents' },
        },
      },
      { $sort: { totalCalls: -1 } },
    ]);

    return stats;
  }
}
