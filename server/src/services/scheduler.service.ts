import cron, { ScheduledTask } from 'node-cron';
import { Lead } from '../models/lead.model';
import { Campaign } from '../models/campaign.model';
import { User } from '../models/user.model';
import { SettingService } from './setting.service';
import { LeadAssignmentService } from './lead-assignment.service';
import { DailyStatService } from './daily-stat.service';
import { DistributedLock } from '../utils/distributedLock';

export interface ISchedulerService {
  start(): void;
  stop(): void;
  checkDueFollowUps(): Promise<number>;
  reassignOverdueDeactivatedAgentLeads(): Promise<number>;
}

export class CronSchedulerService implements ISchedulerService {
  private tasks: ScheduledTask[] = [];

  public start(): void {
    // Only run on PM2 instance 0 (or standalone) to prevent duplicate cron execution in cluster
    const instanceId = process.env.NODE_APP_INSTANCE;
    if (instanceId !== undefined && instanceId !== '0') {
      console.log(`[Scheduler] Skipping scheduler on PM2 instance ${instanceId}. Runs only on instance 0.`);
      return;
    }

    // Check due follow-ups every minute with PM2 cluster distributed lock
    const followUpTask = cron.schedule('* * * * *', async () => {
      const lockKey = 'SCHEDULER_CHECK_FOLLOWUPS';
      const acquired = await DistributedLock.acquire(lockKey, 55);
      if (!acquired) return;

      try {
        await this.checkDueFollowUps();
      } catch (err) {
        console.error('[Scheduler] Error checking due follow-ups:', err);
      } finally {
        await DistributedLock.release(lockKey);
      }
    });

    // Check overdue leads of deactivated agents hourly with distributed lock
    const reassignTask = cron.schedule('0 * * * *', async () => {
      const lockKey = 'SCHEDULER_REASSIGN_OVERDUE';
      const acquired = await DistributedLock.acquire(lockKey, 300);
      if (!acquired) return;

      try {
        await this.reassignOverdueDeactivatedAgentLeads();
      } catch (err) {
        console.error('[Scheduler] Error reassigning overdue leads of deactivated agents:', err);
      } finally {
        await DistributedLock.release(lockKey);
      }
    });

    // Nightly DailyStat reconciliation job at 00:05 IST (18:35 UTC)
    const reconcileTask = cron.schedule('35 18 * * *', async () => {
      const lockKey = 'SCHEDULER_RECONCILE_STATS';
      const acquired = await DistributedLock.acquire(lockKey, 600);
      if (!acquired) return;

      try {
        const result = await DailyStatService.reconcileDailyStats(3);
        console.log(`[Scheduler] Nightly DailyStat reconciliation completed for ${result.reconciledDays} days.`);
      } catch (err) {
        console.error('[Scheduler] Error in nightly DailyStat reconciliation:', err);
      } finally {
        await DistributedLock.release(lockKey);
      }
    });

    this.tasks.push(followUpTask, reassignTask, reconcileTask);
    console.log('[Scheduler] CronSchedulerService started.');
  }

  public stop(): void {
    for (const task of this.tasks) {
      task.stop();
    }
    this.tasks = [];
    console.log('[Scheduler] CronSchedulerService stopped.');
  }

  public async checkDueFollowUps(): Promise<number> {
    const now = new Date();
    const result = await Lead.updateMany(
      {
        status: 'OPEN',
        nextFollowUpAt: { $lte: now, $ne: null },
        followUpDue: false,
      },
      {
        $set: { followUpDue: true },
      },
    );
    return result.modifiedCount;
  }

  public async reassignOverdueDeactivatedAgentLeads(): Promise<number> {
    const settings = await SettingService.getSettings();
    const hours = settings.reassignAfterHours ?? 24;

    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Find deactivated agents
    const deactivatedAgents = await User.find({ role: 'AGENT', isActive: false }, '_id');
    if (deactivatedAgents.length === 0) {
      return 0;
    }

    const deactivatedAgentIds = deactivatedAgents.map((a) => a._id);

    // Find open leads assigned to deactivated agents where follow-up is overdue past cutoff
    const overdueLeads = await Lead.find({
      assignedTo: { $in: deactivatedAgentIds },
      status: 'OPEN',
      nextFollowUpAt: { $lte: cutoff, $ne: null },
    });

    let reassignedCount = 0;
    for (const lead of overdueLeads) {
      const campaign = await Campaign.findById(lead.campaignId);
      if (!campaign || !campaign.isActive) continue;

      const newAgentId = await LeadAssignmentService.assignLead(campaign, lead.customProperties);
      if (newAgentId && newAgentId.toString() !== lead.assignedTo?.toString()) {
        lead.assignedTo = newAgentId;
        await lead.save();
        reassignedCount++;
      }
    }

    return reassignedCount;
  }
}

export const schedulerService: ISchedulerService = new CronSchedulerService();
