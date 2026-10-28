import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Alert,
  AppState,
  AppStateStatus,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Phone,
  PhoneOff,
  Clock,
  Clock3,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  ChevronDown,
  PhoneCall,
  Plus,
  LayoutGrid,
  CheckCircle2,
  Calendar,
  MessageCircle,
  Target,
  Sparkles,
  Flame,
  Sun,
  Snowflake,
  FileEdit,
  Check,
  SkipForward,
  RotateCcw,
  CalendarClock,
  ListOrdered,
  MapPin,
  Building2,
  Megaphone,
  UserPlus,
  BarChart2,
} from 'lucide-react-native';

import { useAuthStore } from '../store/authStore';
import { useCampaignStore } from '../store/campaignStore';
import { useLeadHistoryStore, deduplicateActivities } from '../store/leadHistoryStore';
import { useNotificationStore } from '../store/notificationStore';
import { callSession } from '../services/callSession';
import { incomingCallSyncService } from '../services/incomingCallSync.service';
import {
  fetchDashboardReports,
  fetchUserCallsReport,
  fetchMyLeads,
  fetchCampaigns,
  fetchBranches,
  MyLeadsResponse,
} from '../api/leadApi';
import { RootStackParamList, Lead } from '../types';
import { colors, borderRadius, shadows } from '../theme';
import { CrmShell } from '../components/CrmShell';
import { ReportingPeriod } from '../components/PeriodControl';
import { LeadQuickModal } from '../components/LeadQuickModal';
import { CrmDateTimePickerModal } from '../components/CrmDateTimePickerModal';
import { WhatsAppTemplateModal } from '../components/WhatsAppTemplateModal';
import { callService } from '../services/call.service';
import { getDialerTelUrl, formatDisplayPhone, isLeadLostOrSuppressed } from '../utils/phoneUtils';
import { toast } from '../store/toastStore';
import { storage } from '../utils/storage';
import { ErrorBoundary } from '../components/ErrorBoundary';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Helper to get safe initials from name (Zero crash)
const getInitials = (name?: string, fallback = 'LD'): string => {
  if (!name) return fallback;
  const clean = name.trim();
  if (!clean) return fallback;
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return (clean.slice(0, 2) || fallback).toUpperCase();
};

// ======================================================================
// DESIGN TOKENS
// Single source of truth so every card/box shares the same rhythm
// instead of each block inventing its own padding/radius/shadow.
// ======================================================================
const T = {
  radius: { sm: 8, md: 12, lg: 16 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 },
  color: {
    bg: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceSunken: '#F8FAFC',
    border: '#E7EAEE',
    borderStrong: '#D7DCE3',
    text: '#111827',
    textMuted: '#6B7280',
    textFaint: '#9CA3AF',
    primary: '#0F9D58',
    primaryDark: '#0B7A44',
    primaryTint: '#E6F4EA',
    danger: '#DC2626',
    dangerTint: '#FEF2F2',
    info: '#2563EB',
    infoTint: '#EFF6FF',
    warn: '#D97706',
    warnTint: '#FFFBEB',
  },
  shadowCard: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  shadowHero: {
    shadowColor: '#0F9D58',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
};

const HomeScreenContent: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { selectedCampaignId, selectedCampaignName } = useCampaignStore();
  const { width } = useWindowDimensions();
  const isWide = width >= 860;

  const isAgent = user?.role === 'AGENT';
  const isManagerOrAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const isAdmin = user?.role === 'ADMIN';

  // Scope: 'MY' (personal calls dialed by logged-in user) vs 'TEAM' (overall team calls)
  const [callScope, setCallScope] = useState<'MY' | 'TEAM'>(
    user?.role === 'AGENT' ? 'MY' : 'TEAM',
  );

  const [period, setPeriod] = useState<ReportingPeriod>('Today');
  const [customDate, setCustomDate] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [selectedBranch, setSelectedBranch] = useState<string>(
    user?.role === 'AGENT' && user?.branch ? user.branch : 'ALL',
  );
  const [selectedLeadForQuickModal, setSelectedLeadForQuickModal] = useState<Lead | null>(null);
  const [skippedLeadIds, setSkippedLeadIds] = useState<string[]>([]);

  // Fetch branches from backend / local registry
  const { data: branchesData } = useQuery({
    queryKey: ['branchesList'],
    queryFn: fetchBranches,
  });

  const availableBranches = useMemo(() => {
    const list: { label: string; value: string }[] = [{ label: 'All Branches', value: 'ALL' }];
    const registered = branchesData?.branches || [];
    const seen = new Set<string>(['all']);

    for (const b of registered) {
      if (b.name && !seen.has(b.name.trim().toLowerCase())) {
        seen.add(b.name.trim().toLowerCase());
        list.push({ label: b.name.trim(), value: b.name.trim() });
      }
    }

    const defaults = ['Trichy', 'Pudukkottai', 'Coimbatore', 'Chennai', 'Madurai'];
    for (const d of defaults) {
      if (!seen.has(d.toLowerCase())) {
        seen.add(d.toLowerCase());
        list.push({ label: d, value: d });
      }
    }
    return list;
  }, [branchesData]);

  // NeoDove Segmented Tab: Queue vs Callbacks vs Today's Calls vs Team
  const [activeTab, setActiveTab] = useState<'queue' | 'callbacks' | 'calls' | 'team'>('queue');
  const [dashboardSubTab, setDashboardSubTab] = useState<'QUEUES' | 'LOGIN_REPORT' | 'CALL_REPORT'>('QUEUES');

  // WhatsApp Modal State
  const [whatsAppTarget, setWhatsAppTarget] = useState<{ name: string; phone: string } | null>(null);

  // Automatic Call Detection State & Refs
  const isCallingRef = useRef<boolean>(false);
  const callStartTimeRef = useRef<number | null>(null);
  const callingLeadRef = useRef<Lead | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const effectiveBranch: string =
    user?.role === 'MANAGER' && user?.branch
      ? user.branch
      : user?.role === 'AGENT' && user?.branch
      ? user.branch
      : selectedBranch;

  const handleConfirmCustomDate = (isoStr: string) => {
    setCustomDate(isoStr);
    setPeriod('Custom');
    setShowDatePicker(false);
  };

  const customDateLabel = customDate
    ? new Date(customDate).toLocaleDateString([], { month: 'short', day: 'numeric' })
    : 'Date';

  // Stable, normalized ISO 'from' and 'to' date boundaries for backend queries
  const { fromDate, toDate } = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (period === 'Today') {
      return { fromDate: todayStart.toISOString(), toDate: todayEnd.toISOString() };
    }
    if (period === '7 Days') {
      const start7 = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
      return { fromDate: start7.toISOString(), toDate: todayEnd.toISOString() };
    }
    if (period === '30 Days') {
      const start30 = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);
      return { fromDate: start30.toISOString(), toDate: todayEnd.toISOString() };
    }
    if (period === 'Custom' && customDate) {
      const cd = new Date(customDate);
      const customStart = new Date(cd.getFullYear(), cd.getMonth(), cd.getDate(), 0, 0, 0, 0);
      const customEnd = new Date(cd.getFullYear(), cd.getMonth(), cd.getDate(), 23, 59, 59, 999);
      return { fromDate: customStart.toISOString(), toDate: customEnd.toISOString() };
    }
    return { fromDate: todayStart.toISOString(), toDate: todayEnd.toISOString() };
  }, [period, customDate]);

  // 1. Dashboard Metrics from Backend (optimized polling: 45s)
  const queryUserId = !isAgent && callScope === 'TEAM' ? undefined : user?._id;

  const {
    data: dashboardData,
    isLoading: isDashboardLoading,
    refetch: refetchDashboard,
    isRefetching: isDashboardRefetching,
  } = useQuery({
    queryKey: ['homeDashboard', period, fromDate, toDate, selectedCampaignId, queryUserId, effectiveBranch],
    queryFn: () =>
      fetchDashboardReports({
        from: fromDate,
        to: toDate,
        campaignId: selectedCampaignId || undefined,
        userId: queryUserId,
        branch: effectiveBranch !== 'ALL' ? effectiveBranch : undefined,
      }),
    refetchInterval: 45000,
    refetchIntervalInBackground: false,
    staleTime: 30000,
  });

  // 2. Per-Agent Calls (Manager & Admin only, optimized polling: 45s)
  const {
    data: userCallsData,
    isLoading: isUserCallsLoading,
    refetch: refetchUserCalls,
    isRefetching: isUserCallsRefetching,
  } = useQuery({
    queryKey: ['homeUserCalls', period, fromDate, toDate, selectedCampaignId, effectiveBranch],
    queryFn: () =>
      fetchUserCallsReport({
        from: fromDate,
        to: toDate,
        campaignId: selectedCampaignId || undefined,
        branch: effectiveBranch !== 'ALL' ? effectiveBranch : undefined,
      }),
    enabled: isManagerOrAdmin,
    refetchInterval: 45000,
    refetchIntervalInBackground: false,
    staleTime: 30000,
  });

  // Instant Offline / Cold-Start Cache State (user-scoped to prevent stale leakage)
  const [cachedLeadsData, setCachedLeadsData] = useState<MyLeadsResponse | null>(null);
  const userLeadsCacheKey = user?._id
    ? `tele_crm_my_leads_cache_v2_${user._id}`
    : 'tele_crm_my_leads_cache_v2';

  useEffect(() => {
    incomingCallSyncService.syncIncomingCalls().catch(() => {});
    storage.getItem(userLeadsCacheKey).then((saved) => {
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed && Array.isArray(parsed.leads)) {
            setCachedLeadsData(parsed);
          }
        } catch {}
      }
    });
  }, [userLeadsCacheKey]);

  // 3. Agent's Prioritized Queue (auto-polls every 45s for newly assigned leads)
  const {
    data: myLeadsData,
    isLoading: isMyLeadsLoading,
    refetch: refetchMyLeads,
    isRefetching: isMyLeadsRefetching,
  } = useQuery({
    queryKey: ['homeMyLeadsQueue', selectedCampaignId, callScope, user?._id],
    queryFn: () =>
      fetchMyLeads({
        type: 'ALL',
        campaignId: selectedCampaignId || undefined,
        userId: !isAgent && callScope === 'MY' && user?._id ? String(user._id) : undefined,
        limit: 5000,
      }),
    refetchInterval: 45000,
    refetchIntervalInBackground: false,
    staleTime: 1000 * 60 * 3, // 3 minutes cache TTL
  });

  useEffect(() => {
    if (myLeadsData && Array.isArray(myLeadsData.leads)) {
      setCachedLeadsData(myLeadsData);
      storage.setItem(userLeadsCacheKey, JSON.stringify(myLeadsData)).catch(() => {});
    }
  }, [myLeadsData, userLeadsCacheKey]);

  const effectiveMyLeadsData = myLeadsData || cachedLeadsData;

  // 4. Subscribe to Zustand Local Activity Store (Guarantees Instant Re-render on call)
  const historyMap = useLeadHistoryStore((s) => s.historyMap);
  const { getActivitiesForPeriod } = useLeadHistoryStore();
  const periodActivities = useMemo(() => {
    return getActivitiesForPeriod(period, customDate, user?._id || user?.name);
  }, [historyMap, period, customDate, user, getActivitiesForPeriod]);

  const periodCallActivities = useMemo(() => {
    const rawCalls = periodActivities.filter((activity) => activity.type === 'CALL');
    const calls = deduplicateActivities(rawCalls);
    if (effectiveBranch === 'ALL') return calls;
    const target = effectiveBranch.trim().toLowerCase();
    return calls.filter((activity) => {
      const b = (activity as any).branch;
      if (b) return b.trim().toLowerCase() === target;
      const l = (effectiveMyLeadsData?.leads || []).find((lead) => lead._id === activity.leadId);
      if (l?.branch) return l.branch.trim().toLowerCase() === target;
      return false;
    });
  }, [periodActivities, effectiveBranch, effectiveMyLeadsData]);

  // Overall Agent Calls List for Manager & Admin
  const agentCallsList = useMemo(() => {
    const list = userCallsData?.agents || [];
    if (effectiveBranch === 'ALL') return list;
    const target = effectiveBranch.trim().toLowerCase();
    return list.filter(
      (a) => (a.branch || '').trim().toLowerCase() === target,
    );
  }, [userCallsData, effectiveBranch]);

  // Alert for newly assigned leads
  const [assignedLeadAlert, setAssignedLeadAlert] = useState<{
    id: string;
    count: number;
    assignedBy: string;
    campaignName: string;
    timestamp: string;
  } | null>(null);

  useEffect(() => {
    if (!isAgent) return;
    const checkAssignedNotifications = async () => {
      try {
        const raw = await storage.getItem('tele_crm_assigned_lead_notifications');
        if (raw) {
          const list = JSON.parse(raw);
          const relevant = list.find((item: any) => {
            const readBy = item.readBy || [];
            if (readBy.includes(user?._id || user?.email)) return false;
            if (!item.targetAgentId || item.targetAgentId === 'null') return true;
            return (
              item.targetAgentId === user?._id ||
              item.targetAgentName?.toLowerCase() === user?.name?.toLowerCase() ||
              item.targetAgentId === user?.email
            );
          });
          if (relevant) {
            setAssignedLeadAlert(relevant);
            toast.info(
              `${relevant.assignedBy || 'Admin'} has assigned ${relevant.count} new leads to your queue!`,
              'New Numbers Assigned',
              5000,
            );
          }
        }
      } catch (err) {
        console.warn('Failed to check assigned notifications:', err);
      }
    };
    checkAssignedNotifications();
  }, [isAgent, user]);

  const handleDismissAssignedAlert = async () => {
    if (!assignedLeadAlert) return;
    try {
      const raw = await storage.getItem('tele_crm_assigned_lead_notifications');
      if (raw) {
        const list = JSON.parse(raw);
        const updated = list.map((item: any) => {
          if (item.id === assignedLeadAlert.id) {
            const readBy = item.readBy || [];
            return { ...item, readBy: [...readBy, user?._id || user?.email] };
          }
          return item;
        });
        await storage.setItem('tele_crm_assigned_lead_notifications', JSON.stringify(updated));
      }
    } catch {}
    setAssignedLeadAlert(null);
  };

  // Format Talk Time seconds into MM:SS
  const formatSeconds = (totalSec: number) => {
    if (!totalSec || isNaN(totalSec) || totalSec <= 0) return '00:00';
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const formatDurationHoursMinutes = (totalSec: number) => {
    if (!totalSec || isNaN(totalSec) || totalSec <= 0) return '00:00:00';
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `00:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const formatAvgDurationMins = (avgSec: number) => {
    if (!avgSec || isNaN(avgSec) || avgSec <= 0) return '0s';
    const mins = Math.floor(avgSec / 60);
    const secs = avgSec % 60;
    if (mins === 0) return `${secs}s`;
    if (secs === 0) return `${mins}m`;
    return `${mins}m ${secs}s`;
  };

  const bannerDateInfo = useMemo(() => {
    const today = new Date();
    if (period === '7 Days') {
      const startOfWeek = new Date(today.getTime() - 6 * 24 * 3600 * 1000);
      const fromStr = startOfWeek.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: '2-digit', year: 'numeric' });
      const toStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: '2-digit', year: 'numeric' });
      return {
        fromTo: `${fromStr}  →  ${toStr}`,
        duration: '7 days',
      };
    }
    if (period === '30 Days') {
      const startOfMonth = new Date(today.getTime() - 29 * 24 * 3600 * 1000);
      const fromStr = startOfMonth.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: '2-digit', year: 'numeric' });
      const toStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: '2-digit', year: 'numeric' });
      return {
        fromTo: `${fromStr}  →  ${toStr}`,
        duration: '30 days',
      };
    }
    if (period === 'Custom' && customDate) {
      const cd = new Date(customDate);
      const isToday = cd.toDateString() === today.toDateString();
      const yesterday = new Date(today.getTime() - 24 * 3600 * 1000);
      const isYesterday = cd.toDateString() === yesterday.toDateString();
      const dateStr = cd.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: '2-digit', year: 'numeric' });
      return {
        fromTo: dateStr,
        duration: isToday ? 'Today' : isYesterday ? 'Yesterday' : 'History',
      };
    }
    const todayStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: '2-digit', year: 'numeric' });
    return {
      fromTo: todayStr,
      duration: 'Today',
    };
  }, [period, customDate]);

  // Leads scoped by branch selection
  const allBranchFilteredLeads = useMemo(() => {
    const list = effectiveMyLeadsData?.leads || [];
    if (effectiveBranch === 'ALL') return list;
    const target = effectiveBranch.trim().toLowerCase();
    return list.filter((l) => (l.branch || '').trim().toLowerCase() === target);
  }, [myLeadsData, effectiveBranch]);

  // ==============================================================
  // REAL DYNAMIC METRICS CALCULATION (ZERO DELAY)
  // ==============================================================
  const myAssignedLeadsCount =
    effectiveBranch === 'ALL'
      ? (effectiveMyLeadsData?.total ?? (effectiveMyLeadsData?.leads?.length || 0))
      : allBranchFilteredLeads.length;

  // Calls made and connected (combines local session with backend reports)
  // P1.1: Strictly separate OUTBOUND cold dials from INBOUND callbacks to prevent metrics contamination
  const realLocalActivities = periodCallActivities.filter(
    (a) => a.stage !== 'Call Initiated' && a.stage !== 'Dialing',
  );
  const localOutboundActivities = realLocalActivities.filter((a) => a.direction !== 'INCOMING');
  const localInboundActivities = realLocalActivities.filter((a) => a.direction === 'INCOMING');

  const localCallsCount = localOutboundActivities.length;
  const localConnectedCount = localOutboundActivities.filter((a) => a.connected).length;
  const localTotalDuration = localOutboundActivities
    .filter((a) => a.connected)
    .reduce((sum, a) => sum + (a.durationSeconds || 0), 0);

  const localInboundCount = localInboundActivities.length;
  const localInboundConnectedCount = localInboundActivities.filter((a) => a.connected).length;

  // Reconciled Metrics:
  // Backend aggregated dashboard is the authoritative source of truth.
  // Optimistic local activities not yet reflected in backend (pending sync or local-only) are reconciled seamlessly.
  const hasBackendDashboard = dashboardData !== undefined && dashboardData !== null;
  const pendingOutboundActivities = localOutboundActivities.filter(
    (a) => (a as any).isPendingSync || (a._id && String(a._id).startsWith('act-local-')),
  );
  const pendingConnectedActivities = pendingOutboundActivities.filter((a) => a.connected);
  const pendingDuration = pendingConnectedActivities.reduce(
    (sum, a) => sum + (a.durationSeconds || 0),
    0,
  );

  const pendingInboundActivities = localInboundActivities.filter(
    (a) => (a as any).isPendingSync || (a._id && String(a._id).startsWith('act-local-')),
  );
  const pendingInboundConnected = pendingInboundActivities.filter((a) => a.connected);

  const callsMade = hasBackendDashboard
    ? (dashboardData.callsMade || 0) + pendingOutboundActivities.length
    : localCallsCount;

  const connectedCalls = hasBackendDashboard
    ? (dashboardData.connectedCalls || 0) + pendingConnectedActivities.length
    : localConnectedCount;

  const totalCallDurationSeconds = hasBackendDashboard
    ? (dashboardData.totalDurationSeconds || 0) + pendingDuration
    : localTotalDuration;

  const connectRatePercent = callsMade > 0 ? ((connectedCalls / callsMade) * 100).toFixed(0) + '%' : '0%';

  const inboundCallsCount = hasBackendDashboard
    ? (dashboardData.inboundCalls || 0) + pendingInboundActivities.length
    : localInboundCount;

  const inboundConnectedCount = hasBackendDashboard
    ? (dashboardData.inboundConnected || 0) + pendingInboundConnected.length
    : localInboundConnectedCount;

  const avgDurationSeconds =
    connectedCalls > 0 && totalCallDurationSeconds > 0
      ? Math.round(totalCallDurationSeconds / connectedCalls)
      : hasBackendDashboard
      ? (dashboardData.averageDurationSeconds || 0)
      : 0;
  const avgDurationFormatted = formatSeconds(avgDurationSeconds);

  // Dynamic daily call report grouped from real activity history
  const realDailyCallReports = useMemo(() => {
    const allUserActivities = (useLeadHistoryStore.getState().getAllActivities(user?._id) || [])
      .filter(
        (a) =>
          a.type === 'CALL' &&
          a.stage !== 'Call Initiated' &&
          a.stage !== 'Dialing' &&
          a.direction !== 'INCOMING',
      );

    const map = new Map<string, { attempted: number; connected: number; duration: number }>();
    const todayStr = `Today (${new Date().toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' })})`;
    map.set(todayStr, {
      attempted: callsMade,
      connected: connectedCalls,
      duration: totalCallDurationSeconds,
    });

    const today = new Date();
    for (const act of allUserActivities) {
      if (!act.createdAt) continue;
      const actDate = new Date(act.createdAt);
      const isToday =
        actDate.getDate() === today.getDate() &&
        actDate.getMonth() === today.getMonth() &&
        actDate.getFullYear() === today.getFullYear();

      if (!isToday) {
        const dateKey = actDate.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
        const existing = map.get(dateKey) || { attempted: 0, connected: 0, duration: 0 };
        existing.attempted += 1;
        if (act.connected) {
          existing.connected += 1;
        }
        existing.duration += act.durationSeconds || 0;
        map.set(dateKey, existing);
      }
    }

    return Array.from(map.entries()).map(([date, stats]) => {
      const rate = stats.attempted > 0 ? `${((stats.connected / stats.attempted) * 100).toFixed(0)}%` : '0%';
      return {
        date,
        attempted: stats.attempted,
        connected: stats.connected,
        duration: formatDurationHoursMinutes(stats.duration),
        connectRate: rate,
      };
    });
  }, [callsMade, connectedCalls, localTotalDuration, user?._id]);

  // Scheduled callbacks due today
  const todayDate = new Date();
  const startOfToday = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate()).getTime();
  const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1;

  const dueTodayFollowUps = useMemo(() => {
    return allBranchFilteredLeads.filter((l) => {
      if (isLeadLostOrSuppressed(l)) {
        return false;
      }
      if (!l.nextFollowUpAt) return false;
      const t = new Date(l.nextFollowUpAt).getTime();
      return t >= startOfToday && t <= endOfToday;
    });
  }, [allBranchFilteredLeads, startOfToday, endOfToday]);

  const callbacksDueTodayCount =
    hasBackendDashboard && dashboardData.followUpsDueToday !== undefined && effectiveBranch === 'ALL'
      ? dashboardData.followUpsDueToday
      : dueTodayFollowUps.length;

  // Sync Bell Icon in Notification Store
  useEffect(() => {
    useNotificationStore.getState().setTotalRemindersCount(callbacksDueTodayCount);
  }, [callbacksDueTodayCount]);

  // Daily target configuration
  const dailyTargetTotal = 30;
  const targetCompletedPercent = Math.min(100, Math.round((callsMade / dailyTargetTotal) * 100));

  // Immediate queue (prioritized: overdue/due follow-ups -> hot untouched -> new untouched -> contacted)
  const queueLeads = useMemo(() => {
    const raw = allBranchFilteredLeads.filter((l) => !isLeadLostOrSuppressed(l));
    const nowTime = Date.now();

    return [...raw].sort((a, b) => {
      const getPriorityRank = (lead: Lead): number => {
        // Tier 0: Follow-up is DUE NOW or OVERDUE
        if (lead.nextFollowUpAt) {
          const fu = new Date(lead.nextFollowUpAt).getTime();
          if (!isNaN(fu) && fu <= nowTime + 15 * 60 * 1000) {
            return 0;
          }
        }
        // Tier 1: HOT / HIGH priority uncontacted lead
        const isHot = lead.temperature === 'HOT' || (lead as any).priority === 'HOT' || (lead as any).priority === 'HIGH';
        const isUntouched = (!lead.attemptCount || lead.attemptCount === 0) && !lead.lastContactedAt;
        if (isHot && isUntouched) return 1;

        // Tier 2: Normal untouched lead
        if (isUntouched) return 2;

        // Tier 3: HOT / HIGH priority contacted lead
        if (isHot) return 3;

        // Tier 4: Future follow-up or standard contacted lead
        return 4;
      };

      const rankA = getPriorityRank(a);
      const rankB = getPriorityRank(b);
      if (rankA !== rankB) return rankA - rankB;

      // Tie-breakers within the same rank:
      if (rankA === 0) {
        // Earliest scheduled callback first
        const tA = a.nextFollowUpAt ? new Date(a.nextFollowUpAt).getTime() : 0;
        const tB = b.nextFollowUpAt ? new Date(b.nextFollowUpAt).getTime() : 0;
        return tA - tB;
      }

      if (rankA === 1 || rankA === 2) {
        // Newest created untouched lead first
        const cA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const cB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return cB - cA;
      }

      // Oldest contacted first (least recently contacted)
      const aTime = a.lastContactedAt ? new Date(a.lastContactedAt).getTime() : 0;
      const bTime = b.lastContactedAt ? new Date(b.lastContactedAt).getTime() : 0;
      return aTime - bTime;
    });
  }, [allBranchFilteredLeads]);

  // Hero Lead to Call (accounts for skipped leads in current session)
  const heroLead: Lead | null = useMemo(() => {
    if (queueLeads.length === 0) return null;
    const nonSkipped = queueLeads.filter((l) => !skippedLeadIds.includes(l._id));
    return nonSkipped.length > 0 ? nonSkipped[0] : queueLeads[0];
  }, [queueLeads, skippedLeadIds]);

  const nextInQueueLeads = useMemo(() => {
    if (!heroLead) return [];
    return queueLeads.filter((l) => l._id !== heroLead._id).slice(0, 5);
  }, [queueLeads, heroLead]);

  // NeoDove 3 Calling Queues (Strictly excludes Customer Lost / Not Interested)
  const newUnattemptedLeads = useMemo(() => {
    return allBranchFilteredLeads.filter(
      (l) => (!l.attemptCount || l.attemptCount === 0) && !isLeadLostOrSuppressed(l),
    );
  }, [allBranchFilteredLeads]);

  const followUpLeads = useMemo(() => {
    return allBranchFilteredLeads.filter(
      (l) =>
        (l.stage === 'Follow Up' || l.stage === 'Follow-up' || !!l.nextFollowUpAt) &&
        !isLeadLostOrSuppressed(l),
    );
  }, [allBranchFilteredLeads]);

  const notConnectedLeads = useMemo(() => {
    return allBranchFilteredLeads.filter(
      (l) =>
        (l.stage === 'Not connected' ||
          l.stage === 'NOT CONNECTED' ||
          (l.attemptCount && l.attemptCount > 0 && l.stage === 'New')) &&
        !isLeadLostOrSuppressed(l),
    );
  }, [allBranchFilteredLeads]);

  const handleStartCallingQueue = (targetQueue: Lead[], queueTitle: string) => {
    if (targetQueue.length === 0) {
      Alert.alert('Queue Empty', `No leads currently in "${queueTitle}".`);
      return;
    }
    const firstLead = targetQueue[0];
    navigation.navigate('LeadDetail', {
      lead: firstLead,
      queue: targetQueue,
      queueIndex: 0,
      initialTab: 'LEAD INFO',
    });
  };

  // ==============================================================
  // NATIVE CALLING & AUTOMATIC CALL DETECTION (Like NeoDove)
  // ==============================================================
  const handleDirectDial = async (leadItem: Lead) => {
    if (isCallingRef.current) {
      return;
    }

    const isSuppressed =
      leadItem.status === 'CLOSED' ||
      leadItem.stage === 'Not Interested' ||
      leadItem.stage === 'Closed' ||
      leadItem.stage === 'Lost';

    const executeDial = async () => {
      if (isCallingRef.current) return;
      isCallingRef.current = true;
      toast.info(`Calling ${leadItem.name}...`, 'Dialing');

      try {
        const queueIndex = queueLeads.findIndex((lead: Lead) => lead._id === leadItem._id);
        await callSession.startCall(leadItem, {
          queue: queueLeads,
          queueIndex: queueIndex >= 0 ? queueIndex : undefined,
          callerSource: 'QUEUE',
        });
      } catch (err) {
        Alert.alert('Call Error', 'Could not open phone dialer on this device.');
      } finally {
        setTimeout(() => {
          isCallingRef.current = false;
        }, 2000);
      }
    };

    if (isSuppressed) {
      if (isAgent) {
        Alert.alert(
          'Customer Suppressed',
          `${leadItem.name} is marked as not interested and cannot be called from the agent queue.`,
        );
        return;
      }

      Alert.alert(
        '⚠️ Customer Not Interested',
        `${leadItem.name} was marked as "${leadItem.stage || 'Not Interested'}". Calling again may cause customer irritation.\n\nAre you sure you want to dial anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Call Anyway', style: 'destructive', onPress: executeDial },
        ],
      );
      return;
    }

    await executeDial();
  };

  const handleOpenWhatsApp = (leadItem: Lead) => {
    setWhatsAppTarget({ name: leadItem.name, phone: leadItem.phone });
  };

  const handleSkipHeroLead = () => {
    if (!heroLead) return;
    setSkippedLeadIds((prev) => [...prev, heroLead._id]);
    toast.info(`Skipped ${heroLead.name}. Next lead loaded.`, 'Skipped');
  };

  const handleResetSkipped = () => {
    setSkippedLeadIds([]);
    toast.info('Skipped leads restored to queue', 'Queue Reset');
  };

  const isRefreshing = isDashboardRefetching || isUserCallsRefetching || isMyLeadsRefetching;

  const handleRefreshAll = () => {
    incomingCallSyncService.syncIncomingCalls().catch(() => {});
    refetchDashboard();
    refetchMyLeads();
    if (isManagerOrAdmin) {
      refetchUserCalls();
    }
  };

  const heroLeadInitials = getInitials(heroLead?.name, 'LD');

  const heroLeadCampaign =
    typeof heroLead?.campaign === 'object' && heroLead?.campaign?.name
      ? heroLead.campaign.name
      : 'General';

  const heroLeadTemp = (heroLead?.tag || 'WARM').toUpperCase();

  return (
    <CrmShell
      title="Calling Desk"
      headerIcon={<LayoutGrid size={15} color={T.color.textMuted} />}
      showBack={true}
      customSubtitleNode={
        <TouchableOpacity
          style={styles.campaignSwitch}
          onPress={() => navigation.navigate('CampaignSelect')}
          activeOpacity={0.7}
        >
          <Text style={styles.campaignSwitchText} numberOfLines={1}>
            {selectedCampaignName || 'All campaigns'}
          </Text>
          <ChevronDown size={14} color={T.color.textMuted} />
        </TouchableOpacity>
      }
      showPeriodControl
      period={period}
      onPeriodChange={(newP) => {
        if (newP === 'Custom') {
          setShowDatePicker(true);
        } else {
          setPeriod(newP);
        }
      }}
      customDateLabel={period === 'Custom' ? customDateLabel : undefined}
      onPickCustomDate={() => setShowDatePicker(true)}
      rightAction={
        isManagerOrAdmin ? (
          <TouchableOpacity
            style={styles.headerAddBtn}
            onPress={() => navigation.navigate('Campaigns')}
            activeOpacity={0.8}
          >
            <Plus size={13} color={T.color.primary} strokeWidth={2.5} />
            <Text style={styles.headerAddBtnText}>Campaign</Text>
          </TouchableOpacity>
        ) : null
      }
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefreshAll}
            colors={[T.color.primary]}
          />
        }
      >
        {/* 1. AGENT GREETING & STATUS BAR */}
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greetingText}>Hello, {user?.name || 'Caller'} 👋</Text>
            <Text style={styles.branchSubText}>
              {user?.branch ? `${user.branch} Branch` : 'Main Office'} · {isAgent ? 'Telecalling Desk' : user?.role || 'Admin'}
            </Text>
          </View>
          <View style={styles.statusBadge}>
            <View style={styles.liveGreenDot} />
            <Text style={styles.statusBadgeText}>Ready to Call</Text>
          </View>
        </View>

        {/* Assigned Leads Notification Alert Banner */}
        {isAgent && assignedLeadAlert && (
          <View style={styles.alertBanner}>
            <View style={styles.alertIconBubble}>
              <Sparkles size={15} color={T.color.info} />
            </View>
            <View style={{ flex: 1, paddingHorizontal: 10 }}>
              <Text style={styles.alertTitle}>New leads assigned</Text>
              <Text style={styles.alertSubtitle}>
                {assignedLeadAlert.count} new leads added by {assignedLeadAlert.assignedBy || 'Admin'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.alertBtn}
              onPress={() => {
                handleDismissAssignedAlert();
                navigation.navigate('MyLeads');
              }}
            >
              <Text style={styles.alertBtnText}>View</Text>
            </TouchableOpacity>
          </View>
        )}


        {/* =========================================================================
            PERFORMANCE SUMMARY — date banner + 2x2 metric grid, unified card
           ========================================================================= */}
        {/* =========================================================================
            PERFORMANCE SUMMARY — Modern executive dashboard metrics
           ========================================================================= */}
        <View style={styles.perfSummaryWrap}>
          {/* Scope Switcher for Admin / Manager: My Personal Calls vs Team Overview */}
          {isManagerOrAdmin && (
            <View style={styles.scopeSwitcherRow}>
              <TouchableOpacity
                style={[styles.scopeBtn, callScope === 'MY' && styles.scopeBtnActive]}
                onPress={() => setCallScope('MY')}
                activeOpacity={0.7}
              >
                <Text style={[styles.scopeBtnText, callScope === 'MY' && styles.scopeBtnTextActive]}>
                  My Personal Calls
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.scopeBtn, callScope === 'TEAM' && styles.scopeBtnActive]}
                onPress={() => setCallScope('TEAM')}
                activeOpacity={0.7}
              >
                <Text style={[styles.scopeBtnText, callScope === 'TEAM' && styles.scopeBtnTextActive]}>
                  Team Overview
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Top Combined Filter Bar: Branch Filter & Date Picker */}
          <View style={[styles.topControlCard, isWide && styles.topControlCardWide]}>
            {/* Branch / City Filter Horizontal Scroll (Admins & Managers Only - Agents are locked to assigned branch) */}
            {!isAgent && (
              <View style={styles.branchFilterSection}>
                <View style={styles.branchHeaderRow}>
                  <View style={styles.branchIconBadge}>
                    <Building2 size={13} color="#0D9488" strokeWidth={2.2} />
                  </View>
                  <Text style={styles.branchFilterLabel}>Branch</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.branchScrollList}
                >
                  {availableBranches.map((br) => {
                    const isSelected = effectiveBranch === br.value;
                    return (
                      <TouchableOpacity
                        key={br.value}
                        style={[styles.branchPill, isSelected && styles.branchPillActive]}
                        onPress={() => setSelectedBranch(br.value)}
                        activeOpacity={0.7}
                      >
                        <MapPin
                          size={11}
                          color={isSelected ? '#FFFFFF' : '#64748B'}
                          strokeWidth={isSelected ? 2.5 : 2}
                        />
                        <Text style={[styles.branchPillText, isSelected && styles.branchPillTextActive]}>
                          {br.label}
                        </Text>
                        {isSelected && <View style={styles.activeBranchDot} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Date Picker & Range Bar */}
            <TouchableOpacity
              style={styles.summaryDateBar}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.7}
            >
              <View style={styles.summaryDateBarLeft}>
                <View style={styles.calendarBubble}>
                  <Calendar size={13} color="#0F9D58" strokeWidth={2.5} />
                </View>
                <View>
                  <Text style={styles.summaryDateBarText}>{bannerDateInfo.fromTo}</Text>
                  {period === 'Custom' && (
                    <Text style={styles.summaryDateSubtext}>Tap to pick another date</Text>
                  )}
                </View>
              </View>
              <View style={styles.summaryDateRightRow}>
                <View style={[styles.summaryDurationChip, period === 'Custom' && styles.summaryDurationChipCustom]}>
                  <Text style={[styles.summaryDurationChipText, period === 'Custom' && styles.summaryDurationChipTextCustom]}>
                    {bannerDateInfo.duration}
                  </Text>
                </View>
                {period === 'Custom' && (
                  <TouchableOpacity
                    style={styles.resetDateBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      setPeriod('Today');
                      setCustomDate(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.resetDateBtnText}>Today</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          </View>

          {/* 4 Responsive Metric Cards Grid */}
          <View style={isWide ? styles.metricGridWide : styles.metricGridMobile}>
            {/* Card 1: Attempted (Blue Theme) */}
            <View style={[styles.modernStatCard, styles.statCardBlue, isWide ? { flex: 1 } : styles.modernStatCardMobile]}>
              <View style={styles.modernStatTop}>
                <Text style={[styles.modernStatLabel, { color: '#2563EB' }]}>Attempted</Text>
                <View style={[styles.modernStatIconWrap, { backgroundColor: '#DBEAFE' }]}>
                  <Phone size={14} color="#2563EB" strokeWidth={2.2} />
                </View>
              </View>
              <Text style={[styles.modernStatVal, { color: '#1D4ED8' }]}>{callsMade}</Text>
              <Text style={[styles.modernStatSub, { color: '#3B82F6' }]}>
                {inboundCallsCount > 0
                  ? `${callsMade} out • ${inboundCallsCount} in`
                  : (callScope === 'MY' ? 'My calls dialed' : 'Team calls dialed')}
              </Text>
            </View>

            {/* Card 2: Connected (Emerald Green Theme) */}
            <View style={[styles.modernStatCard, styles.statCardGreen, isWide ? { flex: 1 } : styles.modernStatCardMobile]}>
              <View style={styles.modernStatTop}>
                <Text style={[styles.modernStatLabel, { color: '#16A34A' }]}>Connected</Text>
                <View style={[styles.modernStatIconWrap, { backgroundColor: '#DCFCE7' }]}>
                  <PhoneCall size={14} color="#16A34A" strokeWidth={2.2} />
                </View>
              </View>
              <Text style={[styles.modernStatVal, { color: '#15803D' }]}>{connectedCalls}</Text>
              <Text style={[styles.modernStatSub, { color: '#16A34A' }]}>
                {callsMade > 0 ? `${Math.round((connectedCalls / callsMade) * 100)}% connect rate` : 'Ready to dial'}
              </Text>
            </View>

            {/* Card 3: Call Time (Amber/Gold Theme) */}
            <View style={[styles.modernStatCard, styles.statCardAmber, isWide ? { flex: 1 } : styles.modernStatCardMobile]}>
              <View style={styles.modernStatTop}>
                <Text style={[styles.modernStatLabel, { color: '#D97706' }]}>Call time</Text>
                <View style={[styles.modernStatIconWrap, { backgroundColor: '#FEF3C7' }]}>
                  <Clock3 size={14} color="#D97706" strokeWidth={2.2} />
                </View>
              </View>
              <Text style={[styles.modernStatVal, { color: '#B45309' }]} numberOfLines={1}>
                {formatDurationHoursMinutes(totalCallDurationSeconds)}
              </Text>
              <Text style={[styles.modernStatSub, { color: '#D97706' }]}>Active duration</Text>
            </View>

            {/* Card 4: Avg Duration (Purple/Violet Theme) */}
            <View style={[styles.modernStatCard, styles.statCardPurple, isWide ? { flex: 1 } : styles.modernStatCardMobile]}>
              <View style={styles.modernStatTop}>
                <Text style={[styles.modernStatLabel, { color: '#9333EA' }]}>Avg. duration</Text>
                <View style={[styles.modernStatIconWrap, { backgroundColor: '#F3E8FF' }]}>
                  <Clock size={14} color="#9333EA" strokeWidth={2.2} />
                </View>
              </View>
              <Text style={[styles.modernStatVal, { color: '#7E22CE' }]} numberOfLines={1}>
                {formatAvgDurationMins(avgDurationSeconds)}
              </Text>
              <Text style={[styles.modernStatSub, { color: '#9333EA' }]}>Per connected call</Text>
            </View>
          </View>
        </View>

        {/* Segmented Bottom Tabs: Calling Queues | Login Report | Call Report */}
        <View style={styles.segmentWrap}>
          <TouchableOpacity
            style={[styles.segmentBtn, dashboardSubTab === 'QUEUES' && styles.segmentBtnActive]}
            onPress={() => setDashboardSubTab('QUEUES')}
          >
            <Text style={[styles.segmentText, dashboardSubTab === 'QUEUES' && styles.segmentTextActive]}>
              Calling Queues
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, dashboardSubTab === 'LOGIN_REPORT' && styles.segmentBtnActive]}
            onPress={() => setDashboardSubTab('LOGIN_REPORT')}
          >
            <Text style={[styles.segmentText, dashboardSubTab === 'LOGIN_REPORT' && styles.segmentTextActive]}>
              Login Report
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, dashboardSubTab === 'CALL_REPORT' && styles.segmentBtnActive]}
            onPress={() => setDashboardSubTab('CALL_REPORT')}
          >
            <Text style={[styles.segmentText, dashboardSubTab === 'CALL_REPORT' && styles.segmentTextActive]}>
              Call Report
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content of Sub Tab */}
        {dashboardSubTab === 'CALL_REPORT' ? (
          <View style={{ gap: T.space.sm, marginBottom: T.space.lg }}>
            {realDailyCallReports.length > 0 ? (
              realDailyCallReports.map((day) => (
                <View key={day.date} style={styles.listCard}>
                  <View style={styles.listCardTopRow}>
                    <Text style={styles.listCardTitle}>{day.date}</Text>
                    <View style={styles.connectRatePill}>
                      <Text style={styles.connectRatePillText}>{day.connectRate} connected</Text>
                    </View>
                  </View>
                  <View style={styles.listCardStatsRow}>
                    <Text style={styles.listCardStatText}>
                      Attempted <Text style={styles.listCardStatStrong}>{day.attempted}</Text>
                    </Text>
                    <Text style={styles.listCardStatText}>
                      Connected <Text style={[styles.listCardStatStrong, { color: T.color.primaryDark }]}>{day.connected}</Text>
                    </Text>
                    <Text style={styles.listCardStatText}>
                      Duration <Text style={styles.listCardStatStrong}>{day.duration}</Text>
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.inlineEmptyCard}>
                <Text style={styles.inlineEmptyText}>No call activity recorded yet today</Text>
              </View>
            )}
          </View>
        ) : dashboardSubTab === 'LOGIN_REPORT' ? (
          <View style={{ gap: T.space.sm, marginBottom: T.space.lg }}>
            {((userCallsData?.agents && userCallsData.agents.length > 0)
              ? userCallsData.agents
              : user ? [user] : []
            ).map((u: any) => {
              const uName = u.name || 'Agent';
              const uBranch = u.branch ? `${u.branch} Branch` : 'General';
              const uRole = u.role || 'AGENT';
              const isUserActive = u.isActive !== false;
              const loginTimeStr = u.lastLoginAt
                ? new Date(u.lastLoginAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'Active now';

              return (
                <View key={u.userId || u._id || u.email || uName} style={[styles.listCard, styles.loginRow]}>
                  <View>
                    <Text style={styles.listCardTitle}>{uName}</Text>
                    <Text style={styles.loginSubText}>
                      {uBranch} · {uRole}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={styles.loginStatusRow}>
                      <View style={[styles.statusDot, { backgroundColor: isUserActive ? T.color.primary : T.color.textFaint }]} />
                      <Text style={[styles.loginStatusText, { color: isUserActive ? T.color.primaryDark : T.color.textMuted }]}>
                        {isUserActive ? 'Logged in' : 'Offline'}
                      </Text>
                    </View>
                    <Text style={styles.loginTimeText}>{loginTimeStr}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* 3 NEODOVE QUEUE CARDS */}
        {/* 3 NEODOVE QUEUE CARDS */}
        {dashboardSubTab === 'QUEUES' && (
          <View>
            <View style={isWide ? styles.neoQueueCardsGridWide : styles.neoQueueCardsGridMobile}>
              {/* Card 1: New/Un-attempted Leads */}
              <View style={[styles.neoQueueCard, isWide && { flex: 1 }]}>
                <View style={styles.neoQueueCardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[styles.neoQueueIconBubble, { backgroundColor: '#ECFDF5' }]}>
                      <Sparkles size={16} color="#0F9D58" strokeWidth={2.2} />
                    </View>
                    <View>
                      <Text style={styles.neoQueueCardTitle}>New leads</Text>
                      <Text style={styles.neoQueueCardSub}>Haven't been called yet</Text>
                    </View>
                  </View>
                  <View style={[styles.neoQueueCountBadge, { backgroundColor: '#E6F4EA' }]}>
                    <Text style={[styles.neoQueueCountBadgeText, { color: '#0F9D58' }]}>{newUnattemptedLeads.length}</Text>
                  </View>
                </View>
                <View style={styles.neoQueueActionsRow}>
                  <TouchableOpacity
                    style={styles.neoQueueViewBtn}
                    onPress={() => {
                      setActiveTab('queue');
                      navigation.navigate('MyLeads');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.neoQueueViewBtnText}>View</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.neoQueueCallBtn}
                    onPress={() => handleStartCallingQueue(newUnattemptedLeads, 'New/Un-attempted Leads')}
                    activeOpacity={0.85}
                  >
                    <Phone size={13} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.neoQueueCallBtnText}>Start Calling</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Card 2: Follow-up Leads */}
              <View style={[styles.neoQueueCard, isWide && { flex: 1 }]}>
                <View style={styles.neoQueueCardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[styles.neoQueueIconBubble, { backgroundColor: '#FFFBEB' }]}>
                      <CalendarClock size={16} color="#D97706" strokeWidth={2.2} />
                    </View>
                    <View>
                      <Text style={styles.neoQueueCardTitle}>Follow-up</Text>
                      <Text style={styles.neoQueueCardSub}>Scheduled for callbacks</Text>
                    </View>
                  </View>
                  <View style={[styles.neoQueueCountBadge, { backgroundColor: '#FEF3C7' }]}>
                    <Text style={[styles.neoQueueCountBadgeText, { color: '#B45309' }]}>{followUpLeads.length}</Text>
                  </View>
                </View>
                <View style={styles.neoQueueActionsRow}>
                  <TouchableOpacity
                    style={styles.neoQueueViewBtn}
                    onPress={() => {
                      setActiveTab('callbacks');
                      navigation.navigate('FollowUps');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.neoQueueViewBtnText}>View</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.neoQueueCallBtn}
                    onPress={() => handleStartCallingQueue(followUpLeads, 'Follow-up Leads')}
                    activeOpacity={0.85}
                  >
                    <Phone size={13} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.neoQueueCallBtnText}>Start Calling</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Card 3: Not Connected Leads */}
              <View style={[styles.neoQueueCard, isWide && { flex: 1 }]}>
                <View style={styles.neoQueueCardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[styles.neoQueueIconBubble, { backgroundColor: '#FEF2F2' }]}>
                      <PhoneOff size={16} color="#DC2626" strokeWidth={2.2} />
                    </View>
                    <View>
                      <Text style={styles.neoQueueCardTitle}>Not connected</Text>
                      <Text style={styles.neoQueueCardSub}>Needs re-dial attempt</Text>
                    </View>
                  </View>
                  <View style={[styles.neoQueueCountBadge, { backgroundColor: '#FEE2E2' }]}>
                    <Text style={[styles.neoQueueCountBadgeText, { color: '#DC2626' }]}>{notConnectedLeads.length}</Text>
                  </View>
                </View>
                <View style={styles.neoQueueActionsRow}>
                  <TouchableOpacity
                    style={styles.neoQueueViewBtn}
                    onPress={() => {
                      navigation.navigate('MyLeads');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.neoQueueViewBtnText}>View</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.neoQueueCallBtn}
                    onPress={() => handleStartCallingQueue(notConnectedLeads, 'Not Connected Leads')}
                    activeOpacity={0.85}
                  >
                    <Phone size={13} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.neoQueueCallBtnText}>Start Calling</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* 3. PRIMARY CALLING DECK (HERO LEAD) */}
            {heroLead ? (
              <View style={styles.heroCard}>
                {/* Top Tag Bar */}
                <View style={styles.heroTopRow}>
                  <View style={styles.queueOrderPill}>
                    <View style={styles.liveGreenDot} />
                    <Text style={styles.queueOrderText}>NEXT IN LINE</Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {heroLeadTemp === 'HOT' ? (
                      <View style={[styles.tempPill, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                        <Flame size={11} color="#EF4444" fill="#EF4444" />
                        <Text style={[styles.tempPillText, { color: '#EF4444' }]}>Hot</Text>
                      </View>
                    ) : heroLeadTemp === 'COLD' ? (
                      <View style={[styles.tempPill, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                        <Snowflake size={11} color="#3B82F6" />
                        <Text style={[styles.tempPillText, { color: '#3B82F6' }]}>Cold</Text>
                      </View>
                    ) : (
                      <View style={[styles.tempPill, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                        <Sun size={11} color="#F59E0B" />
                        <Text style={[styles.tempPillText, { color: '#F59E0B' }]}>Warm</Text>
                      </View>
                    )}

                    <View style={styles.stagePill}>
                      <Text style={styles.stagePillText}>{heroLead.stage || 'New'}</Text>
                    </View>
                  </View>
                </View>

                {/* Lead Details */}
                <View style={styles.leadDetailsRow}>
                  <View style={styles.leadAvatarBox}>
                    <Text style={styles.leadAvatarText}>{heroLeadInitials}</Text>
                  </View>
                  <View style={{ flex: 1, paddingLeft: 14 }}>
                    <Text style={styles.leadNameText} numberOfLines={1}>
                      {heroLead.name}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleDirectDial(heroLead)}
                      activeOpacity={0.7}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}
                    >
                      <Phone size={13} color="#0F9D58" strokeWidth={2.2} />
                      <Text style={styles.leadPhoneText}>{formatDisplayPhone(heroLead.phone)}</Text>
                    </TouchableOpacity>
                    <Text style={styles.leadCampaignText} numberOfLines={1}>
                      {heroLeadCampaign} · Attempt #{heroLead.attemptCount || 1}
                    </Text>
                  </View>
                </View>

                {/* Note / Property Preview */}
                <View style={styles.notePreviewRow}>
                  <Clock3 size={13} color="#64748B" />
                  <Text style={styles.notePreviewText} numberOfLines={1}>
                    {heroLead.customProperties?.lastRemark ||
                      (heroLead.attemptCount && heroLead.attemptCount > 0
                        ? 'Prior conversation recorded · Callback ready'
                        : 'New lead · Ready for pitch')}
                  </Text>
                </View>

                {/* High-Contrast Large CALL NOW Button */}
                <TouchableOpacity
                  style={styles.callNowBtn}
                  onPress={() => handleDirectDial(heroLead)}
                  activeOpacity={0.85}
                >
                  <Phone size={18} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.callNowBtnText}>Call now</Text>
                </TouchableOpacity>

                {/* Secondary Action Row: WhatsApp, Note, Skip */}
                <View style={styles.heroActionRow}>
                  <TouchableOpacity
                    style={styles.heroMiniBtnWhatsApp}
                    onPress={() => handleOpenWhatsApp(heroLead)}
                    activeOpacity={0.8}
                  >
                    <MessageCircle size={15} color="#0F9D58" strokeWidth={2.5} />
                    <Text style={styles.heroMiniBtnWhatsAppText}>WhatsApp</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.heroMiniBtnNote}
                    onPress={() => setSelectedLeadForQuickModal(heroLead)}
                    activeOpacity={0.8}
                  >
                    <FileEdit size={15} color="#2563EB" strokeWidth={2.5} />
                    <Text style={styles.heroMiniBtnNoteText}>Note</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.heroMiniBtnSkip}
                    onPress={handleSkipHeroLead}
                    activeOpacity={0.8}
                  >
                    <SkipForward size={15} color="#64748B" strokeWidth={2} />
                    <Text style={styles.heroMiniBtnSkipText}>Skip</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.emptyQueueCard}>
                <CheckCircle2 size={32} color={T.color.primary} />
                <Text style={styles.emptyQueueTitle}>All caught up! 🎉</Text>
                <Text style={styles.emptyQueueSub}>
                  All active leads in this queue have been reached. Browse all leads or upload new contacts.
                </Text>
                <TouchableOpacity
                  style={styles.emptyQueueBtn}
                  onPress={() => navigation.navigate('MyLeads')}
                >
                  <Text style={styles.emptyQueueBtnText}>Browse all {myAssignedLeadsCount} leads</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 4. NEODOVE SEGMENTED TABS (Compact, No Vertical Clutter) */}
            <View style={styles.tabsContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
                <TouchableOpacity
                  style={[styles.tabChip, activeTab === 'queue' && styles.tabChipActive]}
                  onPress={() => setActiveTab('queue')}
                >
                  <ListOrdered size={12} color={activeTab === 'queue' ? '#FFFFFF' : T.color.textMuted} />
                  <Text style={[styles.tabChipText, activeTab === 'queue' && styles.tabChipTextActive]}>
                    Queue ({queueLeads.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabChip, activeTab === 'callbacks' && styles.tabChipActive]}
                  onPress={() => setActiveTab('callbacks')}
                >
                  <CalendarClock size={12} color={activeTab === 'callbacks' ? '#FFFFFF' : T.color.textMuted} />
                  <Text style={[styles.tabChipText, activeTab === 'callbacks' && styles.tabChipTextActive]}>
                    Callbacks ({callbacksDueTodayCount})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabChip, activeTab === 'calls' && styles.tabChipActive]}
                  onPress={() => setActiveTab('calls')}
                >
                  <Clock3 size={12} color={activeTab === 'calls' ? '#FFFFFF' : T.color.textMuted} />
                  <Text style={[styles.tabChipText, activeTab === 'calls' && styles.tabChipTextActive]}>
                    {period === 'Today' ? "Today's calls" : `${customDateLabel} calls`} ({periodCallActivities.length})
                  </Text>
                </TouchableOpacity>

                {isManagerOrAdmin && (
                  <TouchableOpacity
                    style={[styles.tabChip, activeTab === 'team' && styles.tabChipActive]}
                    onPress={() => setActiveTab('team')}
                  >
                    <Users size={12} color={activeTab === 'team' ? '#FFFFFF' : T.color.textMuted} />
                    <Text style={[styles.tabChipText, activeTab === 'team' && styles.tabChipTextActive]}>
                      Team ({agentCallsList.length})
                    </Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>

            {/* TAB 1: QUEUE LIST */}
            {activeTab === 'queue' && (
              <View style={styles.tabContentBox}>
                {nextInQueueLeads.length === 0 ? (
                  <Text style={styles.tabEmptyText}>No other leads in queue. Ready for new list!</Text>
                ) : (
                  nextInQueueLeads.map((item, idx) => {
                    const initials = getInitials(item.name, 'LD');

                    return (
                      <View key={item._id} style={styles.queueItemRow}>
                        <View style={styles.itemAvatar}>
                          <Text style={styles.itemAvatarText}>{initials}</Text>
                        </View>
                        <View style={{ flex: 1, paddingHorizontal: 10 }}>
                          <Text style={styles.itemNameText} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={styles.itemPhoneText}>{formatDisplayPhone(item.phone)}</Text>
                        </View>

                        <View style={styles.itemActionGroup}>
                          <TouchableOpacity
                            style={styles.itemCallBtn}
                            onPress={() => handleDirectDial(item)}
                            activeOpacity={0.8}
                          >
                            <Phone size={12} color="#FFFFFF" strokeWidth={2.5} />
                            <Text style={styles.itemCallBtnText}>Call</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.itemIconBtn}
                            onPress={() => handleOpenWhatsApp(item)}
                            activeOpacity={0.8}
                          >
                            <MessageCircle size={13} color={T.color.primaryDark} strokeWidth={2.5} />
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.itemIconBtn}
                            onPress={() => setSelectedLeadForQuickModal(item)}
                            activeOpacity={0.8}
                          >
                            <FileEdit size={13} color={T.color.info} strokeWidth={2} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}

                <TouchableOpacity
                  style={styles.viewAllFooterBtn}
                  onPress={() => navigation.navigate('MyLeads')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.viewAllFooterText}>View all ({myAssignedLeadsCount}) leads</Text>
                  <ChevronRight size={13} color={T.color.info} />
                </TouchableOpacity>
              </View>
            )}

            {/* TAB 2: CALLBACKS DUE TODAY */}
            {activeTab === 'callbacks' && (
              <View style={styles.tabContentBox}>
                {dueTodayFollowUps.length === 0 ? (
                  <View style={styles.tabEmptyBox}>
                    <CheckCircle2 size={24} color={T.color.primary} />
                    <Text style={styles.tabEmptyTitle}>No callbacks due right now</Text>
                    <Text style={styles.tabEmptySub}>
                      When you schedule callbacks from the post-call modal, they will show up here automatically.
                    </Text>
                  </View>
                ) : (
                  dueTodayFollowUps.map((item) => {
                    const timeStr = item.nextFollowUpAt
                      ? new Date(item.nextFollowUpAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Today';

                    return (
                      <View key={item._id} style={styles.queueItemRow}>
                        <View style={[styles.itemAvatar, { backgroundColor: T.color.warnTint }]}>
                          <CalendarClock size={14} color={T.color.warn} />
                        </View>
                        <View style={{ flex: 1, paddingHorizontal: 10 }}>
                          <Text style={styles.itemNameText} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={styles.itemPhoneText}>
                            {formatDisplayPhone(item.phone)} · <Text style={{ color: T.color.warn, fontWeight: '700' }}>{timeStr}</Text>
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={styles.itemCallBtn}
                          onPress={() => handleDirectDial(item)}
                          activeOpacity={0.8}
                        >
                          <Phone size={12} color="#FFFFFF" strokeWidth={2.5} />
                          <Text style={styles.itemCallBtnText}>Call</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* TAB 3: TODAY'S CALLS ACTIVITY */}
            {activeTab === 'calls' && (
              <View style={styles.tabContentBox}>
                {periodCallActivities.length === 0 ? (
                  <View style={styles.tabEmptyBox}>
                    <Clock3 size={24} color={T.color.textFaint} />
                    <Text style={styles.tabEmptyTitle}>No calls logged today yet</Text>
                    <Text style={styles.tabEmptySub}>
                      Calls you dial will appear here with detected duration and connection status.
                    </Text>
                  </View>
                ) : (
                  periodCallActivities.slice(0, 10).map((act, index) => {
                    const isLast = index === Math.min(periodCallActivities.length, 10) - 1;
                    const durText = act.connected ? formatSeconds(act.durationSeconds || 0) : 'Missed';
                    const timeStr = new Date(act.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <View
                        key={act._id}
                        style={[styles.historyRow, isLast && { borderBottomWidth: 0 }]}
                      >
                        <View
                          style={[
                            styles.historyIconBox,
                            { backgroundColor: act.connected ? '#ECFDF5' : T.color.dangerTint },
                          ]}
                        >
                          {act.connected ? (
                            <Phone size={12} color={T.color.primaryDark} />
                          ) : (
                            <PhoneOff size={12} color={T.color.danger} />
                          )}
                        </View>

                        <View style={{ flex: 1, paddingHorizontal: 10 }}>
                          <Text style={styles.historyNameText} numberOfLines={1}>
                            {act.customerName || (act.phone ? formatDisplayPhone(act.phone) : 'Contact')}
                          </Text>
                          <Text style={styles.historyPhoneText}>
                            {act.phone ? formatDisplayPhone(act.phone) : 'No phone'} · {timeStr}
                          </Text>
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <Text
                            style={[
                              styles.historyDurText,
                              { color: act.connected ? T.color.primaryDark : T.color.danger },
                            ]}
                          >
                            {durText}
                          </Text>
                          <Text style={styles.historyStageText}>{act.stage}</Text>
                        </View>
                      </View>
                    );
                  })
                )}

                <TouchableOpacity
                  style={styles.viewAllFooterBtn}
                  onPress={() => navigation.navigate('CallHistory')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.viewAllFooterText}>View full call history</Text>
                  <ChevronRight size={13} color={T.color.info} />
                </TouchableOpacity>
              </View>
            )}

            {/* TAB 4: TEAM PERFORMANCE (Manager & Admin) */}
            {isManagerOrAdmin && activeTab === 'team' && (
              <View style={styles.tabContentBox}>
                {/* Branch Filter Selector */}
                <View style={styles.branchFilterRow}>
                  {availableBranches.map((br) => {
                    const isSelected = selectedBranch === br.value;
                    return (
                      <TouchableOpacity
                        key={br.value}
                        style={[styles.branchFilterChip, isSelected && styles.branchFilterChipActive]}
                        onPress={() => setSelectedBranch(br.value)}
                      >
                        <Text
                          style={[
                            styles.branchFilterText,
                            isSelected && styles.branchFilterTextActive,
                          ]}
                        >
                          {br.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {agentCallsList.length === 0 ? (
                  <Text style={styles.tabEmptyText}>No agents active in this branch.</Text>
                ) : (
                  agentCallsList.map((agentItem) => {
                    const initials = getInitials(agentItem.name, 'AG');

                    const cRate =
                      agentItem.calls > 0
                        ? ((agentItem.connected / agentItem.calls) * 100).toFixed(0) + '%'
                        : '0%';
                    const avgDur = formatSeconds(agentItem.avgDurationSeconds || 0);

                    return (
                      <View key={agentItem.userId || agentItem.email} style={styles.agentCard}>
                        <View style={styles.agentHeader}>
                          <View style={styles.itemAvatar}>
                            <Text style={styles.itemAvatarText}>{initials}</Text>
                          </View>
                          <View style={{ flex: 1, paddingLeft: 10 }}>
                            <Text style={styles.itemNameText}>{agentItem.name}</Text>
                            <Text style={styles.itemPhoneText}>
                              {agentItem.branch || 'Trichy'} Branch
                            </Text>
                          </View>
                        </View>

                        <View style={styles.agentMetricsGrid}>
                          <View style={styles.agentMetricItem}>
                            <Text style={styles.agentMetricVal}>{agentItem.calls}</Text>
                            <Text style={styles.agentMetricLbl}>Calls</Text>
                          </View>
                          <View style={styles.agentMetricItem}>
                            <Text style={[styles.agentMetricVal, { color: T.color.primaryDark }]}>
                              {agentItem.connected}
                            </Text>
                            <Text style={styles.agentMetricLbl}>Connected</Text>
                          </View>
                          <View style={styles.agentMetricItem}>
                            <Text style={styles.agentMetricVal}>{cRate}</Text>
                            <Text style={styles.agentMetricLbl}>Rate</Text>
                          </View>
                          <View style={styles.agentMetricItem}>
                            <Text style={styles.agentMetricVal}>{avgDur}</Text>
                            <Text style={styles.agentMetricLbl}>Avg talk</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Quick Lead Modal */}
      {selectedLeadForQuickModal && (
        <LeadQuickModal
          lead={selectedLeadForQuickModal}
          visible={Boolean(selectedLeadForQuickModal)}
          onClose={() => setSelectedLeadForQuickModal(null)}
          onOpenFullDispose={(leadToDispose) => {
            setSelectedLeadForQuickModal(null);
            navigation.navigate('Dispose', { lead: leadToDispose });
          }}
        />
      )}

      {/* Date Picker Modal for Dashboard Filtering */}
      <CrmDateTimePickerModal
        visible={showDatePicker}
        title="Filter Dashboard by Date"
        initialDate={customDate || new Date().toISOString()}
        onClose={() => setShowDatePicker(false)}
        allowPastDates={true}
        mode="date"
        onConfirm={handleConfirmCustomDate}
      />

      {/* WhatsApp Template Modal */}
      {whatsAppTarget && (
        <WhatsAppTemplateModal
          visible={Boolean(whatsAppTarget)}
          onClose={() => setWhatsAppTarget(null)}
          recipientName={whatsAppTarget.name}
          recipientPhone={whatsAppTarget.phone}
        />
      )}
    </CrmShell>
  );
};

export const HomeScreen: React.FC = () => {
  return (
    <ErrorBoundary fallbackMessage="Unable to display Home Dashboard. Please tap Retry to reload.">
      <HomeScreenContent />
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.color.bg,
  },
  contentContainer: {
    padding: T.space.md,
    paddingBottom: 90,
    backgroundColor: '#F8FAFC',
    maxWidth: 1240,
    width: '100%',
    alignSelf: 'center',
  },
  launchpadContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  welcomeHeroText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 14,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  heroStartCallingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4C1D95',
    paddingVertical: 12,
    paddingHorizontal: 44,
    borderRadius: 28,
    marginBottom: 20,
    shadowColor: '#4C1D95',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  heroStartCallingText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  actionGridContainer: {
    width: '100%',
    gap: 12,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  gridActionCard: {
    flex: 1,
    height: 125,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  gridActionLabel: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  headerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: T.color.primaryTint,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: T.radius.sm,
    borderWidth: 1,
    borderColor: T.color.border,
  },
  headerAddBtnText: {
    color: T.color.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  campaignSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  campaignSwitchText: {
    fontSize: 13,
    color: T.color.textMuted,
    fontWeight: '400',
  },

  // 1. Top Bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: T.space.md,
  },
  greetingText: {
    fontSize: 17,
    fontWeight: '800',
    color: T.color.text,
  },
  branchSubText: {
    fontSize: 12,
    color: T.color.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  liveGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: T.color.primary,
  },
  statusBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: T.color.primaryDark,
  },

  // Alert Banner
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.color.infoTint,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: T.radius.md,
    padding: T.space.sm + 2,
    marginBottom: T.space.md,
  },
  alertIconBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  alertSubtitle: {
    fontSize: 11,
    color: T.color.info,
    marginTop: 1,
  },
  alertBtn: {
    backgroundColor: T.color.info,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: T.radius.sm,
  },
  alertBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  // Scope Switcher (My Calls vs Team Overview)
  scopeSwitcherRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 10,
    gap: 4,
  },
  scopeBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  scopeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  scopeBtnTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },

  // Modern Performance Summary & Metric Grid
  perfSummaryWrap: {
    marginBottom: T.space.md + 2,
  },
  topControlCard: {
    marginBottom: 12,
    gap: 8,
  },
  topControlCardWide: {
    marginBottom: 12,
  },
  branchFilterSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.02,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  branchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginRight: 8,
    paddingRight: 8,
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  branchIconBadge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  branchFilterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  branchScrollList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 10,
  },
  branchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  branchPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  branchPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  branchPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  activeBranchDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
  },
  summaryDateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  summaryDateBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  summaryDateSubtext: {
    fontSize: 10.5,
    color: '#0F9D58',
    fontWeight: '600',
    marginTop: 1,
  },
  summaryDateRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calendarBubble: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E6F4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryDateBarText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  summaryDurationChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  summaryDurationChipCustom: {
    backgroundColor: '#E6F4EA',
  },
  summaryDurationChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  summaryDurationChipTextCustom: {
    color: '#0F9D58',
  },
  resetDateBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  resetDateBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  metricGridWide: {
    flexDirection: 'row',
    gap: 12,
  },
  metricGridMobile: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  modernStatCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 13,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  modernStatCardMobile: {
    width: '48.5%',
  },
  statCardBlue: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  statCardGreen: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statCardAmber: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  statCardPurple: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
  },
  modernStatTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modernStatLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  modernStatIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modernStatVal: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  modernStatSub: {
    fontSize: 10.5,
    color: '#94A3B8',
    fontWeight: '500',
  },

  // Segmented sub-tabs (Queues / Login report / Call report)
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: T.color.surfaceSunken,
    borderRadius: T.radius.sm,
    padding: 3,
    marginBottom: T.space.md,
    borderWidth: 1,
    borderColor: T.color.border,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: T.radius.sm - 2,
    backgroundColor: 'transparent',
  },
  segmentBtnActive: {
    backgroundColor: T.color.primaryTint,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '500',
    color: T.color.textMuted,
  },
  segmentTextActive: {
    fontWeight: '700',
    color: T.color.primaryDark,
  },

  // Generic list card used for Call Report & Login Report rows
  listCard: {
    backgroundColor: T.color.surface,
    borderRadius: T.radius.md,
    padding: T.space.md,
    borderWidth: 1,
    borderColor: T.color.border,
  },
  listCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: T.space.xs + 2,
  },
  listCardTitle: {
    fontWeight: '700',
    fontSize: 13.5,
    color: T.color.text,
  },
  connectRatePill: {
    backgroundColor: T.color.primaryTint,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: T.radius.sm - 2,
  },
  connectRatePillText: {
    color: T.color.primaryDark,
    fontSize: 11,
    fontWeight: '700',
  },
  listCardStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: T.space.xs,
  },
  listCardStatText: {
    fontSize: 12,
    color: T.color.textMuted,
  },
  listCardStatStrong: {
    fontWeight: '700',
    color: T.color.text,
  },
  inlineEmptyCard: {
    backgroundColor: T.color.surface,
    borderRadius: T.radius.md,
    padding: T.space.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.color.border,
  },
  inlineEmptyText: {
    fontSize: 13,
    color: T.color.textMuted,
  },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  loginSubText: {
    fontSize: 11.5,
    color: T.color.textMuted,
    marginTop: 2,
  },
  loginStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  loginStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  loginTimeText: {
    fontSize: 10,
    color: T.color.textFaint,
    marginTop: 2,
  },

  // 3. Hero Calling Card — given brand-tinted elevation so it reads as the
  // primary action area rather than another grey box in the stack.
  heroCard: {
    backgroundColor: T.color.surface,
    borderRadius: T.radius.lg,
    padding: T.space.md,
    borderWidth: 1.5,
    borderColor: '#CDEBD9',
    marginBottom: T.space.md,
    ...T.shadowHero,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: T.space.sm + 2,
  },
  queueOrderPill: {
    backgroundColor: T.color.primaryTint,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: T.radius.sm - 2,
  },
  queueOrderText: {
    fontSize: 10,
    fontWeight: '800',
    color: T.color.primaryDark,
  },
  tempPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: T.radius.sm - 2,
    borderWidth: 1,
  },
  tempPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  stagePill: {
    backgroundColor: T.color.surfaceSunken,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: T.radius.sm - 2,
  },
  stagePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
  },
  leadDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: T.space.sm + 2,
  },
  leadAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: T.color.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  leadAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  leadNameText: {
    fontSize: 16,
    fontWeight: '800',
    color: T.color.text,
  },
  leadPhoneText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    marginTop: 1,
  },
  leadCampaignText: {
    fontSize: 10.5,
    color: T.color.textMuted,
    marginTop: 2,
  },
  notePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: T.color.surfaceSunken,
    borderRadius: T.radius.sm,
    paddingVertical: 7,
    paddingHorizontal: 9,
    marginBottom: T.space.sm + 2,
  },
  notePreviewText: {
    fontSize: 10.5,
    color: T.color.textMuted,
    flex: 1,
  },
  callNowBtn: {
    backgroundColor: T.color.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: T.radius.sm + 2,
    marginBottom: T.space.sm,
    ...T.shadowCard,
  },
  callNowBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  heroActionRow: {
    flexDirection: 'row',
    gap: T.space.sm - 2,
  },
  heroMiniBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    backgroundColor: T.color.surfaceSunken,
    borderWidth: 1,
    borderColor: T.color.border,
    borderRadius: T.radius.sm - 1,
  },
  heroMiniBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },

  emptyQueueCard: {
    backgroundColor: T.color.surface,
    borderRadius: T.radius.lg,
    padding: T.space.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.color.border,
    marginBottom: T.space.md,
  },
  emptyQueueTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: T.color.text,
    marginTop: T.space.sm,
  },
  emptyQueueSub: {
    fontSize: 11.5,
    color: T.color.textMuted,
    textAlign: 'center',
    marginVertical: T.space.xs,
    lineHeight: 16,
  },
  emptyQueueBtn: {
    marginTop: T.space.sm,
    backgroundColor: T.color.primary,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: T.radius.sm,
  },
  emptyQueueBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // 4. Segmented Tabs
  tabsContainer: {
    marginBottom: T.space.sm,
  },
  tabsScroll: {
    gap: T.space.sm - 2,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 11,
    backgroundColor: T.color.surface,
    borderWidth: 1,
    borderColor: T.color.border,
    borderRadius: T.radius.sm,
  },
  tabChipActive: {
    backgroundColor: T.color.primary,
    borderColor: T.color.primary,
  },
  tabChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: T.color.textMuted,
  },
  tabChipTextActive: {
    color: '#FFFFFF',
  },

  // Tab Content Box
  tabContentBox: {
    backgroundColor: T.color.surface,
    borderRadius: T.radius.md,
    padding: T.space.sm + 2,
    borderWidth: 1,
    borderColor: T.color.border,
  },
  tabEmptyText: {
    fontSize: 11.5,
    color: T.color.textFaint,
    textAlign: 'center',
    paddingVertical: T.space.lg,
  },
  tabEmptyBox: {
    alignItems: 'center',
    paddingVertical: T.space.lg - 2,
  },
  tabEmptyTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    marginTop: T.space.xs,
  },
  tabEmptySub: {
    fontSize: 10.5,
    color: T.color.textFaint,
    textAlign: 'center',
    marginTop: 2,
    paddingHorizontal: T.space.md,
    lineHeight: 15,
  },

  // Queue Item Row
  queueItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: T.space.sm - 1,
    borderBottomWidth: 1,
    borderBottomColor: T.color.surfaceSunken,
  },
  itemAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: T.color.infoTint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemAvatarText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: T.color.info,
  },
  itemNameText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: T.color.text,
  },
  itemPhoneText: {
    fontSize: 10.5,
    color: T.color.textMuted,
    marginTop: 1,
  },
  itemActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: T.color.primary,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: T.radius.sm - 1,
  },
  itemCallBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  itemIconBtn: {
    width: 28,
    height: 28,
    borderRadius: T.radius.sm - 1,
    backgroundColor: T.color.surfaceSunken,
    borderWidth: 1,
    borderColor: T.color.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewAllFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: T.space.sm,
    marginTop: T.space.xs,
  },
  viewAllFooterText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: T.color.info,
  },

  // Calls History Row
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: T.space.sm - 1,
    borderBottomWidth: 1,
    borderBottomColor: T.color.surfaceSunken,
  },
  historyIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyNameText: {
    fontSize: 12,
    fontWeight: '700',
    color: T.color.text,
  },
  historyPhoneText: {
    fontSize: 10,
    color: T.color.textMuted,
  },
  historyDurText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  historyStageText: {
    fontSize: 9,
    color: T.color.textFaint,
    marginTop: 1,
  },

  // Team Branch Filter & Cards
  branchFilterRow: {
    flexDirection: 'row',
    gap: T.space.xs + 2,
    marginBottom: T.space.sm,
  },
  branchFilterChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: T.color.surfaceSunken,
    borderRadius: T.radius.sm - 1,
  },
  branchFilterChipActive: {
    backgroundColor: T.color.primary,
  },
  branchFilterText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: T.color.textMuted,
  },
  branchFilterTextActive: {
    color: '#FFFFFF',
  },
  agentCard: {
    backgroundColor: T.color.surfaceSunken,
    borderWidth: 1,
    borderColor: T.color.border,
    borderRadius: T.radius.sm + 1,
    padding: T.space.sm + 1,
    marginBottom: T.space.sm - 2,
  },
  agentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: T.space.sm - 2,
  },
  agentMetricsGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: T.color.border,
    paddingTop: T.space.xs + 1,
  },
  agentMetricItem: {
    flex: 1,
    alignItems: 'center',
  },
  agentMetricVal: {
    fontSize: 12.5,
    fontWeight: '800',
    color: T.color.text,
  },
  agentMetricLbl: {
    fontSize: 9,
    color: T.color.textMuted,
  },

  // NeoDove Queue Cards — 3-column deck on desktop, responsive stack on mobile
  neoQueueCardsGridWide: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: T.space.lg,
  },
  neoQueueCardsGridMobile: {
    gap: 12,
    marginBottom: T.space.lg,
  },
  neoQueueCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    justifyContent: 'space-between',
  },
  neoQueueCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  neoQueueIconBubble: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  neoQueueCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  neoQueueCountBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 32,
    alignItems: 'center',
  },
  neoQueueCountBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  neoQueueCardSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  neoQueueActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  neoQueueViewBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  neoQueueViewBtnText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 12.5,
  },
  neoQueueCallBtn: {
    flex: 1.4,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    backgroundColor: '#0F9D58',
    shadowColor: '#0F9D58',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  neoQueueCallBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12.5,
  },

  // Hero Card Action Buttons
  heroMiniBtnWhatsApp: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
  },
  heroMiniBtnWhatsAppText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F9D58',
  },
  heroMiniBtnNote: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
  },
  heroMiniBtnNoteText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  heroMiniBtnSkip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
  },
  heroMiniBtnSkipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
});