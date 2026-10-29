import { Activity } from '../models/activity.model';
import { IUserDoc } from '../models/user.model';
import { ActivityService } from './activity.service';
import { BatchSyncItemInput } from '../validations/sync.validation';

export interface BatchItemResult {
  clientEventId: string;
  status: 'success' | 'already_synced' | 'error';
  activityId?: string;
  error?: string;
}

export class SyncService {
  /**
   * Processes a batch of offline outbox events idempotently (up to 50 items).
   * Guarantees per-item error isolation so one corrupted item does not block the batch.
   */
  public static async batchSync(
    requester: IUserDoc,
    events: BatchSyncItemInput[],
  ): Promise<{ results: BatchItemResult[]; total: number; succeeded: number }> {
    const results: BatchItemResult[] = [];
    let succeeded = 0;

    for (const item of events) {
      try {
        // 1. Idempotency check via (userId, clientEventId)
        const existing = await Activity.findOne({
          userId: requester._id,
          clientEventId: item.clientEventId,
        });

        if (existing) {
          results.push({
            clientEventId: item.clientEventId,
            status: 'already_synced',
            activityId: existing._id.toString(),
          });
          succeeded++;
          continue;
        }

        // 2. Submit disposition through ActivityService
        const disposeRes = await ActivityService.disposeLead(requester, item.leadId, {
          callAttempt: true,
          connected: item.connected,
          notConnectedReason: item.notConnectedReason || undefined,
          stage: item.stage,
          tag: item.tag || null,
          remark: item.remark || null,
          followUpAt: item.followUpAt || null,
          durationSeconds: item.durationSeconds,
          direction: item.direction,
          clientEventId: item.clientEventId,
          startedAt: item.clientTimestamp || null,
          durationSource: item.durationSource || 'APP_ESTIMATE',
          dispositionMismatch: item.dispositionMismatch,
          noAttempt: item.noAttempt,
          clientTimestamp: item.clientTimestamp || null,
          answers: item.answers,
          callLogId: item.callLogId || null,
          classificationReason: item.classificationReason || null,
        });

        results.push({
          clientEventId: item.clientEventId,
          status: 'success',
          activityId: disposeRes.activity._id.toString(),
        });
        succeeded++;
      } catch (err: any) {
        results.push({
          clientEventId: item.clientEventId,
          status: 'error',
          error: err.message || 'Failed to sync event',
        });
      }
    }

    return {
      results,
      total: events.length,
      succeeded,
    };
  }
}
