import { Platform } from 'react-native';
import { callService } from './call.service';
import { useLeadHistoryStore, normalizePhone } from '../store/leadHistoryStore';
import { useAuthStore } from '../store/authStore';
import { formatDisplayPhone } from '../utils/phoneUtils';
import { apiClient } from '../api/client';

export class IncomingCallSyncService {
  private isSyncing = false;
  private lastSyncTimestamp = 0;

  /**
   * Scans Android native CallLog for incoming answered and missed calls from leads/customers.
   * Auto-logs them into useLeadHistoryStore with direction='INCOMING', accurate duration & status.
   */
  public async syncIncomingCalls(limit: number = 35): Promise<number> {
    if (Platform.OS !== 'android') {
      return 0;
    }

    // Debounce to at most once every 3 seconds
    const now = Date.now();
    if (this.isSyncing || now - this.lastSyncTimestamp < 3000) {
      return 0;
    }

    const hasPermission = await callService.checkPermissions();
    if (!hasPermission) {
      return 0;
    }

    this.isSyncing = true;
    this.lastSyncTimestamp = now;

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const callLogPkg = require('react-native-call-log');
      const CallLogs = callLogPkg.default || callLogPkg;
      if (!CallLogs || typeof CallLogs.load !== 'function') {
        return 0;
      }

      const logs: any[] = await CallLogs.load(limit);
      if (!Array.isArray(logs) || logs.length === 0) {
        return 0;
      }

      const user = useAuthStore.getState().user;
      const existingActivities = useLeadHistoryStore.getState().getAllActivities();
      // Scan logs within the last 48 hours
      const cutoffTime = Date.now() - 48 * 60 * 60 * 1000;
      let addedCount = 0;

      for (const log of logs) {
        const rawPhone = (log.phoneNumber || '').trim();
        const normPhone = normalizePhone(rawPhone);
        if (!normPhone || normPhone.length < 7) continue;

        const timestamp =
          typeof log.timestamp === 'number'
            ? log.timestamp
            : parseInt(String(log.timestamp || '0'), 10);

        if (!timestamp || isNaN(timestamp) || timestamp < cutoffTime) continue;

        const rawType = typeof log.rawType === 'number' ? log.rawType : -1;
        const typeStr = (log.type || '').toUpperCase();

        // Android CallLog types:
        // 1 = INCOMING (answered)
        // 3 = MISSED (unanswered incoming)
        // 5 = REJECTED (declined incoming)
        const isIncomingAnswered =
          rawType === 1 ||
          (typeStr.includes('INC') && !typeStr.includes('MISSED') && !typeStr.includes('REJECT'));
        const isMissed =
          rawType === 3 || rawType === 5 || typeStr.includes('MISSED') || typeStr.includes('REJECT');

        if (!isIncomingAnswered && !isMissed) continue;

        // Deduplication: check if this incoming call event was already recorded
        const alreadyExists = existingActivities.some((act) => {
          if (normalizePhone(act.phone) !== normPhone) return false;
          const actTime = new Date(act.createdAt).getTime();
          // Within 2.5 minutes of the call log timestamp
          return Math.abs(actTime - timestamp) < 150000;
        });

        if (alreadyExists) continue;

        const rawDuration =
          typeof log.duration === 'number'
            ? log.duration
            : parseInt(String(log.duration || '0'), 10);
        const durationSeconds = isIncomingAnswered ? Math.max(0, rawDuration) : 0;
        const isConnected = isIncomingAnswered && durationSeconds > 0;

        const stage = isMissed
          ? 'Missed Call'
          : isConnected
          ? 'Connected'
          : 'Not Connected';

        const tag = isMissed ? 'Warm' : isConnected ? 'Hot' : 'Cold';

        const durationMins = Math.floor(durationSeconds / 60);
        const durationSecs = durationSeconds % 60;
        const durationText =
          durationMins > 0 ? `${durationMins}m ${durationSecs}s` : `${durationSecs}s`;

        const remark = isMissed
          ? rawType === 5
            ? 'Incoming call declined by agent'
            : 'Customer missed call'
          : `Incoming call answered (${durationText})`;

        // PRIVACY ENFORCEMENT (P3.3 & ADR 003):
        // Only log incoming/missed calls that match an existing lead or contact in the CRM.
        // Unrelated personal calls from non-leads must NEVER be persisted, uploaded, or exposed!
        const leadMatch = existingActivities.find(
          (a) => a.phone && normalizePhone(a.phone) === normPhone,
        );

        let customerName = leadMatch?.customerName;
        let leadId = leadMatch?.leadId;

        // Check storage caches (support both user-keyed and global cache keys)
        if (!customerName || !leadId) {
          try {
            const { storage } = require('../utils/storage');
            const keysToCheck = [
              user?._id ? `tele_crm_my_leads_cache_v2_${user._id}` : null,
              'tele_crm_my_leads_cache_v2',
            ].filter(Boolean) as string[];

            for (const cacheKey of keysToCheck) {
              const cachedRaw = await storage.getItem(cacheKey);
              if (cachedRaw) {
                const parsed = JSON.parse(cachedRaw);
                const foundInLeads = (parsed.leads || []).find(
                  (l: { phone?: string; name?: string; _id?: string }) =>
                    l.phone && normalizePhone(l.phone) === normPhone,
                );
                if (foundInLeads) {
                  customerName = foundInLeads.name;
                  leadId = foundInLeads._id;
                  break;
                }
              }
            }
          } catch {}
        }

        // If matched from existing activity but lacked synthetic ID, assign deterministic lead ID
        if (!leadId && leadMatch) {
          leadId = leadMatch.leadId || `dial-${normPhone}`;
          customerName = leadMatch.customerName || (rawPhone ? formatDisplayPhone(rawPhone) : 'Customer');
        }

        // If STILL not matching any known CRM lead, discard: it is a personal call!
        if (!customerName || !leadId) {
          continue;
        }

        const idempotencyKey = `inc-${timestamp}-${normPhone}`;
        const callLogId = `log-${timestamp}-${normPhone}`;

        useLeadHistoryStore.getState().addActivity(leadId, {
          phone: rawPhone,
          customerName,
          agentName: user?.name,
          agentId: user?._id,
          branch: user?.branch,
          connected: isConnected,
          type: 'CALL',
          direction: 'INCOMING',
          stage,
          tag,
          durationSeconds,
          remark,
          callLogId,
          idempotencyKey,
          classificationReason: isMissed ? 'INBOUND_MISSED' : 'INBOUND_ANSWERED',
          createdAt: new Date(timestamp).toISOString(),
        });

        // Persist incoming call directly to server so it is counted in dashboard and metrics
        apiClient
          .post(`/api/leads/${leadId}/dispose`, {
            phone: rawPhone,
            connected: isConnected,
            stage: isConnected ? 'Connected' : 'Not Connected',
            tag: tag || 'Warm',
            remark,
            durationSeconds,
            direction: 'INCOMING',
            callAttempt: true,
            callerSource: 'INCOMING_CALL',
            clientEventId: idempotencyKey,
            idempotencyKey,
            startedAt: new Date(timestamp).toISOString(),
            clientTimestamp: new Date(timestamp).toISOString(),
          })
          .catch((err) => {
            console.warn('[IncomingCallSyncService] Server sync for incoming call skipped/failed:', err?.message);
          });

        addedCount++;
      }

      if (addedCount > 0) {
        console.log(`[IncomingCallSyncService] Synced ${addedCount} new incoming/missed calls`);
      }

      return addedCount;
    } catch (err) {
      console.warn('[IncomingCallSyncService] Error syncing incoming calls:', err);
      return 0;
    } finally {
      this.isSyncing = false;
    }
  }
}

export const incomingCallSyncService = new IncomingCallSyncService();
