import { create } from 'zustand';
import NetInfo from '@react-native-community/netinfo';
import { storage } from '../utils/storage';
import { disposeLead, batchSyncActivities } from '../api/leadApi';
import { DisposeLeadPayload } from '../types';

export type OutboxItemStatus = 'PENDING' | 'SYNCING' | 'FAILED' | 'SYNCED';
export type OutboxMutationType = 'DISPOSE_LEAD' | 'UPDATE_LEAD';

export interface OutboxItem {
  id: string; // Client UUID
  idempotencyKey: string;
  type: OutboxMutationType;
  leadId: string;
  payload: DisposeLeadPayload;
  status: OutboxItemStatus;
  createdAt: string;
  updatedAt: string;
  attemptCount: number;
  lastError?: string;
  permanentFailure?: boolean;
}

interface OutboxState {
  items: OutboxItem[];
  isSyncing: boolean;
  isOnline: boolean;
  initialized: boolean;
  init: () => Promise<void>;
  enqueueMutation: (
    type: OutboxMutationType,
    leadId: string,
    payload: DisposeLeadPayload,
    idempotencyKey?: string | null,
  ) => Promise<OutboxItem>;
  processOutbox: () => Promise<void>;
  retryItem: (id: string) => Promise<void>;
  discardItem: (id: string) => Promise<void>;
  clearSynced: () => Promise<void>;
  getPendingCount: () => number;
  getFailedItems: () => OutboxItem[];
}

const OUTBOX_STORAGE_KEY = 'tele_app_outbox_queue_v1';

const generateUUID = (): string => {
  return 'outbox_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
};

let reconnectJitterTimer: any = null;

export const useOutboxStore = create<OutboxState>((set, get) => ({
  items: [],
  isSyncing: false,
  isOnline: true,
  initialized: false,

  init: async () => {
    if (get().initialized) return;

    try {
      const stored = await storage.getItem(OUTBOX_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as OutboxItem[];
        set({ items: Array.isArray(parsed) ? parsed : [] });
      }
    } catch {
      set({ items: [] });
    }

    set({ initialized: true });

    // Set up network connectivity listener with jitter to avoid thundering herd
    NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      const wasOffline = !get().isOnline;
      set({ isOnline: online });

      if (online && wasOffline) {
        if (reconnectJitterTimer) clearTimeout(reconnectJitterTimer);
        const jitter = Math.floor(Math.random() * 1500) + 500;
        reconnectJitterTimer = setTimeout(() => {
          get().processOutbox();
        }, jitter);
      }
    });

    // Initial check
    const net = await NetInfo.fetch();
    set({ isOnline: Boolean(net.isConnected) });
    if (net.isConnected) {
      get().processOutbox();
    }
  },

  enqueueMutation: async (type, leadId, payload, existingIdempotencyKey) => {
    const id = generateUUID();
    const idempotencyKey =
      existingIdempotencyKey && existingIdempotencyKey.trim()
        ? existingIdempotencyKey
        : generateUUID();
    const item: OutboxItem = {
      id,
      idempotencyKey,
      type,
      leadId,
      payload: {
        ...payload,
        idempotencyKey,
      },
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attemptCount: 0,
    };

    const updated = [item, ...get().items];
    set({ items: updated });
    await storage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(updated));

    // If online, immediately process queue in background
    if (get().isOnline && !get().isSyncing) {
      get().processOutbox();
    }

    return item;
  },

  processOutbox: async () => {
    const { items, isSyncing, isOnline } = get();
    if (isSyncing || !isOnline) return;

    set({ isSyncing: true });

    try {
      const currentItems = [...get().items];
      const pendingIndices = currentItems
        .map((it, idx) => (it.status === 'PENDING' ? idx : -1))
        .filter((idx) => idx !== -1);

      if (pendingIndices.length === 0) {
        return;
      }

      // Mark all pending as SYNCING
      for (const idx of pendingIndices) {
        currentItems[idx] = {
          ...currentItems[idx],
          status: 'SYNCING',
          updatedAt: new Date().toISOString(),
          attemptCount: currentItems[idx].attemptCount + 1,
        };
      }
      set({ items: [...currentItems] });

      // Separate DISPOSE_LEAD items that can be batched to /api/sync/batch
      const batchableIndices = pendingIndices.filter(
        (idx) => currentItems[idx].type === 'DISPOSE_LEAD',
      );

      // Process in chunks of up to 50
      const CHUNK_SIZE = 50;
      for (let c = 0; c < batchableIndices.length; c += CHUNK_SIZE) {
        const chunkIndices = batchableIndices.slice(c, c + CHUNK_SIZE);
        const chunkEvents = chunkIndices.map((idx) => {
          const it = currentItems[idx];
          return {
            clientEventId:
              it.payload.clientEventId || it.idempotencyKey || it.id,
            leadId: it.leadId,
            connected:
              it.payload.connected ?? (it.payload.stage !== 'NOT CONNECTED'),
            notConnectedReason: it.payload.notConnectedReason,
            stage: it.payload.stage || 'FOLLOW UP',
            tag: it.payload.tag || null,
            remark: it.payload.remark || null,
            followUpAt: it.payload.followUpAt || null,
            durationSeconds: it.payload.durationSeconds || 0,
            direction: it.payload.direction || 'OUTGOING',
            clientTimestamp: it.payload.clientTimestamp || it.createdAt,
            answers: it.payload.answers,
            callLogId: it.payload.callLogId || null,
            classificationReason: it.payload.classificationReason || null,
            durationSource: it.payload.durationSource || 'APP_ESTIMATE',
            dispositionMismatch: Boolean(it.payload.dispositionMismatch),
            noAttempt: Boolean(it.payload.noAttempt),
          };
        });

        try {
          const res = await batchSyncActivities(chunkEvents);
          const resultMap = new Map<string, any>();
          for (const r of res.results) {
            resultMap.set(r.clientEventId, r);
          }

          for (const idx of chunkIndices) {
            const it = currentItems[idx];
            const eventId =
              it.payload.clientEventId || it.idempotencyKey || it.id;
            const itemResult = resultMap.get(eventId);

            if (
              itemResult &&
              (itemResult.status === 'success' ||
                itemResult.status === 'already_synced')
            ) {
              currentItems[idx] = {
                ...currentItems[idx],
                status: 'SYNCED',
                updatedAt: new Date().toISOString(),
              };
            } else {
              currentItems[idx] = {
                ...currentItems[idx],
                status: 'FAILED',
                lastError: itemResult?.error || 'Sync error',
                updatedAt: new Date().toISOString(),
              };
            }
          }
        } catch {
          // If batch endpoint failed entirely, fall back to individual disposeLead
          for (const idx of chunkIndices) {
            const it = currentItems[idx];
            try {
              await disposeLead(it.leadId, it.payload);
              currentItems[idx] = {
                ...currentItems[idx],
                status: 'SYNCED',
                updatedAt: new Date().toISOString(),
              };
            } catch (singleErr: any) {
              const status = singleErr?.response?.status;
              const is4xx = status >= 400 && status < 500 && status !== 429;
              const errMsg =
                singleErr?.response?.data?.message ||
                singleErr?.message ||
                'Network request failed';

              currentItems[idx] = {
                ...currentItems[idx],
                status: 'FAILED',
                lastError: errMsg,
                permanentFailure: is4xx,
                updatedAt: new Date().toISOString(),
              };
            }
          }
        }
      }

      // Handle any non-DISPOSE_LEAD pending items individually
      const nonBatchable = pendingIndices.filter(
        (idx) => currentItems[idx].type !== 'DISPOSE_LEAD',
      );
      for (const idx of nonBatchable) {
        const item = currentItems[idx];
        try {
          await disposeLead(item.leadId, item.payload);
          currentItems[idx] = {
            ...currentItems[idx],
            status: 'SYNCED',
            updatedAt: new Date().toISOString(),
          };
        } catch (err: any) {
          currentItems[idx] = {
            ...currentItems[idx],
            status: 'FAILED',
            lastError: err?.message || 'Failed to sync',
            updatedAt: new Date().toISOString(),
          };
        }
      }

      // Keep SYNCED items for max 2 hours for audit
      const pruned = currentItems.filter((it) => {
        if (it.status === 'SYNCED') {
          const ageHours =
            (Date.now() - new Date(it.updatedAt).getTime()) / (1000 * 60 * 60);
          return ageHours < 2;
        }
        return true;
      });

      set({ items: pruned });
      await storage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(pruned));
    } finally {
      set({ isSyncing: false });
    }
  },

  retryItem: async (id: string) => {
    const items = get().items.map((it) => {
      if (it.id === id) {
        return {
          ...it,
          status: 'PENDING' as OutboxItemStatus,
          permanentFailure: false,
          updatedAt: new Date().toISOString(),
        };
      }
      return it;
    });

    set({ items });
    await storage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(items));
    get().processOutbox();
  },

  discardItem: async (id: string) => {
    const items = get().items.filter((it) => it.id !== id);
    set({ items });
    await storage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(items));
  },

  clearSynced: async () => {
    const items = get().items.filter((it) => it.status !== 'SYNCED');
    set({ items });
    await storage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(items));
  },

  getPendingCount: () => {
    return get().items.filter((it) => it.status === 'PENDING' || it.status === 'SYNCING').length;
  },

  getFailedItems: () => {
    return get().items.filter((it) => it.status === 'FAILED');
  },
}));
