import { Types } from 'mongoose';
import { Lead } from '../models/lead.model';
import { Activity } from '../models/activity.model';
import { Campaign } from '../models/campaign.model';
import { IUserDoc } from '../models/user.model';
import { ReportQueryInput, ReportExportQueryInput } from '../validations/report.validation';
import { AppError } from '../utils/AppError';

export interface DashboardReportData {
  totalLeads: number;
  openLeads: number;
  closedLeads: number;
  callsMade: number; // Represents outbound calls for backward compatibility
  connectedCalls: number; // Represents outbound connected calls for backward compatibility
  connectRate: number; // Strict outbound connect rate
  totalDurationSeconds: number;
  averageDurationSeconds: number;
  outboundCalls: number;
  outboundConnected: number;
  outboundConnectRate: number;
  outboundDurationSeconds: number;
  inboundCalls: number;
  inboundConnected: number;
  inboundMissed: number;
  inboundDurationSeconds: number;
  totalInteractions: number;
  leadsBySource: Array<{ source: string; count: number }>;
  leadsByStage: Array<{ stage: string; count: number }>;
  followUpsDueToday: number;
  followUpsMissed: number;
}

export interface UserCallsReportData {
  userId: string;
  name: string;
  email: string;
  branch?: string;
  calls: number; // Outbound dials
  connected: number; // Outbound connected
  notConnected: number; // Outbound not connected
  inboundCalls?: number;
  inboundConnected?: number;
  totalDurationSeconds: number;
  avgDurationSeconds: number;
}

export interface DispositionsReportData {
  userId: string;
  name: string;
  stages: Array<{ stage: string; count: number }>;
}

export interface FollowUpsReportData {
  userId: string;
  name: string;
  due: number;
  completed: number;
  missed: number;
}

export interface CampaignStagesReportData {
  campaignId: string;
  campaignName: string;
  stages: Array<{ stage: string; count: number }>;
}

export interface CampaignLeadsReportData {
  campaignId: string;
  campaignName: string;
  created: number;
  assigned: number;
  closed: number;
  converted: number;
}

export class ReportService {
  private static async buildScopeFilters(
    requester: IUserDoc,
    query: ReportQueryInput,
  ): Promise<{
    leadMatch: Record<string, unknown>;
    activityMatch: Record<string, unknown>;
  }> {
    const leadMatch: Record<string, unknown> = {};
    const activityMatch: Record<string, unknown> = { type: 'CALL' };

    // Date range filter
    if (query.from || query.to) {
      const dateRange: Record<string, Date> = {};
      if (query.from) dateRange.$gte = new Date(query.from);
      if (query.to) dateRange.$lte = new Date(query.to);
      leadMatch.createdAt = dateRange;
      activityMatch.createdAt = dateRange;
    }

    if (requester.role === 'AGENT') {
      leadMatch.assignedTo = requester._id;
      activityMatch.userId = requester._id;

      if (query.campaignId) {
        leadMatch.campaignId = new Types.ObjectId(query.campaignId);
        activityMatch.campaignId = new Types.ObjectId(query.campaignId);
      }
    } else if (requester.role === 'MANAGER') {
      const managedCampaigns = await Campaign.find({ managerId: requester._id }, '_id');
      const managedIds = managedCampaigns.map((c) => c._id);

      if (query.campaignId) {
        const reqCampId = new Types.ObjectId(query.campaignId);
        if (!managedIds.some((id) => id.equals(reqCampId))) {
          // Manager does not own this campaign, return no matches
          leadMatch.campaignId = { $in: [] };
          activityMatch.campaignId = { $in: [] };
        } else {
          leadMatch.campaignId = reqCampId;
          activityMatch.campaignId = reqCampId;
        }
      } else {
        leadMatch.campaignId = { $in: managedIds };
        activityMatch.campaignId = { $in: managedIds };
      }

      if (query.userId) {
        leadMatch.assignedTo = new Types.ObjectId(query.userId);
        activityMatch.userId = new Types.ObjectId(query.userId);
      }
    } else {
      // ADMIN
      if (query.campaignId) {
        leadMatch.campaignId = new Types.ObjectId(query.campaignId);
        activityMatch.campaignId = new Types.ObjectId(query.campaignId);
      }
      if (query.userId) {
        leadMatch.assignedTo = new Types.ObjectId(query.userId);
        activityMatch.userId = new Types.ObjectId(query.userId);
      }
    }

    // Branch filter
    const effectiveBranch =
      query.branch && query.branch !== 'ALL'
        ? query.branch.trim()
        : requester.role === 'MANAGER' && requester.branch
        ? requester.branch.trim()
        : undefined;

    if (effectiveBranch && effectiveBranch !== 'ALL') {
      const branchRegex = new RegExp(`^${effectiveBranch}$`, 'i');
      const { User } = await import('../models/user.model');
      const branchUsers = await User.find({ branch: branchRegex }, '_id');
      const branchUserIds = branchUsers.map((u) => u._id);

      leadMatch.$and = (leadMatch.$and as Array<Record<string, unknown>>) || [];
      (leadMatch.$and as Array<Record<string, unknown>>).push({
        $or: [{ branch: branchRegex }, { assignedTo: { $in: branchUserIds } }],
      });

      activityMatch.$and = (activityMatch.$and as Array<Record<string, unknown>>) || [];
      (activityMatch.$and as Array<Record<string, unknown>>).push({
        $or: [{ branch: branchRegex }, { userId: { $in: branchUserIds } }],
      });
    }

    return { leadMatch, activityMatch };
  }

  public static async getDashboard(
    requester: IUserDoc,
    query: ReportQueryInput,
  ): Promise<DashboardReportData> {
    const { leadMatch, activityMatch } = await this.buildScopeFilters(requester, query);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [leadStats, activityStats] = await Promise.all([
      Lead.aggregate<{
        total: Array<{ count: number }>;
        open: Array<{ count: number }>;
        closed: Array<{ count: number }>;
        bySource: Array<{ _id: string; count: number }>;
        byStage: Array<{ _id: string; count: number }>;
        dueToday: Array<{ count: number }>;
        missed: Array<{ count: number }>;
      }>([
        { $match: leadMatch },
        {
          $facet: {
            total: [{ $count: 'count' }],
            open: [{ $match: { status: 'OPEN' } }, { $count: 'count' }],
            closed: [{ $match: { status: 'CLOSED' } }, { $count: 'count' }],
            bySource: [{ $group: { _id: '$source', count: { $sum: 1 } } }],
            byStage: [{ $group: { _id: '$stage', count: { $sum: 1 } } }],
            dueToday: [
              {
                $match: {
                  status: 'OPEN',
                  nextFollowUpAt: { $gte: startOfToday, $lte: endOfToday },
                },
              },
              { $count: 'count' },
            ],
            missed: [
              {
                $match: {
                  status: 'OPEN',
                  nextFollowUpAt: { $lt: startOfToday, $ne: null },
                },
              },
              { $count: 'count' },
            ],
          },
        },
      ]),

      Activity.aggregate<{
        outbound: Array<{ count: number }>;
        outboundConnected: Array<{ count: number }>;
        outboundDuration: Array<{ totalDuration: number; avgDuration: number }>;
        inbound: Array<{ count: number }>;
        inboundConnected: Array<{ count: number }>;
        inboundMissed: Array<{ count: number }>;
        inboundDuration: Array<{ totalDuration: number; avgDuration: number }>;
      }>([
        { $match: activityMatch },
        {
          $facet: {
            outbound: [
              { $match: { direction: { $ne: 'INCOMING' } } },
              { $count: 'count' },
            ],
            outboundConnected: [
              { $match: { direction: { $ne: 'INCOMING' }, connected: true } },
              { $count: 'count' },
            ],
            outboundDuration: [
              { $match: { direction: { $ne: 'INCOMING' }, connected: true } },
              {
                $group: {
                  _id: null,
                  totalDuration: { $sum: '$durationSeconds' },
                  avgDuration: { $avg: '$durationSeconds' },
                },
              },
            ],
            inbound: [
              { $match: { direction: 'INCOMING' } },
              { $count: 'count' },
            ],
            inboundConnected: [
              { $match: { direction: 'INCOMING', connected: true } },
              { $count: 'count' },
            ],
            inboundMissed: [
              { $match: { direction: 'INCOMING', connected: false } },
              { $count: 'count' },
            ],
            inboundDuration: [
              { $match: { direction: 'INCOMING', connected: true } },
              {
                $group: {
                  _id: null,
                  totalDuration: { $sum: '$durationSeconds' },
                  avgDuration: { $avg: '$durationSeconds' },
                },
              },
            ],
          },
        },
      ]),
    ]);

    const l = leadStats[0] || {};
    const a = activityStats[0] || {};

    const totalLeads = l.total?.[0]?.count || 0;
    const openLeads = l.open?.[0]?.count || 0;
    const closedLeads = l.closed?.[0]?.count || 0;

    const outboundCalls = a.outbound?.[0]?.count || 0;
    const outboundConnected = a.outboundConnected?.[0]?.count || 0;
    const outboundConnectRate = outboundCalls > 0 ? Number(((outboundConnected / outboundCalls) * 100).toFixed(1)) : 0;
    const outboundDurationSeconds = a.outboundDuration?.[0]?.totalDuration || 0;

    const inboundCalls = a.inbound?.[0]?.count || 0;
    const inboundConnected = a.inboundConnected?.[0]?.count || 0;
    const inboundMissed = a.inboundMissed?.[0]?.count || 0;
    const inboundDurationSeconds = a.inboundDuration?.[0]?.totalDuration || 0;

    const callsMade = outboundCalls;
    const connectedCalls = outboundConnected;
    const connectRate = outboundConnectRate;
    const totalDurationSeconds = outboundDurationSeconds + inboundDurationSeconds;
    const totalConnected = outboundConnected + inboundConnected;
    const averageDurationSeconds = totalConnected > 0 ? Math.round(totalDurationSeconds / totalConnected) : 0;
    const totalInteractions = outboundCalls + inboundConnected;

    const leadsBySource = (l.bySource || []).map((s) => ({
      source: s._id || 'Unknown',
      count: s.count,
    }));

    const leadsByStage = (l.byStage || []).map((s) => ({
      stage: s._id || 'Unknown',
      count: s.count,
    }));

    const followUpsDueToday = l.dueToday?.[0]?.count || 0;
    const followUpsMissed = l.missed?.[0]?.count || 0;

    return {
      totalLeads,
      openLeads,
      closedLeads,
      callsMade,
      connectedCalls,
      connectRate,
      totalDurationSeconds,
      averageDurationSeconds,
      outboundCalls,
      outboundConnected,
      outboundConnectRate,
      outboundDurationSeconds,
      inboundCalls,
      inboundConnected,
      inboundMissed,
      inboundDurationSeconds,
      totalInteractions,
      leadsBySource,
      leadsByStage,
      followUpsDueToday,
      followUpsMissed,
    };
  }

  public static async getUserCalls(
    requester: IUserDoc,
    query: ReportQueryInput,
  ): Promise<UserCallsReportData[]> {
    const { activityMatch } = await this.buildScopeFilters(requester, query);

    const stats = await Activity.aggregate<UserCallsReportData>([
      { $match: activityMatch },
      {
        $group: {
          _id: '$userId',
          calls: { $sum: { $cond: [{ $ne: ['$direction', 'INCOMING'] }, 1, 0] } },
          connected: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ['$direction', 'INCOMING'] }, { $eq: ['$connected', true] }] },
                1,
                0,
              ],
            },
          },
          notConnected: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ['$direction', 'INCOMING'] }, { $eq: ['$connected', false] }] },
                1,
                0,
              ],
            },
          },
          inboundCalls: { $sum: { $cond: [{ $eq: ['$direction', 'INCOMING'] }, 1, 0] } },
          inboundConnected: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$direction', 'INCOMING'] }, { $eq: ['$connected', true] }] },
                1,
                0,
              ],
            },
          },
          totalDurationSeconds: { $sum: '$durationSeconds' },
          avgDurationSeconds: { $avg: '$durationSeconds' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          userId: { $toString: '$_id' },
          name: '$user.name',
          email: '$user.email',
          branch: '$user.branch',
          calls: 1,
          connected: 1,
          notConnected: 1,
          inboundCalls: 1,
          inboundConnected: 1,
          totalDurationSeconds: 1,
          avgDurationSeconds: { $round: ['$avgDurationSeconds', 1] },
        },
      },
      { $sort: { calls: -1 } },
    ]);

    // Also include all active AGENT users across branches even if they made 0 calls in this date filter
    const effectiveBranchForAgents =
      query.branch && query.branch !== 'ALL'
        ? query.branch.trim()
        : requester.role === 'MANAGER' && requester.branch
        ? requester.branch.trim()
        : undefined;

    const agentFilter: Record<string, unknown> = { role: 'AGENT', isActive: true };
    if (effectiveBranchForAgents && effectiveBranchForAgents !== 'ALL') {
      agentFilter.branch = new RegExp(`^${effectiveBranchForAgents}$`, 'i');
    }
    const allAgents = await (await import('../models/user.model')).User.find(agentFilter, '_id name email branch');

    const existingUserIds = new Set(stats.map((s) => s.userId));
    for (const ag of allAgents) {
      if (!existingUserIds.has(ag._id.toString())) {
        stats.push({
          userId: ag._id.toString(),
          name: ag.name,
          email: ag.email,
          branch: ag.branch || 'General',
          calls: 0,
          connected: 0,
          notConnected: 0,
          totalDurationSeconds: 0,
          avgDurationSeconds: 0,
        });
      }
    }

    const finalStats =
      effectiveBranchForAgents && effectiveBranchForAgents !== 'ALL'
        ? stats.filter(
            (s) =>
              s.branch &&
              s.branch.toLowerCase() === effectiveBranchForAgents.toLowerCase(),
          )
        : stats;

    return finalStats || [];
  }

  public static async getDispositions(
    requester: IUserDoc,
    query: ReportQueryInput,
  ): Promise<DispositionsReportData[]> {
    const { activityMatch } = await this.buildScopeFilters(requester, query);

    const stats = await Activity.aggregate<DispositionsReportData>([
      { $match: activityMatch },
      {
        $group: {
          _id: { userId: '$userId', stage: '$stage' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.userId',
          stages: {
            $push: { stage: '$_id.stage', count: '$count' },
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          userId: { $toString: '$_id' },
          name: '$user.name',
          stages: 1,
        },
      },
      { $sort: { name: 1 } },
    ]);

    return stats || [];
  }

  public static async getFollowUps(
    requester: IUserDoc,
    query: ReportQueryInput,
  ): Promise<FollowUpsReportData[]> {
    const { leadMatch } = await this.buildScopeFilters(requester, query);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const stats = await Lead.aggregate<FollowUpsReportData>([
      {
        $match: {
          ...leadMatch,
          assignedTo: { $ne: null },
        },
      },
      {
        $group: {
          _id: '$assignedTo',
          due: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'OPEN'] },
                    { $gte: ['$nextFollowUpAt', startOfToday] },
                    { $lte: ['$nextFollowUpAt', endOfToday] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          missed: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'OPEN'] },
                    { $lt: ['$nextFollowUpAt', startOfToday] },
                    { $ne: ['$nextFollowUpAt', null] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          completed: {
            $sum: {
              $cond: [{ $gt: ['$attemptCount', 0] }, 1, 0],
            },
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          userId: { $toString: '$_id' },
          name: '$user.name',
          due: 1,
          completed: 1,
          missed: 1,
        },
      },
      { $sort: { due: -1 } },
    ]);

    return stats || [];
  }

  public static async getCampaignStages(
    requester: IUserDoc,
    query: ReportQueryInput,
  ): Promise<CampaignStagesReportData[]> {
    const { leadMatch } = await this.buildScopeFilters(requester, query);

    const stats = await Lead.aggregate<CampaignStagesReportData>([
      { $match: leadMatch },
      {
        $group: {
          _id: { campaignId: '$campaignId', stage: '$stage' },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.campaignId',
          stages: {
            $push: { stage: '$_id.stage', count: '$count' },
          },
        },
      },
      {
        $lookup: {
          from: 'campaigns',
          localField: '_id',
          foreignField: '_id',
          as: 'campaign',
        },
      },
      { $unwind: '$campaign' },
      {
        $project: {
          _id: 0,
          campaignId: { $toString: '$_id' },
          campaignName: '$campaign.name',
          stages: 1,
        },
      },
      { $sort: { campaignName: 1 } },
    ]);

    return stats || [];
  }

  public static async getCampaignLeads(
    requester: IUserDoc,
    query: ReportQueryInput,
  ): Promise<CampaignLeadsReportData[]> {
    const { leadMatch } = await this.buildScopeFilters(requester, query);

    const stats = await Lead.aggregate<CampaignLeadsReportData>([
      { $match: leadMatch },
      {
        $group: {
          _id: '$campaignId',
          created: { $sum: 1 },
          assigned: {
            $sum: { $cond: [{ $ne: ['$assignedTo', null] }, 1, 0] },
          },
          closed: {
            $sum: { $cond: [{ $eq: ['$status', 'CLOSED'] }, 1, 0] },
          },
          converted: {
            $sum: { $cond: [{ $eq: ['$stage', 'Converted'] }, 1, 0] },
          },
        },
      },
      {
        $lookup: {
          from: 'campaigns',
          localField: '_id',
          foreignField: '_id',
          as: 'campaign',
        },
      },
      { $unwind: '$campaign' },
      {
        $project: {
          _id: 0,
          campaignId: { $toString: '$_id' },
          campaignName: '$campaign.name',
          created: 1,
          assigned: 1,
          closed: 1,
          converted: 1,
        },
      },
      { $sort: { campaignName: 1 } },
    ]);

    return stats || [];
  }

  public static async exportReportToCsv(
    requester: IUserDoc,
    input: ReportExportQueryInput,
  ): Promise<string> {
    const query: ReportQueryInput = {
      from: input.from,
      to: input.to,
      campaignId: input.campaignId,
      userId: input.userId,
      branch: input.branch,
    };

    switch (input.type) {
      case 'dashboard': {
        const d = await this.getDashboard(requester, query);
        const lines: string[] = [
          'Metric,Value',
          `Total Leads,${d.totalLeads}`,
          `Open Leads,${d.openLeads}`,
          `Closed Leads,${d.closedLeads}`,
          `Calls Made,${d.callsMade}`,
          `Connected Calls,${d.connectedCalls}`,
          `Connect Rate,${d.connectRate}%`,
          `Follow-ups Due Today,${d.followUpsDueToday}`,
          `Follow-ups Missed,${d.followUpsMissed}`,
        ];
        return lines.join('\n');
      }

      case 'user-calls': {
        const data = await this.getUserCalls(requester, query);
        const lines: string[] = [
          'Agent Name,Email,Calls Made,Connected,Not Connected,Total Talk Time (sec),Avg Duration (sec)',
        ];
        for (const row of data) {
          lines.push(
            `"${row.name}","${row.email}",${row.calls},${row.connected},${row.notConnected},${row.totalDurationSeconds},${row.avgDurationSeconds}`,
          );
        }
        return lines.join('\n');
      }

      case 'call-logs': {
        const { activityMatch } = await this.buildScopeFilters(requester, query);
        const calls = await Activity.find(activityMatch)
          .sort({ createdAt: -1 })
          .limit(5000)
          .populate('userId', 'name email branch')
          .populate('leadId', 'name phone stage status')
          .lean();

        const lines: string[] = [
          'Date & Time,Agent Name,Agent Email,Customer Name,Customer Phone,Direction,Connected,Duration (sec),Stage,Deal Amount,Remarks',
        ];
        for (const act of calls) {
          const u = act.userId as any;
          const l = act.leadId as any;
          const agentName = u?.name || 'Agent';
          const agentEmail = u?.email || '';
          const custName = l?.name || 'Customer Contact';
          const custPhone = l?.phone || act.phone || '';
          const dateStr = act.createdAt ? new Date(act.createdAt).toISOString() : '';
          const dir = act.direction || 'OUTBOUND';
          const conn = act.connected ? 'YES' : 'NO';
          const dur = act.durationSeconds || 0;
          const stage = act.stage || l?.stage || 'Contacted';
          const dealAmt = act.dealAmount ?? '';
          const remark = (act.remark || '').replace(/"/g, '""');

          lines.push(
            `"${dateStr}","${agentName}","${agentEmail}","${custName}","${custPhone}","${dir}","${conn}",${dur},"${stage}","${dealAmt}","${remark}"`,
          );
        }
        return lines.join('\n');
      }

      case 'dispositions': {
        const data = await this.getDispositions(requester, query);
        const lines: string[] = ['Agent Name,Stage,Count'];
        for (const row of data) {
          for (const s of row.stages) {
            lines.push(`"${row.name}","${s.stage}",${s.count}`);
          }
        }
        return lines.join('\n');
      }

      case 'follow-ups': {
        const data = await this.getFollowUps(requester, query);
        const lines: string[] = ['Agent Name,Due Today,Completed,Missed'];
        for (const row of data) {
          lines.push(`"${row.name}",${row.due},${row.completed},${row.missed}`);
        }
        return lines.join('\n');
      }

      case 'campaign-stages': {
        const data = await this.getCampaignStages(requester, query);
        const lines: string[] = ['Campaign Name,Stage,Lead Count'];
        for (const row of data) {
          for (const s of row.stages) {
            lines.push(`"${row.campaignName}","${s.stage}",${s.count}`);
          }
        }
        return lines.join('\n');
      }

      case 'campaign-leads': {
        const data = await this.getCampaignLeads(requester, query);
        const lines: string[] = ['Campaign Name,Created,Assigned,Closed,Converted'];
        for (const row of data) {
          lines.push(
            `"${row.campaignName}",${row.created},${row.assigned},${row.closed},${row.converted}`,
          );
        }
        return lines.join('\n');
      }

      default:
        throw new AppError('Unsupported export report type', 400);
    }
  }
}
