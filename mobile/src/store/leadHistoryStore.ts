import { create } from 'zustand';
import { Activity, User } from '../types';
import { storage } from '../utils/storage';
import { fetchUserActivities } from '../api/leadApi';

const HISTORY_STORAGE_KEY = 'tele_crm_lead_history_v3';

export const normalizePhone = (phone?: string): string => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

/**
 * Deduplicates activities for the same phone call attempt within a 5-minute window.
 * Prioritizes persistent MongoDB server IDs over ephemeral local IDs.
 */
export const deduplicateActivities = (activities: Activity[]): Activity[] => {
  if (!activities || activities.length <= 1) return activities || [];

  const sorted = [...activities].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const result: Activity[] = [];

  for (const act of sorted) {
    if (!act || !act._id) continue;
    const phone = normalizePhone(act.phone);
    const actTime = new Date(act.createdAt).getTime();

    // Stable Identity Match (P3.1): Match on idempotencyKey or callLogId first
    const existingIndex = result.findIndex((r) => {
      // 1. Direct same ID match
      if (act._id === r._id) return true;

      // 2. Exact match on idempotencyKey or callLogId
      if (act.idempotencyKey && r.idempotencyKey && act.idempotencyKey === r.idempotencyKey) {
        return true;
      }
      if (act.callLogId && r.callLogId && act.callLogId === r.callLogId) {
        return true;
      }

      // Reconcile local optimistic activity with its server persistent counterpart
      const isActLocal = act._id.startsWith('act-') || act._id.startsWith('local_') || act._id.startsWith('inc-');
      const isRLocal = r._id.startsWith('act-') || r._id.startsWith('local_') || r._id.startsWith('inc-');

      // If both are server activities or both are local activities, they are separate distinct calls - never merge!
      if (isActLocal === isRLocal) {
        return false;
      }

      // One is local optimistic and one is server: reconcile if within 15 seconds
      const rPhone = normalizePhone(r.phone);
      if (!phone || !rPhone || phone !== rPhone) return false;
      const actDir = (act as any).direction || 'OUTGOING';
      const rDir = (r as any).direction || 'OUTGOING';
      if (actDir !== rDir) return false;
      const rTime = new Date(r.createdAt).getTime();
      return Math.abs(actTime - rTime) <= 15000;
    });

    if (existingIndex >= 0) {
      const existing = result[existingIndex];
      const isActServer = !act._id.startsWith('act-') && act._id.length === 24;
      const isExistingServer = !existing._id.startsWith('act-') && existing._id.length === 24;

      const preferredId = isActServer ? act._id : existing._id;
      const preferredUserId = isActServer ? act.userId : existing.userId;

      result[existingIndex] = {
        ...existing,
        _id: preferredId,
        userId: preferredUserId,
        direction: existing.direction || act.direction,
        durationSeconds: Math.max(existing.durationSeconds || 0, act.durationSeconds || 0),
        connected: Boolean(existing.connected || act.connected),
        stage: existing.stage !== 'New' && existing.stage !== 'Dialing' ? existing.stage : act.stage,
        remark:
          existing.remark && existing.remark !== 'Agent opened phone dialer'
            ? existing.remark
            : act.remark,
      };
    } else {
      result.push(act);
    }
  }

  return result;
};

interface LeadHistoryStore {
  historyMap: Record<string, Activity[]>;
  isLoaded: boolean;
  loadHistory: () => Promise<void>;
  getHistoryForLead: (leadId: string, phone?: string) => Activity[];
  getAllActivities: (agentId?: string) => Activity[];
  getTodayActivities: (agentId?: string) => Activity[];
  getYesterdayActivities: (agentId?: string) => Activity[];
  getActivitiesForPeriod: (
    period: 'Today' | '7 Days' | '30 Days' | 'Custom',
    customDate?: string | null,
    agentId?: string,
  ) => Activity[];
  clearHistory: () => Promise<void>;
  logDialedCall: (data: {
    leadId?: string;
    phone: string;
    customerName?: string;
    agentName?: string;
    agentId?: string;
    branch?: string | null;
  }) => Activity;
  addActivity: (
    leadId: string,
    activityData: {
      phone?: string;
      customerName?: string;
      branch?: string | null;
      agentName?: string;
      agentId?: string;
      connected: boolean;
      type?: 'CALL' | 'UPDATE';
      direction?: 'OUTGOING' | 'INCOMING';
      stage: string;
      tag?: string | null;
      temperature?: 'HOT' | 'WARM' | 'COLD';
      remark?: string;
      followUpAt?: string | null;
      durationSeconds?: number;
      notConnectedReason?: any;
      idempotencyKey?: string | null;
      callLogId?: string | null;
      classificationReason?: string | null;
      dealAmount?: number | null;
      currency?: string | null;
      createdAt?: string;
    },
  ) => Activity;
  updateLeadName: (leadId: string, newName: string) => void;
}

export const useLeadHistoryStore = create<LeadHistoryStore>((set, get) => ({
  historyMap: {},
  isLoaded: false,

  loadHistory: async () => {
    try {
      const stored = await storage.getItem(HISTORY_STORAGE_KEY);
      if (stored) {
        const parsed: Record<string, Activity[]> = JSON.parse(stored);
        // Clean out any stale demo activities and collapse any duplicate entries
        const sanitized: Record<string, Activity[]> = {};
        for (const key of Object.keys(parsed)) {
          const list = parsed[key];
          if (Array.isArray(list)) {
            const valid = list.filter((act) => {
              if (!act || !act._id) return false;
              if (
                act._id.startsWith('act-john') ||
                act._id.startsWith('act-kavin') ||
                act._id.startsWith('act-101') ||
                act._id.startsWith('act-102') ||
                act._id.startsWith('act-501') ||
                act._id.startsWith('act-701')
              ) {
                return false;
              }
              return true;
            });
            const deduped = deduplicateActivities(valid);
            if (deduped.length > 0) {
              sanitized[key] = deduped;
            }
          }
        }
        set({ historyMap: sanitized, isLoaded: true });
      } else {
        set({ historyMap: {}, isLoaded: true });
      }

      // Background sync with MongoDB server activities
      fetchUserActivities()
        .then((serverActs) => {
          if (serverActs && serverActs.length > 0) {
            const currentMap = { ...get().historyMap };
            let hasNew = false;

            for (const act of serverActs) {
              const leadKey = act.leadId || `lead-${act._id}`;
              const normPhone = normalizePhone(act.phone);

              const mergeIntoList = (list: Activity[]): Activity[] => {
                const actTime = new Date(act.createdAt).getTime();
                const matchedIdx = list.findIndex((e) => {
                  if (e._id === act._id) return true;
                  const ePhone = normalizePhone(e.phone);
                  if (normPhone && ePhone && normPhone === ePhone) {
                    const eTime = new Date(e.createdAt).getTime();
                    return Math.abs(actTime - eTime) <= 300000;
                  }
                  return false;
                });

                if (matchedIdx >= 0) {
                  const updated = [...list];
                  updated[matchedIdx] = act;
                  return updated;
                }
                return [act, ...list];
              };

              // 1. Merge into leadKey list
              const existingLeadList = currentMap[leadKey] || [];
              currentMap[leadKey] = deduplicateActivities(mergeIntoList(existingLeadList));
              hasNew = true;

              // 2. Merge into phone list
              if (normPhone) {
                const existingPhoneList = currentMap[normPhone] || [];
                currentMap[normPhone] = deduplicateActivities(mergeIntoList(existingPhoneList));
              }
            }

            if (hasNew) {
              set({ historyMap: currentMap });
              storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(currentMap)).catch(() => {});
            }
          }
        })
        .catch(() => {});
    } catch {
      set({ historyMap: {}, isLoaded: true });
    }
  },

  clearHistory: async () => {
    set({ historyMap: {} });
    await storage.removeItem(HISTORY_STORAGE_KEY).catch(() => {});
  },

  getAllActivities: (agentId?: string): Activity[] => {
    const map = get().historyMap;
    const foundMap = new Map<string, Activity>();

    for (const key of Object.keys(map)) {
      const list = map[key];
      if (Array.isArray(list)) {
        for (const act of list) {
          if (act && act._id && !foundMap.has(act._id)) {
            if (agentId) {
              const uId = typeof act.userId === 'object' && act.userId ? (act.userId as any)._id : act.userId;
              const uName = typeof act.userId === 'object' && act.userId ? (act.userId as any).name : '';
              const uEmail = typeof act.userId === 'object' && act.userId ? (act.userId as any).email : '';
              const cleanAgentId = agentId.toLowerCase().trim();
              const match =
                (uId && String(uId).toLowerCase() === cleanAgentId) ||
                (uName && String(uName).toLowerCase() === cleanAgentId) ||
                (uEmail && String(uEmail).toLowerCase() === cleanAgentId) ||
                (act.agentId && String(act.agentId).toLowerCase() === cleanAgentId) ||
                (act.agentName && String(act.agentName).toLowerCase() === cleanAgentId);
              if (!match) continue;
            }
            foundMap.set(act._id, act);
          }
        }
      }
    }

    return deduplicateActivities(Array.from(foundMap.values()));
  },

  getTodayActivities: (agentId?: string): Activity[] => {
    const all = get().getAllActivities(agentId);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1;
    return all.filter((a) => {
      const t = new Date(a.createdAt).getTime();
      return t >= startOfToday && t <= endOfToday;
    });
  },

  getYesterdayActivities: (agentId?: string): Activity[] => {
    const all = get().getAllActivities(agentId);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    return all.filter((a) => {
      const t = new Date(a.createdAt).getTime();
      return t >= startOfYesterday && t < startOfToday;
    });
  },

  getActivitiesForPeriod: (
    period: 'Today' | '7 Days' | '30 Days' | 'Custom',
    customDate?: string | null,
    agentId?: string,
  ): Activity[] => {
    const all = get().getAllActivities(agentId);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1;

    if (period === 'Today') {
      return all.filter((a) => {
        const t = new Date(a.createdAt).getTime();
        return t >= startOfToday && t <= endOfToday;
      });
    } else if (period === '7 Days') {
      const sevenDaysAgo = startOfToday - 6 * 24 * 60 * 60 * 1000;
      return all.filter((a) => new Date(a.createdAt).getTime() >= sevenDaysAgo);
    } else if (period === '30 Days') {
      const thirtyDaysAgo = startOfToday - 29 * 24 * 60 * 60 * 1000;
      return all.filter((a) => new Date(a.createdAt).getTime() >= thirtyDaysAgo);
    } else if (period === 'Custom' && customDate) {
      const cd = new Date(customDate);
      const startOfCustom = new Date(cd.getFullYear(), cd.getMonth(), cd.getDate()).getTime();
      const endOfCustom = startOfCustom + 24 * 60 * 60 * 1000 - 1;
      return all.filter((a) => {
        const t = new Date(a.createdAt).getTime();
        return t >= startOfCustom && t <= endOfCustom;
      });
    }
    return all;
  },

  getHistoryForLead: (leadId: string, phone?: string): Activity[] => {
    const map = get().historyMap;
    const normPhone = normalizePhone(phone);
    const foundMap = new Map<string, Activity>();

    const addList = (list?: Activity[]) => {
      if (!list || !Array.isArray(list)) return;
      for (const act of list) {
        if (act && act._id && !foundMap.has(act._id)) {
          foundMap.set(act._id, act);
        }
      }
    };

    addList(map[leadId]);

    if (leadId.startsWith('fu-')) {
      addList(map[leadId.replace('fu-', 'lead-')]);
    } else if (leadId.startsWith('lead-')) {
      addList(map[leadId.replace('lead-', 'fu-')]);
    }

    if (normPhone) {
      addList(map[normPhone]);
      addList(map[`phone_${normPhone}`]);
      addList(map[`+91${normPhone}`]);
    }

    if (normPhone) {
      for (const key of Object.keys(map)) {
        const list = map[key];
        if (Array.isArray(list)) {
          for (const act of list) {
            if (act && act.phone && normalizePhone(act.phone) === normPhone) {
              if (!foundMap.has(act._id)) {
                foundMap.set(act._id, act);
              }
            }
          }
        }
      }
    }

    const all = Array.from(foundMap.values());
    return all.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  },

  logDialedCall: (data) => {
    const normPhone = normalizePhone(data.phone);
    const key = data.leadId || normPhone || `dial-${Date.now()}`;
    return get().addActivity(key, {
      phone: data.phone,
      customerName: data.customerName,
      agentName: data.agentName,
      agentId: data.agentId,
      branch: data.branch,
      connected: false,
      stage: 'Dialing',
      tag: 'WARM',
      temperature: 'WARM',
      durationSeconds: 0,
      remark: 'Agent opened phone dialer',
    });
  },

  addActivity: (leadId: string, data) => {
    const currentMap = get().historyMap;
    const agentName = data.agentName || 'Agent';
    const normPhone = normalizePhone(data.phone);

    const agentUser: User = {
      _id: data.agentId || 'u-agent',
      name: agentName,
      email: `${agentName.toLowerCase().replace(/\s+/g, '')}@company.com`,
      phone: '',
      role: 'AGENT',
      branch: data.branch || null,
      isActive: true,
      canReceiveLeads: true,
      createdAt: '',
      updatedAt: '',
    };

    const newActivity: Activity = {
      _id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      leadId,
      phone: normPhone || data.phone || undefined,
      customerName: data.customerName || undefined,
      branch: data.branch || null,
      campaignId: 'camp-1',
      userId: agentUser,
      type: data.type || 'UPDATE',
      direction: data.direction || 'OUTGOING',
      connected: data.connected,
      notConnectedReason: data.connected ? null : data.notConnectedReason,
      stage: data.stage,
      tag: data.tag || data.temperature || 'WARM',
      temperature: (data.temperature || data.tag || 'WARM') as any,
      remark: data.remark || null,
      followUpAt: data.followUpAt || null,
      durationSeconds: data.durationSeconds || 0,
      idempotencyKey: data.idempotencyKey || null,
      callLogId: data.callLogId || null,
      classificationReason: data.classificationReason || null,
      dealAmount: data.dealAmount ?? null,
      currency: data.currency || 'INR',
      answers: [],
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Look for existing activity for this same lead OR same phone number within 5 minutes (300,000 ms)
    const existingList = [
      ...(currentMap[leadId] || []),
      ...(normPhone && currentMap[normPhone] ? currentMap[normPhone] : []),
    ];

    // Match an existing in-progress placeholder ("Dialing") or exact idempotencyKey/callLogId
    const recentIndex = existingList.findIndex((a) => {
      if (!a) return false;
      // 1. Direct match on idempotencyKey or callLogId
      if (data.idempotencyKey && a.idempotencyKey && data.idempotencyKey === a.idempotencyKey) {
        return true;
      }
      if (data.callLogId && a.callLogId && data.callLogId === a.callLogId) {
        return true;
      }
      // 2. Only update if the existing entry was an in-progress placeholder ("Dialing")
      if (a.stage === 'Dialing') {
        const ageMs = Date.now() - new Date(a.createdAt).getTime();
        if (ageMs <= 600000) {
          const aDir = a.direction || 'OUTGOING';
          const targetDir = data.direction || 'OUTGOING';
          if (aDir === targetDir) {
            if (normPhone && a.phone && normalizePhone(a.phone) === normPhone) return true;
            if (leadId && a.leadId && a.leadId === leadId) return true;
          }
        }
      }
      return false;
    });

    let resultingActivity: Activity;
    const isUpdate = recentIndex >= 0;

    if (isUpdate) {
      const existing = existingList[recentIndex];
      resultingActivity = {
        ...existing,
        leadId: leadId || existing.leadId,
        phone: normPhone || existing.phone,
        customerName: data.customerName || existing.customerName,
        direction: data.direction || existing.direction || 'OUTGOING',
        stage: data.stage && data.stage !== 'Dialing' ? data.stage : existing.stage,
        tag: data.tag || data.temperature || existing.tag,
        temperature: (data.temperature || data.tag || existing.temperature) as any,
        remark: data.remark || existing.remark,
        followUpAt: data.followUpAt !== undefined ? data.followUpAt : existing.followUpAt,
        connected: data.connected !== undefined ? Boolean(data.connected || existing.connected) : existing.connected,
        durationSeconds: Math.max(existing.durationSeconds || 0, data.durationSeconds || 0),
        idempotencyKey: data.idempotencyKey || existing.idempotencyKey || null,
        callLogId: data.callLogId || existing.callLogId || null,
        classificationReason: data.classificationReason || existing.classificationReason || null,
        dealAmount: data.dealAmount !== undefined ? data.dealAmount : existing.dealAmount,
        currency: data.currency || existing.currency || 'INR',
        updatedAt: new Date().toISOString(),
      };
    } else {
      resultingActivity = newActivity;
    }

    const existingForLead = currentMap[leadId] || [];
    const updatedLeadActivities = deduplicateActivities(
      isUpdate
        ? existingForLead.map((a) => (a._id === resultingActivity._id ? resultingActivity : a))
        : [resultingActivity, ...existingForLead],
    );

    const updatedMap: Record<string, Activity[]> = {
      ...currentMap,
      [leadId]: updatedLeadActivities,
    };

    if (normPhone) {
      const existingForPhone = currentMap[normPhone] || [];
      const updatedPhoneActivities = deduplicateActivities(
        isUpdate
          ? existingForPhone.map((a) => (a._id === resultingActivity._id ? resultingActivity : a))
          : [resultingActivity, ...existingForPhone],
      );
      updatedMap[normPhone] = updatedPhoneActivities;
      updatedMap[`phone_${normPhone}`] = updatedPhoneActivities;
    }

    set({ historyMap: updatedMap });

    storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updatedMap)).catch(() => {});

    return resultingActivity;
  },

  updateLeadName: (leadId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const currentMap = { ...get().historyMap };
    let changed = false;
    for (const key of Object.keys(currentMap)) {
      currentMap[key] = currentMap[key].map((act) => {
        if (act.leadId === leadId || key === leadId) {
          changed = true;
          return { ...act, customerName: trimmed };
        }
        return act;
      });
    }
    if (changed) {
      set({ historyMap: currentMap });
      storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(currentMap)).catch(() => {});
    }
  },
}));
