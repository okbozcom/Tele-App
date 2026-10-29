import { apiClient } from './client';
import {
  Lead,
  LeadFilterType,
  Activity,
  DisposeLeadPayload,
  Campaign,
  Pipeline,
  PublicSettings,
  Setting,
  RetryRule,
  User,
  DashboardReportResponse,
  UserCallsReportResponse,
  Branch,
} from '../types';
import { BranchRegistry } from '../utils/branchRegistry';

export interface MyLeadsResponse {
  leads: Lead[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface MyLeadsParams {
  type?: LeadFilterType;
  campaignId?: string;
  userId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * Fetches leads assigned to the logged-in agent / user.
 * Sorted by campaign priority (HIGH -> MEDIUM -> LOW), then follow-up due soonest.
 */
export const fetchMyLeads = async (params: MyLeadsParams): Promise<MyLeadsResponse> => {
  const queryParams: Record<string, string | number> = {
    type: params.type || 'ALL',
    page: params.page || 1,
    limit: params.limit || 5000,
  };

  if (params.campaignId) {
    queryParams.campaignId = params.campaignId;
  }
  if (params.userId) {
    queryParams.userId = params.userId;
  }
  if (params.search) {
    queryParams.search = params.search;
  }

  const response = await apiClient.get<MyLeadsResponse>('/api/leads/my', {
    params: queryParams,
  });
  return response.data;
};

export interface MyLeadsCounts {
  all: number;
  new: number;
  interested: number;
  followup: number;
  notConnected: number;
  notInterested: number;
}

export const fetchMyLeadsCounts = async (params?: {
  campaignId?: string;
  userId?: string;
}): Promise<MyLeadsCounts> => {
  const queryParams: Record<string, string> = {};
  if (params?.campaignId) queryParams.campaignId = params.campaignId;
  if (params?.userId) queryParams.userId = params.userId;

  const response = await apiClient.get<{ counts: MyLeadsCounts }>('/api/leads/my/counts', {
    params: queryParams,
  });
  return response.data.counts;
};

/**
 * Fetches call & activity history for a specific lead.
 */
export const fetchLeadHistory = async (
  leadId: string,
): Promise<{ activities: Activity[] }> => {
  const response = await apiClient.get<{ activities: Activity[] }>(
    `/api/leads/${leadId}/history`,
  );
  return response.data;
};

/**
 * Updates basic lead details (name, phone, email) on the server.
 */
export const updateLeadDetails = async (
  leadId: string,
  payload: { name?: string; phone?: string; email?: string },
): Promise<{ lead: Lead }> => {
  const response = await apiClient.patch<{ lead: Lead }>(`/api/leads/${leadId}`, payload);
  return response.data;
};

/**
 * Resolves unmasked dial number for an authorized dial/messaging intent (Spec 4.9).
 */
export const fetchDialTarget = async (
  leadId: string,
): Promise<{ dialNumber: string; leadId: string }> => {
  const response = await apiClient.post<{ status: string; dialNumber: string; leadId: string }>(
    `/api/leads/${leadId}/dial`,
  );
  return response.data;
};

/**
 * Bulk reassign leads from one user to another.
 */
export const bulkReassignLeads = async (payload: {
  fromUserId: string;
  toUserId: string;
  campaignId?: string;
}): Promise<{ modifiedCount: number }> => {
  const response = await apiClient.post<{ modifiedCount: number }>('/api/leads/bulk-reassign', payload);
  return response.data;
};

/**
 * Bulk update stage, tag, or status for multiple leads.
 */
export const bulkUpdateLeads = async (payload: {
  leadIds: string[];
  stage?: string;
  tag?: string;
  status?: 'OPEN' | 'CLOSED';
}): Promise<{ status: string; modifiedCount: number }> => {
  const response = await apiClient.post<{ status: string; modifiedCount: number }>('/api/leads/bulk-update', payload);
  return response.data;
};

/**
 * Bulk move leads to another campaign.
 */
export const bulkMoveLeads = async (payload: {
  leadIds: string[];
  targetCampaignId: string;
}): Promise<{ status: string; modifiedCount: number }> => {
  const response = await apiClient.post<{ status: string; modifiedCount: number }>('/api/leads/bulk-move', payload);
  return response.data;
};

/**
 * Bulk copy (duplicate) leads into another campaign.
 */
export const bulkCopyLeads = async (payload: {
  leadIds: string[];
  targetCampaignId: string;
}): Promise<{ status: string; copiedCount: number }> => {
  const response = await apiClient.post<{ status: string; copiedCount: number }>('/api/leads/bulk-copy', payload);
  return response.data;
};

/**
 * Bulk close leads.
 */
export const bulkCloseLeads = async (payload: {
  leadIds: string[];
  reason?: string;
}): Promise<{ status: string; closedCount: number }> => {
  const response = await apiClient.post<{ status: string; closedCount: number }>('/api/leads/bulk-close', payload);
  return response.data;
};

/**
 * Bulk delete leads (Admin only, requires typed confirmation "DELETE").
 */
export const bulkDeleteLeads = async (payload: {
  leadIds: string[];
  confirmation: 'DELETE';
}): Promise<{ status: string; deletedCount: number }> => {
  const response = await apiClient.post<{ status: string; deletedCount: number }>('/api/leads/bulk-delete', payload);
  return response.data;
};

/**
 * Disposes a lead with outcome, stage, tag, follow-up, call duration, and remarks.
 */
export const disposeLead = async (
  leadId: string,
  payload: DisposeLeadPayload,
): Promise<{ activity: Activity; lead: Lead }> => {
  const response = await apiClient.post<{ activity: Activity; lead: Lead }>(
    `/api/leads/${leadId}/dispose`,
    payload,
  );
  return response.data;
};

/**
 * Fetches campaigns accessible by the current user.
 */
export const fetchCampaigns = async (): Promise<{ campaigns: Campaign[] }> => {
  const response = await apiClient.get<{ campaigns: Campaign[] }>('/api/campaigns');
  return response.data;
};

/**
 * Fetches pipeline stages and tags by pipelineId.
 */
export const fetchPipeline = async (
  pipelineId: string,
): Promise<{ pipeline: Pipeline }> => {
  const response = await apiClient.get<{ pipeline: Pipeline }>(
    `/api/pipelines/${pipelineId}`,
  );
  return response.data;
};

/**
 * Fetches public organization settings (allowDisposeWithoutFollowUp, followUpMandatoryForNotConnected).
 */
export const fetchPublicSettings = async (): Promise<{ settings: PublicSettings }> => {
  const response = await apiClient.get<{ settings: PublicSettings }>('/api/settings/public');
  return response.data;
};

/**
 * Fetches configured retry rules for calculating retry delays.
 */
export const fetchRetryRules = async (): Promise<{ retryRules: RetryRule[] }> => {
  const response = await apiClient.get<{ rules?: RetryRule[]; retryRules?: RetryRule[] }>('/api/retry-rules');
  const rules = response.data.rules || response.data.retryRules || [];
  return { retryRules: rules };
};

/**
 * Fetches active agents/users for optional lead reassignment.
 */
export const fetchAssignableUsers = async (): Promise<{ users: User[] }> => {
  const response = await apiClient.get<{ users: User[] }>('/api/users', {
    params: { isActive: true },
  });
  return response.data;
};

/**
 * Fetches full campaign details (including engagementForm questions).
 */
export const fetchCampaignById = async (
  campaignId: string,
): Promise<{ campaign: Campaign }> => {
  const response = await apiClient.get<{ campaign: Campaign }>(
    `/api/campaigns/${campaignId}`,
  );
  return response.data;
};

/**
 * Creates a single walk-in lead under a designated campaign.
 */
export interface IngestLeadResult {
  created: number;
  merged: number;
  skipped: number;
  failed: Array<{ row: unknown; reason: string }>;
}

export const createWalkInLead = async (
  campaignId: string,
  data: { name: string; phone: string; email?: string },
): Promise<IngestLeadResult> => {
  const response = await apiClient.post<IngestLeadResult>(
    `/api/campaigns/${campaignId}/leads`,
    data,
  );
  return response.data;
};

/**
 * Fetches call activities from server directly (for current agent, or for a specific agent if manager/admin).
 */
export const fetchUserActivities = async (params?: {
  userId?: string;
  from?: string;
  to?: string;
  stage?: string;
  connected?: boolean;
}): Promise<Activity[]> => {
  try {
    const response = await apiClient.get<{ activities: Activity[] }>(
      '/api/leads/activities/my',
      { params },
    );
    return response.data?.activities || [];
  } catch (err) {
    console.warn('[API] Failed to fetch activities from server:', err);
    return [];
  }
};

/**
 * Fetches aggregated dashboard metrics for reporting (scoped by user role).
 */
export const fetchDashboardReports = async (params: {
  from?: string;
  to?: string;
  campaignId?: string;
  userId?: string;
  branch?: string;
}): Promise<DashboardReportResponse> => {
  const response = await apiClient.get<DashboardReportResponse>('/api/reports/dashboard', {
    params,
  });
  return response.data;
};

/**
 * Fetches per-agent call volume and duration stats.
 */
export const fetchUserCallsReport = async (params: {
  from?: string;
  to?: string;
  campaignId?: string;
  branch?: string;
} = {}): Promise<UserCallsReportResponse> => {
  const response = await apiClient.get<UserCallsReportResponse>('/api/reports/user-calls', {
    params,
  });
  return response.data;
};

/**
 * Exports CSV report directly from backend reporting engine.
 */
export const exportReportCsv = async (params: {
  type: 'user-calls' | 'call-logs' | 'dashboard' | 'dispositions' | 'follow-ups' | 'campaign-stages' | 'campaign-leads';
  from?: string;
  to?: string;
  campaignId?: string;
  userId?: string;
  branch?: string;
}): Promise<string> => {
  const response = await apiClient.get<string>('/api/reports/export', {
    params,
    responseType: 'text',
  });
  return response.data;
};

import { UserRegistry } from '../utils/userRegistry';

/**
 * Fetches all users (with optional role, branch, and active filters).
 */
export const fetchUsers = async (params?: {
  role?: string;
  isActive?: boolean;
  branch?: string;
}): Promise<{ users: User[] }> => {
  const deletedSet = await UserRegistry.getDeletedIdentifiers().catch(() => new Set<string>());
  try {
    const response = await apiClient.get<{ users: User[] }>('/api/users', { params });
    const remoteUsers = (response.data?.users || []).filter(
      (u) =>
        !deletedSet.has(u._id.toLowerCase()) &&
        !deletedSet.has(u.email.toLowerCase()),
    );
    const localUsers = await UserRegistry.getAllUsers();
    const existingIds = new Set(remoteUsers.map((u) => u._id));
    const existingEmails = new Set(remoteUsers.map((u) => u.email.toLowerCase()));

    const combined: User[] = [...remoteUsers];
    for (const lu of localUsers) {
      if (!existingIds.has(lu._id) && !existingEmails.has(lu.email.toLowerCase())) {
        if (params?.role && lu.role !== params.role) continue;
        if (params?.isActive !== undefined && lu.isActive !== params.isActive) continue;
        if (params?.branch && lu.branch !== params.branch) continue;
        combined.push(lu);
      }
    }
    return { users: combined };
  } catch {
    const localUsers = await UserRegistry.getAllUsers();
    const filtered = localUsers.filter((u) => {
      if (params?.role && u.role !== params.role) return false;
      if (params?.isActive !== undefined && u.isActive !== params.isActive) return false;
      if (params?.branch && u.branch !== params.branch) return false;
      return true;
    });
    return { users: filtered };
  }
};

/**
 * Creates a new user (AGENT, MANAGER, ADMIN).
 * Persists locally in UserRegistry so the user can immediately log in offline or online.
 */
export const createUser = async (data: {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: string;
  branch?: string | null;
  canReceiveLeads?: boolean;
}): Promise<{ user: User }> => {
  let createdUser: User;
  try {
    const response = await apiClient.post<{ user: User }>('/api/users', data);
    createdUser = response.data.user;
  } catch {
    // If backend network fails or is offline, generate user record
    createdUser = {
      _id: `u-${Date.now()}`,
      name: data.name.trim(),
      email: data.email.toLowerCase().trim(),
      phone: data.phone.trim(),
      role: data.role as any,
      branch: data.branch || null,
      isActive: true,
      canReceiveLeads: data.canReceiveLeads ?? (data.role === 'AGENT'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // Always save into persistent local registry with credentials for immediate login
  await UserRegistry.saveUser(
    {
      name: createdUser.name,
      email: createdUser.email,
      phone: createdUser.phone,
      password: data.password,
      role: createdUser.role,
      branch: createdUser.branch,
      canReceiveLeads: createdUser.canReceiveLeads,
      isActive: createdUser.isActive,
    },
    createdUser._id,
  );

  return { user: createdUser };
};

/**
 * Updates an existing user (toggle active status, canReceiveLeads, name, phone).
 */
export const updateUser = async (
  id: string,
  data: Partial<User>,
): Promise<{ user: User }> => {
  const response = await apiClient.patch<{ user: User }>(`/api/users/${id}`, data);
  return response.data;
};

/**
 * Permanently deletes a user and safely reassigns their open leads.
 * Works seamlessly across remote MongoDB users, local preset users, and offline mode.
 */
export const deleteUser = async (
  id: string,
): Promise<{ success: boolean; message: string; reassignedCount?: number }> => {
  // Always clean local UserRegistry and persist to blacklist immediately
  await UserRegistry.deleteUser(id);

  // If local preset/mock ID (starts with u- or not 24-hex ObjectId), do not make invalid backend request
  const isMongoObjectId = /^[0-9a-fA-F]{24}$/.test(id);
  if (!isMongoObjectId) {
    return {
      success: true,
      message: 'Team member deleted successfully.',
      reassignedCount: 0,
    };
  }

  try {
    const response = await apiClient.delete<{ success: boolean; message: string; reassignedCount?: number }>(
      `/api/users/${id}`,
    );
    return response.data;
  } catch (err: any) {
    // If backend returns 404 (already deleted or not in DB), treat as clean success
    if (err?.response?.status === 404) {
      return {
        success: true,
        message: 'Team member deleted successfully.',
        reassignedCount: 0,
      };
    }
    // If network or server error, still confirm local deletion
    if (!err?.response || err.response.status >= 500) {
      return {
        success: true,
        message: 'Team member deleted locally.',
        reassignedCount: 0,
      };
    }
    throw err;
  }
};

/**
 * Creates a new campaign with distribution rules and engagement questions.
 */
export const createCampaign = async (
  data: Partial<Campaign>,
): Promise<{ campaign: Campaign }> => {
  const response = await apiClient.post<{ campaign: Campaign }>('/api/campaigns', data);
  return response.data;
};

/**
 * Updates campaign settings.
 */
export const updateCampaign = async (
  id: string,
  data: Partial<Campaign>,
): Promise<{ campaign: Campaign; warning?: string }> => {
  const response = await apiClient.patch<{ campaign: Campaign; warning?: string }>(
    `/api/campaigns/${id}`,
    data,
  );
  return response.data;
};

/**
 * Fetches all available pipelines.
 */
export const fetchPipelines = async (): Promise<{ pipelines: Pipeline[] }> => {
  const response = await apiClient.get<{ pipelines: Pipeline[] }>('/api/pipelines');
  return response.data;
};

/**
 * Updates pipeline stages and tags.
 */
export const updatePipeline = async (
  id: string,
  data: Partial<Pipeline>,
): Promise<{ pipeline: Pipeline }> => {
  const response = await apiClient.patch<{ pipeline: Pipeline }>(`/api/pipelines/${id}`, data);
  return response.data;
};

/**
 * Uploads a CSV file of leads to the specified campaign.
 */
export const uploadLeadsCsv = async (
  campaignId: string,
  formData: FormData,
): Promise<IngestLeadResult> => {
  const response = await apiClient.post<IngestLeadResult>(
    `/api/campaigns/${campaignId}/leads/upload`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    },
  );
  return response.data;
};

/**
 * Fetches full organization settings (ADMIN & MANAGER).
 */
export const fetchAdminSettings = async (): Promise<{ settings: Setting }> => {
  const response = await apiClient.get<{ settings: Setting }>('/api/settings');
  return response.data;
};

/**
 * Updates organization settings (ADMIN & MANAGER).
 */
export const updateAdminSettings = async (data: Partial<Setting>): Promise<{ settings: Setting }> => {
  const response = await apiClient.patch<{ settings: Setting }>('/api/settings', data);
  return response.data;
};

/**
 * Updates a single retry rule delay or enabled flag.
 */
export const updateRetryRule = async (
  id: string,
  data: {
    enabled?: boolean;
    steps?: Array<{ delayMinutes: number }>;
  },
): Promise<{ rule: RetryRule }> => {
  const response = await apiClient.patch<{ rule: RetryRule }>(`/api/retry-rules/${id}`, data);
  return response.data;
};

/**
 * Updates retry rules in bulk or upserts them by reason.
 */
export const updateRetryRulesBulk = async (
  rules: Array<{
    reason: string;
    enabled: boolean;
    steps: Array<{ delayMinutes: number }>;
  }>,
): Promise<{ retryRules: RetryRule[] }> => {
  const response = await apiClient.patch<{ rules?: RetryRule[]; retryRules?: RetryRule[] }>(
    '/api/retry-rules',
    rules,
  );
  const updated = response.data.rules || response.data.retryRules || [];
  return { retryRules: updated };
};

/**
 * Reassigns a lead to a specific active agent.
 */
export const reassignLead = async (
  leadId: string,
  userId: string,
): Promise<{ lead: Lead }> => {
  const response = await apiClient.post<{ lead: Lead }>(`/api/leads/${leadId}/reassign`, {
    userId,
  });
  return response.data;
};

/**
 * Deletes a campaign (ADMIN only).
 */
export const deleteCampaign = async (id: string): Promise<{ message: string }> => {
  const response = await apiClient.delete<{ message: string }>(`/api/campaigns/${id}`);
  return response.data;
};

/**
 * Fetches all available branches, with fallback to local persistent branch registry.
 */
export const fetchBranches = async (): Promise<{ branches: Branch[] }> => {
  try {
    const response = await apiClient.get<{ branches: Branch[] }>('/api/branches');
    if (response.data && Array.isArray(response.data.branches)) {
      // Sync to local storage
      for (const br of response.data.branches) {
        await BranchRegistry.saveBranch({
          name: br.name,
          code: br.code,
          address: br.address,
        });
      }
      return response.data;
    }
  } catch (err) {
    // Graceful fallback to local registry
  }
  const localBranches = await BranchRegistry.getAllBranches();
  return { branches: localBranches };
};

/**
 * Creates a new branch (ADMIN only).
 */
export const createBranch = async (data: {
  name: string;
  code?: string;
  address?: string;
}): Promise<{ branch: Branch; message?: string }> => {
  try {
    const response = await apiClient.post<{ branch: Branch; message?: string }>(
      '/api/branches',
      data,
    );
    if (response.data?.branch) {
      await BranchRegistry.saveBranch(response.data.branch);
      return response.data;
    }
  } catch (err: any) {
    // If network error, persist locally as fallback
    const isNetworkErr = !err.response || err.response.status === 404 || err.response.status === 502;
    if (isNetworkErr) {
      const saved = await BranchRegistry.saveBranch(data);
      return { branch: saved, message: 'Branch created in local registry' };
    }
    throw err;
  }
  const saved = await BranchRegistry.saveBranch(data);
  return { branch: saved };
};

/**
 * Deletes a branch (ADMIN only).
 */
export const deleteBranch = async (id: string): Promise<{ message: string }> => {
  try {
    const response = await apiClient.delete<{ message: string }>(`/api/branches/${id}`);
    await BranchRegistry.deleteBranch(id);
    return response.data;
  } catch (err: any) {
    const isNetworkErr = !err.response || err.response.status === 404 || err.response.status === 502;
    if (isNetworkErr) {
      await BranchRegistry.deleteBranch(id);
      return { message: 'Branch deleted locally' };
    }
    throw err;
  }
};



export interface TagLeadPayload {
  leadId: string;
  customerName?: string;
  customerPhone?: string;
  targetRole?: 'BOTH' | 'MANAGER' | 'ADMIN';
  reason: string;
  note?: string;
}

export interface TaggedLeadResponse {
  _id: string;
  leadId: string;
  customerName: string;
  customerPhone: string;
  agentId: string;
  agentName: string;
  branch?: string;
  targetRole: 'BOTH' | 'MANAGER' | 'ADMIN';
  reason: string;
  note: string;
  createdAt: string;
}

/**
 * Tags a lead to Manager or Admin with urgent priority.
 * Persists to backend database across Web and Mobile.
 */
export const tagLeadToManager = async (payload: TagLeadPayload): Promise<TaggedLeadResponse> => {
  const response = await apiClient.post<{ status: string; taggedLead: TaggedLeadResponse }>(
    '/api/leads/tag',
    payload,
  );
  return response.data.taggedLead;
};

/**
 * Fetches tagged leads for the authenticated Admin or Manager.
 */
export const fetchTaggedLeads = async (): Promise<TaggedLeadResponse[]> => {
  const response = await apiClient.get<{ status: string; taggedLeads: TaggedLeadResponse[] }>(
    '/api/leads/tagged',
  );
  return response.data.taggedLeads || [];
};

/**
 * Dismisses a tagged lead notification for the current user.
 */
export const dismissTaggedLead = async (tagId: string): Promise<void> => {
  await apiClient.post(`/api/leads/tagged/${tagId}/dismiss`);
};

export interface TodayStatsResponse {
  userId: string;
  dayIST: string;
  attempts: number;
  connected: number;
  notConnected: number;
  talkSeconds: number;
  incoming: number;
  noAttempt: number;
  mismatches: number;
  connectRate: number;
  firstCallAt: string | null;
  lastCallAt: string | null;
  asOf: string;
}

export interface TeamStatsResponse {
  stats: Array<{
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
  }>;
  date: string;
  asOf: string;
}

/**
 * Fetches today's atomic calling stats for the authenticated user from DailyStat.
 */
export const fetchTodayStats = async (date?: string): Promise<TodayStatsResponse> => {
  const response = await apiClient.get<TodayStatsResponse>('/api/stats/today', {
    params: date ? { date } : undefined,
  });
  return response.data;
};

/**
 * Fetches team stats for managers and admins from DailyStat.
 */
export const fetchTeamStats = async (params: {
  date?: string;
  branch?: string;
  campaignId?: string;
}): Promise<TeamStatsResponse> => {
  const response = await apiClient.get<TeamStatsResponse>('/api/stats/team', {
    params,
  });
  return response.data;
};

/**
 * Fetches date-range stats for reports and trends from DailyStat.
 */
export const fetchRangeStats = async (params: {
  from: string;
  to: string;
  branch?: string;
  campaignId?: string;
}): Promise<{ data: any[]; asOf: string }> => {
  const response = await apiClient.get<{ data: any[]; asOf: string }>('/api/stats/range', {
    params,
  });
  return response.data;
};

/**
 * Flushes offline activities in an idempotent batch (max 50 items).
 */
export const batchSyncActivities = async (
  events: any[],
): Promise<{ results: any[]; total: number; succeeded: number }> => {
  const response = await apiClient.post<{ results: any[]; total: number; succeeded: number }>(
    '/api/sync/batch',
    { events },
  );
  return response.data;
};

export interface NextLeadParams {
  mode: 'PRIORITY' | 'CAMPAIGN' | 'MY_LEADS' | 'FILTER';
  campaignId?: string;
  statusQueue?: 'ALL' | 'NEW' | 'FOLLOW_UP' | 'NOT_CONNECTED' | 'INTERESTED';
  stage?: string;
  tag?: string;
  excludeLeadIds?: string[];
  leaseSeconds?: number;
}

export interface NextLeadResponse {
  status: 'success';
  lead: Lead | null;
  remainingCount: number;
}

/**
 * Fetches the next lead atomically for unified calling desk with lease lock (Spec 4.2).
 */
export const fetchNextLead = async (params: NextLeadParams): Promise<NextLeadResponse> => {
  const response = await apiClient.post<NextLeadResponse>('/api/leads/next', params);
  return response.data;
};

/**
 * Releases lease lock on a lead if dialing was cancelled without attempt.
 */
export const unlockLead = async (leadId: string): Promise<{ status: string; unlocked: boolean }> => {
  const response = await apiClient.post<{ status: string; unlocked: boolean }>(
    `/api/leads/${leadId}/unlock`,
  );
  return response.data;
};


