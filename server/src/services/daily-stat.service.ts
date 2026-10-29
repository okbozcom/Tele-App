import { Types } from 'mongoose';
import { DailyStat } from '../models/daily-stat.model';
import { Activity, IActivityDoc } from '../models/activity.model';
import { IUserDoc } from '../models/user.model';
import { getISTDayKey, getISTDayRange, resolveCallDate } from '../utils/dateUtils';
import { isActivityIncoming } from '../utils/activityUtils';
import { AppError } from '../utils/AppError';

export interface UserTodayStatSummary {
  userId: string;
  dayIST: string;
  attempts: number;
  connected: number;
  notConnected: number;
  talkSeconds: number;
  incoming: number;
  noAttempt: number;
  mismatches: number;
  connectRate: number; // percentage (0 - 100)
  firstCallAt: Date | null;
  lastCallAt: Date | null;
  asOf: string;
}

export interface TeamUserStatRow {
  userId: string;
  name: string;
  email: string;
  branch: string | null;
  attempts: number;
  connected: number;
  notConnected: number;
  talkSeconds: number;
  incoming: number;
  noAttempt: number;
  mismatches: number;
  connectRate: number;
}

export class DailyStatService {
  /**
   * Atomically records an activity in DailyStat via $inc upsert.
   * Updates campaign-level row and overall day-level row (campaignId: null).
   */
  public static async recordActivity(activity: Partial<IActivityDoc>): Promise<void> {
    if (!activity.userId || activity.type !== 'CALL') {
      return;
    }

    const { callDate, dayIST } = resolveCallDate(
      activity.startedAt || activity.createdAt || new Date(),
    );

    const isIncoming = isActivityIncoming(activity);
    const duration = Math.max(0, activity.durationSeconds || 0);

    const inc: Record<string, number> = {};

    if (isIncoming) {
      inc.incoming = 1;
      if (activity.connected && duration > 0) {
        inc.talkSeconds = duration;
      }
    } else {
      // Outgoing call
      if (activity.noAttempt) {
        inc.noAttempt = 1;
      } else {
        inc.attempts = 1;
        if (activity.connected && duration > 0) {
          inc.connected = 1;
          inc.talkSeconds = duration;
        } else {
          inc.notConnected = 1;
        }
        if (activity.dispositionMismatch) {
          inc.mismatches = 1;
        }
      }
    }

    const setOnInsert: Record<string, unknown> = {
      userId: activity.userId,
      dayIST,
      branch: activity.branch || null,
      firstCallAt: callDate,
    };

    const updateQuery: Record<string, unknown> = {
      $inc: inc,
      $setOnInsert: setOnInsert,
      $set: {
        lastCallAt: callDate,
        ...(activity.branch ? { branch: activity.branch } : {}),
      },
    };

    const campaignId = activity.campaignId ? new Types.ObjectId(String(activity.campaignId)) : null;

    // 1. Update per-campaign row if campaign exists
    if (campaignId) {
      await DailyStat.findOneAndUpdate(
        { userId: activity.userId, dayIST, campaignId },
        updateQuery,
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }

    // 2. Update overall user day row (campaignId: null) for instantaneous user stats
    await DailyStat.findOneAndUpdate(
      { userId: activity.userId, dayIST, campaignId: null },
      updateQuery,
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  /**
   * Retrieves today's calling stats for a single user (self / agent).
   */
  public static async getTodayStats(
    user: IUserDoc,
    dayKeyInput?: string,
  ): Promise<UserTodayStatSummary> {
    const dayIST = dayKeyInput || getISTDayKey();

    const stat = await DailyStat.findOne({
      userId: user._id,
      dayIST,
      campaignId: null,
    }).lean();

    const attempts = stat?.attempts || 0;
    const connected = stat?.connected || 0;
    const notConnected = stat?.notConnected || 0;
    const talkSeconds = stat?.talkSeconds || 0;
    const incoming = stat?.incoming || 0;
    const noAttempt = stat?.noAttempt || 0;
    const mismatches = stat?.mismatches || 0;
    const connectRate = attempts > 0 ? Math.round((connected / attempts) * 1000) / 10 : 0;

    return {
      userId: user._id.toString(),
      dayIST,
      attempts,
      connected,
      notConnected,
      talkSeconds,
      incoming,
      noAttempt,
      mismatches,
      connectRate,
      firstCallAt: stat?.firstCallAt || null,
      lastCallAt: stat?.lastCallAt || null,
      asOf: new Date().toISOString(),
    };
  }

  /**
   * Retrieves team stats for a specific IST date, scoped by manager/admin role and branch.
   */
  public static async getTeamStats(
    requester: IUserDoc,
    options: { date?: string; branch?: string; campaignId?: string } = {},
  ): Promise<{ stats: TeamUserStatRow[]; date: string; asOf: string }> {
    const dayIST = options.date || getISTDayKey();

    let targetBranch: string | null = options.branch || null;
    if (requester.role === 'MANAGER') {
      targetBranch = requester.branch || null;
    }

    const match: Record<string, unknown> = {
      dayIST,
      campaignId: options.campaignId ? new Types.ObjectId(options.campaignId) : null,
    };

    if (targetBranch && targetBranch !== 'ALL') {
      match.branch = targetBranch;
    }

    const pipeline: Array<Record<string, unknown>> = [
      { $match: match },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'userInfo',
        },
      },
      { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          userId: { $toString: '$userId' },
          name: { $ifNull: ['$userInfo.name', 'Unknown User'] },
          email: { $ifNull: ['$userInfo.email', ''] },
          branch: { $ifNull: ['$branch', '$userInfo.branch'] },
          attempts: '$attempts',
          connected: '$connected',
          notConnected: '$notConnected',
          talkSeconds: '$talkSeconds',
          incoming: '$incoming',
          noAttempt: '$noAttempt',
          mismatches: '$mismatches',
          connectRate: {
            $cond: [
              { $gt: ['$attempts', 0] },
              { $round: [{ $multiply: [{ $divide: ['$connected', '$attempts'] }, 100] }, 1] },
              0,
            ],
          },
        },
      },
      { $sort: { attempts: -1, talkSeconds: -1 } },
    ];

    const stats = await DailyStat.aggregate<TeamUserStatRow>(pipeline as any);

    return {
      stats,
      date: dayIST,
      asOf: new Date().toISOString(),
    };
  }

  /**
   * Retrieves aggregated stats across a date range (capped at 92 days) for trends.
   */
  public static async getRangeStats(
    requester: IUserDoc,
    options: { from: string; to: string; branch?: string; campaignId?: string },
  ): Promise<{ data: unknown[]; asOf: string }> {
    const fromKey = options.from || getISTDayKey();
    const toKey = options.to || getISTDayKey();

    const fromDate = new Date(fromKey);
    const toDate = new Date(toKey);
    const diffDays = Math.ceil(Math.abs(toDate.getTime() - fromDate.getTime()) / (86400 * 1000));

    if (diffDays > 92) {
      throw new AppError('Date range cannot exceed 92 days', 400);
    }

    let targetBranch: string | null = options.branch || null;
    if (requester.role === 'MANAGER') {
      targetBranch = requester.branch || null;
    }

    const match: Record<string, unknown> = {
      dayIST: { $gte: fromKey, $lte: toKey },
      campaignId: options.campaignId ? new Types.ObjectId(options.campaignId) : null,
    };

    if (requester.role === 'AGENT') {
      match.userId = requester._id;
    } else if (targetBranch && targetBranch !== 'ALL') {
      match.branch = targetBranch;
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: '$dayIST',
          attempts: { $sum: '$attempts' },
          connected: { $sum: '$connected' },
          notConnected: { $sum: '$notConnected' },
          talkSeconds: { $sum: '$talkSeconds' },
          incoming: { $sum: '$incoming' },
          noAttempt: { $sum: '$noAttempt' },
          mismatches: { $sum: '$mismatches' },
        },
      },
      {
        $project: {
          date: '$_id',
          _id: 0,
          attempts: 1,
          connected: 1,
          notConnected: 1,
          talkSeconds: 1,
          incoming: 1,
          noAttempt: 1,
          mismatches: 1,
          connectRate: {
            $cond: [
              { $gt: ['$attempts', 0] },
              { $round: [{ $multiply: [{ $divide: ['$connected', '$attempts'] }, 100] }, 1] },
              0,
            ],
          },
        },
      },
      { $sort: { date: 1 } },
    ];

    const data = await DailyStat.aggregate(pipeline as any);

    return {
      data,
      asOf: new Date().toISOString(),
    };
  }

  /**
   * Reconciles DailyStat from raw Activity records for the last N days.
   * Useful for nightly audits or repairing any edge-case discrepancy.
   */
  public static async reconcileDailyStats(daysBack = 3): Promise<{ reconciledDays: number }> {
    const today = new Date();
    let reconciledDays = 0;

    for (let i = 0; i < daysBack; i++) {
      const targetDate = new Date(today.getTime() - i * 86400 * 1000);
      const dayKey = getISTDayKey(targetDate);
      const { start, end } = getISTDayRange(dayKey);

      // Aggregate all CALL activities on this IST calendar day
      const activities = await Activity.aggregate([
        {
          $match: {
            type: 'CALL',
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: {
              userId: '$userId',
              campaignId: '$campaignId',
            },
            branch: { $first: '$branch' },
            attempts: {
              $sum: {
                $cond: [
                  { $and: [{ $ne: ['$direction', 'INCOMING'] }, { $ne: ['$noAttempt', true] }] },
                  1,
                  0,
                ],
              },
            },
            connected: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$direction', 'INCOMING'] },
                      { $eq: ['$connected', true] },
                      { $gt: ['$durationSeconds', 0] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            notConnected: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$direction', 'INCOMING'] },
                      { $or: [{ $eq: ['$connected', false] }, { $lte: ['$durationSeconds', 0] }] },
                      { $ne: ['$noAttempt', true] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            talkSeconds: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ['$connected', true] }, { $gt: ['$durationSeconds', 0] }] },
                  '$durationSeconds',
                  0,
                ],
              },
            },
            incoming: {
              $sum: {
                $cond: [{ $eq: ['$direction', 'INCOMING'] }, 1, 0],
              },
            },
            noAttempt: {
              $sum: {
                $cond: [{ $eq: ['$noAttempt', true] }, 1, 0],
              },
            },
            mismatches: {
              $sum: {
                $cond: [{ $eq: ['$dispositionMismatch', true] }, 1, 0],
              },
            },
            firstCallAt: { $min: '$createdAt' },
            lastCallAt: { $max: '$createdAt' },
          },
        },
      ]);

      // Re-upsert into DailyStat
      for (const row of activities) {
        const userId = row._id.userId;
        const campaignId = row._id.campaignId;

        await DailyStat.findOneAndUpdate(
          { userId, dayIST: dayKey, campaignId },
          {
            $set: {
              branch: row.branch || null,
              attempts: row.attempts,
              connected: row.connected,
              notConnected: row.notConnected,
              talkSeconds: row.talkSeconds,
              incoming: row.incoming,
              noAttempt: row.noAttempt,
              mismatches: row.mismatches,
              firstCallAt: row.firstCallAt,
              lastCallAt: row.lastCallAt,
            },
          },
          { upsert: true },
        );
      }

      // Also compute user totals (campaignId: null)
      const userTotals = await Activity.aggregate([
        {
          $match: {
            type: 'CALL',
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: '$userId',
            branch: { $first: '$branch' },
            attempts: {
              $sum: {
                $cond: [
                  { $and: [{ $ne: ['$direction', 'INCOMING'] }, { $ne: ['$noAttempt', true] }] },
                  1,
                  0,
                ],
              },
            },
            connected: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$direction', 'INCOMING'] },
                      { $eq: ['$connected', true] },
                      { $gt: ['$durationSeconds', 0] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            notConnected: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$direction', 'INCOMING'] },
                      { $or: [{ $eq: ['$connected', false] }, { $lte: ['$durationSeconds', 0] }] },
                      { $ne: ['$noAttempt', true] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            talkSeconds: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ['$connected', true] }, { $gt: ['$durationSeconds', 0] }] },
                  '$durationSeconds',
                  0,
                ],
              },
            },
            incoming: {
              $sum: {
                $cond: [{ $eq: ['$direction', 'INCOMING'] }, 1, 0],
              },
            },
            noAttempt: {
              $sum: {
                $cond: [{ $eq: ['$noAttempt', true] }, 1, 0],
              },
            },
            mismatches: {
              $sum: {
                $cond: [{ $eq: ['$dispositionMismatch', true] }, 1, 0],
              },
            },
            firstCallAt: { $min: '$createdAt' },
            lastCallAt: { $max: '$createdAt' },
          },
        },
      ]);

      for (const row of userTotals) {
        await DailyStat.findOneAndUpdate(
          { userId: row._id, dayIST: dayKey, campaignId: null },
          {
            $set: {
              branch: row.branch || null,
              attempts: row.attempts,
              connected: row.connected,
              notConnected: row.notConnected,
              talkSeconds: row.talkSeconds,
              incoming: row.incoming,
              noAttempt: row.noAttempt,
              mismatches: row.mismatches,
              firstCallAt: row.firstCallAt,
              lastCallAt: row.lastCallAt,
            },
          },
          { upsert: true },
        );
      }

      reconciledDays++;
    }

    return { reconciledDays };
  }
}
