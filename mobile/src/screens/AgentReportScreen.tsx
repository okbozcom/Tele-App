import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import {
  Users,
  Search,
  Phone,
  PhoneCall,
  PhoneOff,
  Clock,
  Clock3,
  Calendar,
  ChevronRight,
  X,
  Filter,
  RefreshCw,
  MessageCircle,
  MapPin,
  TrendingUp,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Download,
} from 'lucide-react-native';

import { CrmShell } from '../components/CrmShell';
import { ReportGeneratorModal } from '../components/ReportGeneratorModal';
import { fetchUserCallsReport, fetchUsers, fetchBranches, fetchUserActivities } from '../api/leadApi';
import { useAuthStore } from '../store/authStore';
import { useLeadHistoryStore } from '../store/leadHistoryStore';
import { UserCallStats, Activity } from '../types';
import { formatDisplayPhone, getDialerTelUrl } from '../utils/phoneUtils';
import { downloadOrShareCsv, convertCallActivitiesToCsv } from '../utils/csvDownloader';
import { colors, borderRadius, shadows } from '../theme';
import { toast } from '../store/toastStore';

type PeriodFilter = 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH' | 'ALL';

export const AgentReportScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const isWide = width >= 860;

  const currentUser = useAuthStore((s) => s.user);
  const isManager = currentUser?.role === 'MANAGER';
  const isAgent = currentUser?.role === 'AGENT';

  const [period, setPeriod] = useState<PeriodFilter>('TODAY');
  const [selectedBranch, setSelectedBranch] = useState<'ALL' | string>(
    isManager && currentUser?.branch ? currentUser.branch : 'ALL',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgentDetail, setSelectedAgentDetail] = useState<UserCallStats | null>(null);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [isExportingAgentLog, setIsExportingAgentLog] = useState(false);

  const { data: branchesData } = useQuery({
    queryKey: ['adminBranches'],
    queryFn: fetchBranches,
    enabled: !isAgent,
  });
  const branchesList = branchesData?.branches || [];
  const availableBranchNames = useMemo(() => {
    const fromApi = (branchesList || []).map((b) => b.name);
    const defaults = ['Trichy', 'Pudukkottai', 'Chennai', 'Madurai'];
    return Array.from(new Set([...defaults, ...fromApi])).filter(Boolean);
  }, [branchesList]);

  // Compute ISO date range for query
  const { fromDate, toDate, periodLabel } = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (period === 'TODAY') {
      return {
        fromDate: startOfToday.toISOString(),
        toDate: endOfToday.toISOString(),
        periodLabel: 'Today',
      };
    }
    if (period === 'YESTERDAY') {
      const startOfYesterday = new Date(startOfToday.getTime() - 24 * 3600 * 1000);
      const endOfYesterday = new Date(startOfToday.getTime() - 1);
      return {
        fromDate: startOfYesterday.toISOString(),
        toDate: endOfYesterday.toISOString(),
        periodLabel: 'Yesterday',
      };
    }
    if (period === 'WEEK') {
      const sevenDaysAgo = new Date(startOfToday.getTime() - 6 * 24 * 3600 * 1000);
      return {
        fromDate: sevenDaysAgo.toISOString(),
        toDate: endOfToday.toISOString(),
        periodLabel: 'Past 7 Days',
      };
    }
    if (period === 'MONTH') {
      const thirtyDaysAgo = new Date(startOfToday.getTime() - 29 * 24 * 3600 * 1000);
      return {
        fromDate: thirtyDaysAgo.toISOString(),
        toDate: endOfToday.toISOString(),
        periodLabel: 'Past 30 Days',
      };
    }
    return {
      fromDate: undefined,
      toDate: undefined,
      periodLabel: 'All Time',
    };
  }, [period]);

  // 1. Fetch Backend User Calls Report
  const {
    data: userCallsData,
    isLoading: isReportLoading,
    refetch: refetchReport,
    isRefetching,
  } = useQuery({
    queryKey: ['agentCallReports', fromDate, toDate],
    queryFn: () => fetchUserCallsReport({ from: fromDate, to: toDate }),
    staleTime: 30000,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  // 2. Fetch Users to ensure all registered agents are listed (Admins & Managers only)
  const { data: usersData } = useQuery({
    queryKey: ['adminUsersListReport'],
    queryFn: () => fetchUsers({ role: 'AGENT' }),
    enabled: !isAgent,
  });

  // 3. Subscribe to local activity store for instant reactivity
  const historyMap = useLeadHistoryStore((s) => s.historyMap);
  const { getAllActivities } = useLeadHistoryStore();

  // Combine remote stats with local real-time actions
  const combinedAgentStats = useMemo(() => {
    // If logged in as AGENT: Strictly isolate and return ONLY own stats
    if (isAgent && currentUser) {
      const remoteAgents = userCallsData?.agents || [];
      const myRemote = remoteAgents.find(
        (a) =>
          a.userId === currentUser._id ||
          (currentUser.email && a.email?.toLowerCase() === currentUser.email.toLowerCase()) ||
          (currentUser.name && a.name?.toLowerCase() === currentUser.name.toLowerCase()),
      );

      const myStats: UserCallStats = {
        userId: currentUser._id,
        name: currentUser.name || 'My Calls',
        email: currentUser.email || '',
        branch: currentUser.branch || 'General',
        calls: myRemote?.calls || 0,
        connected: myRemote?.connected || 0,
        notConnected: myRemote?.notConnected || 0,
        totalDurationSeconds: myRemote?.totalDurationSeconds || 0,
        avgDurationSeconds: myRemote?.avgDurationSeconds || 0,
      };

      // Merge local activities for instant reactivity (strictly deduplicated by _id)
      const allLocalActivities = getAllActivities();
      let localCalls = 0;
      let localConnected = 0;
      let localNotConnected = 0;
      let localDuration = 0;

      const currentUserId = currentUser._id?.toLowerCase();
      const currentUserName = currentUser.name?.toLowerCase();
      const currentUserEmail = currentUser.email?.toLowerCase();

      for (const act of allLocalActivities) {
        if (act.type !== 'CALL') continue;
        if (!act.createdAt) continue;
        const actTime = new Date(act.createdAt).getTime();
        if (fromDate && actTime < new Date(fromDate).getTime()) continue;
        if (toDate && actTime > new Date(toDate).getTime()) continue;

        const uId = typeof act.userId === 'object' && act.userId ? (act.userId as any)._id : act.userId;
        const uName = typeof act.userId === 'object' && act.userId ? (act.userId as any).name : '';
        const uEmail = typeof act.userId === 'object' && act.userId ? (act.userId as any).email : '';

        const isMyAct =
          (uId && String(uId).toLowerCase() === currentUserId) ||
          (act.agentId && String(act.agentId).toLowerCase() === currentUserId) ||
          (uName && currentUserName && String(uName).toLowerCase() === currentUserName) ||
          (act.agentName && currentUserName && String(act.agentName).toLowerCase() === currentUserName) ||
          (uEmail && currentUserEmail && String(uEmail).toLowerCase() === currentUserEmail);

        if (isMyAct) {
          localCalls++;
          const dur = act.durationSeconds || 0;
          if (dur > 0 || act.connected || act.stage === 'CONNECTED') {
            localConnected++;
            localDuration += dur;
          } else {
            localNotConnected++;
          }
        }
      }

      if (myStats.calls === 0) {
        myStats.calls = localCalls;
        myStats.connected = localConnected;
        myStats.notConnected = localNotConnected;
        myStats.totalDurationSeconds = localDuration;
      }
      myStats.avgDurationSeconds =
        myStats.connected > 0 ? Math.round(myStats.totalDurationSeconds / myStats.connected) : 0;

      return [myStats];
    }

    // Admins & Managers: Show all agents
    const remoteAgents = userCallsData?.agents || [];
    const registeredAgents = (usersData?.users || []).filter((u) => u.role === 'AGENT');

    // Create base map from registered agents
    const statsMap = new Map<string, UserCallStats>();

    for (const ag of registeredAgents) {
      statsMap.set(ag._id, {
        userId: ag._id,
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

    // Populate remote report stats from authoritative backend
    for (const rem of remoteAgents) {
      const existing = statsMap.get(rem.userId);
      if (existing) {
        existing.calls = rem.calls;
        existing.connected = rem.connected;
        existing.notConnected = rem.notConnected;
        existing.totalDurationSeconds = rem.totalDurationSeconds;
        existing.avgDurationSeconds = rem.avgDurationSeconds;
      } else {
        statsMap.set(rem.userId, { ...rem });
      }
    }

    // Merge only pending/unsynced local activities for zero-latency updates
    const allLocalActivities = getAllActivities();
    for (const act of allLocalActivities) {
      if (!act.createdAt) continue;
      const isPending = (act as any).isPendingSync || (act._id && String(act._id).startsWith('act-local-'));
      if (!isPending) continue;

      const actTime = new Date(act.createdAt).getTime();

      // Check period bounds
      if (fromDate && actTime < new Date(fromDate).getTime()) continue;
      if (toDate && actTime > new Date(toDate).getTime()) continue;

      // Find matching agent
      const uId = typeof act.userId === 'object' && act.userId ? (act.userId as any)._id : act.userId;
      const uName = typeof act.userId === 'object' && act.userId ? (act.userId as any).name : '';

      const matchedAgent = Array.from(statsMap.values()).find(
        (a) =>
          a.userId === act.agentId ||
          (uId && String(uId) === a.userId) ||
          (act.agentName && a.name.toLowerCase() === act.agentName.toLowerCase()) ||
          (uName && a.name.toLowerCase() === String(uName).toLowerCase()),
      );

      if (matchedAgent) {
        matchedAgent.calls += 1;
        const dur = act.durationSeconds || 0;
        if (dur > 0 || act.connected) {
          matchedAgent.connected += 1;
          matchedAgent.totalDurationSeconds += dur;
        } else {
          matchedAgent.notConnected += 1;
        }
        matchedAgent.avgDurationSeconds =
          matchedAgent.connected > 0
            ? Math.round(matchedAgent.totalDurationSeconds / matchedAgent.connected)
            : 0;
      }
    }

    return Array.from(statsMap.values());
  }, [userCallsData, usersData, historyMap, fromDate, toDate, isAgent, currentUser]);

  // Filter by branch and search
  const filteredAgents = useMemo(() => {
    // Agents only ever see themselves
    if (isAgent) {
      return combinedAgentStats;
    }

    let list = combinedAgentStats;

    if (isManager && currentUser?.branch) {
      list = list.filter(
        (a) => (a.branch || '').toLowerCase() === currentUser.branch?.toLowerCase(),
      );
    } else if (selectedBranch !== 'ALL') {
      list = list.filter(
        (a) => (a.branch || '').toLowerCase() === selectedBranch.toLowerCase(),
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q),
      );
    }

    return list.sort((a, b) => b.calls - a.calls);
  }, [combinedAgentStats, selectedBranch, searchQuery, isManager, isAgent, currentUser]);

  // Overall totals for team summary banner
  const teamTotals = useMemo(() => {
    const totalCalls = filteredAgents.reduce((sum, a) => sum + a.calls, 0);
    const totalConnected = filteredAgents.reduce((sum, a) => sum + a.connected, 0);
    const totalTalkSec = filteredAgents.reduce((sum, a) => sum + a.totalDurationSeconds, 0);
    const activeDialingAgents = filteredAgents.filter((a) => a.calls > 0).length;
    const overallRate = totalCalls > 0 ? Math.round((totalConnected / totalCalls) * 100) : 0;

    const hours = Math.floor(totalTalkSec / 3600);
    const mins = Math.floor((totalTalkSec % 3600) / 60);
    const formattedTalkTime = hours > 0 ? `${hours}h ${mins}m` : `${mins}m ${totalTalkSec % 60}s`;

    return {
      totalCalls,
      totalConnected,
      overallRate,
      formattedTalkTime,
      activeDialingAgents,
      totalAgents: filteredAgents.length,
    };
  }, [filteredAgents]);

  // Format seconds into minutes/hours
  const formatSeconds = (sec: number) => {
    if (!sec || sec <= 0) return '0s';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  // Fetch real activities from MongoDB for the selected agent drilldown
  const { data: serverAgentCalls = [] } = useQuery({
    queryKey: ['agentModalCalls', selectedAgentDetail?.userId, fromDate, toDate],
    queryFn: () =>
      selectedAgentDetail?.userId
        ? fetchUserActivities({
            userId: selectedAgentDetail.userId,
            from: fromDate,
            to: toDate,
          })
        : Promise.resolve([]),
    enabled: Boolean(selectedAgentDetail?.userId),
  });

  // Get call history timeline strictly for selected drill-down agent (server + local merged)
  const selectedAgentCalls = useMemo(() => {
    if (!selectedAgentDetail) return [];

    const targetUserId = selectedAgentDetail.userId?.toLowerCase().trim();
    const targetName = selectedAgentDetail.name?.toLowerCase().trim();
    const targetEmail = selectedAgentDetail.email?.toLowerCase().trim();

    const matchesSelectedAgent = (act: Activity) => {
      const uId = typeof act.userId === 'object' && act.userId ? (act.userId as any)._id : act.userId;
      const uName = typeof act.userId === 'object' && act.userId ? (act.userId as any).name : '';
      const uEmail = typeof act.userId === 'object' && act.userId ? (act.userId as any).email : '';
      const aId = act.agentId;
      const aName = act.agentName;

      return Boolean(
        (targetUserId && uId && String(uId).toLowerCase() === targetUserId) ||
        (targetUserId && aId && String(aId).toLowerCase() === targetUserId) ||
        (targetName && uName && String(uName).toLowerCase() === targetName) ||
        (targetName && aName && String(aName).toLowerCase() === targetName) ||
        (targetEmail && uEmail && String(uEmail).toLowerCase() === targetEmail)
      );
    };

    const allActivities = getAllActivities().filter(
      (activity) => activity.type === 'CALL' && matchesSelectedAgent(activity),
    );

    const map = new Map<string, Activity>();
    for (const a of serverAgentCalls) {
      if (a && a._id && a.type === 'CALL' && matchesSelectedAgent(a)) {
        map.set(a._id, a);
      }
    }
    for (const a of allActivities) {
      if (a && a._id && !map.has(a._id)) {
        map.set(a._id, a);
      }
    }

    const merged = Array.from(map.values());

    return merged
      .filter((act) => {
        if (!act.createdAt) return false;
        const actTime = new Date(act.createdAt).getTime();
        if (fromDate && actTime < new Date(fromDate).getTime()) return false;
        if (toDate && actTime > new Date(toDate).getTime()) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [selectedAgentDetail, serverAgentCalls, getAllActivities, fromDate, toDate]);

  // Export specific agent's detailed call logs directly from drill-down modal
  const handleExportAgentCallLogs = async () => {
    if (!selectedAgentDetail || selectedAgentCalls.length === 0) {
      toast.info('No call log records found to export', 'Empty Log');
      return;
    }
    try {
      setIsExportingAgentLog(true);
      const csvData = convertCallActivitiesToCsv(
        selectedAgentCalls,
        selectedAgentDetail.name || currentUser?.name || 'Agent',
      );
      const cleanName = (selectedAgentDetail.name || 'agent').replace(/\s+/g, '_');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `HiTalk_CallLogs_${cleanName}_${period.toLowerCase()}_${timestamp}.csv`;

      const res = await downloadOrShareCsv(filename, csvData);
      if (res.success) {
        toast.success(`Exported ${selectedAgentCalls.length} call records to CSV!`, 'Export Complete');
      } else {
        toast.error(res.message, 'Export Error');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to export call log', 'Export Failed');
    } finally {
      setIsExportingAgentLog(false);
    }
  };

  return (
    <CrmShell
      title={isAgent ? 'My Call Report' : 'Agent Call Reports'}
      headerIcon={
        isAgent ? (
          <Clock size={16} color="#0F9D58" />
        ) : (
          <Users size={16} color="#0F9D58" />
        )
      }
      breadcrumb={isAgent ? 'Workspace' : 'Management'}
      rightAction={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            style={styles.generateReportBtn}
            onPress={() => setIsGenerateModalOpen(true)}
            activeOpacity={0.8}
          >
            <FileSpreadsheet size={13} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={styles.generateReportBtnText}>Generate Report</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => {
              refetchReport();
              toast.info(isAgent ? 'Refreshed your call statistics' : 'Refreshed agent call statistics');
            }}
            activeOpacity={0.7}
          >
            <RefreshCw size={13} color="#0F9D58" />
            <Text style={styles.refreshBtnText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner Section */}
        <View style={styles.bannerRow}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.bannerTitle}>
                {isAgent ? 'My Calling Performance' : 'Agent Calling Performance'}
              </Text>
              <View style={styles.liveTag}>
                <View style={styles.liveDot} />
                <Text style={styles.liveTagText}>
                  {isAgent ? 'My Activity' : 'Real-Time Monitor'}
                </Text>
              </View>
            </View>
            <Text style={styles.bannerSubtitle}>
              {isAgent
                ? 'Track your dialed calls, connected conversations, and personal talk time.'
                : 'Live call volumes, customer talk time, and connection rates per agent.'}
            </Text>
          </View>
        </View>

        {/* 1. TEAM / AGENT SUMMARY KPI CARDS */}
        <View style={styles.kpiGrid}>
          {/* Card 1: Total Calls */}
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>
              {isAgent ? 'My Calls Dialed' : `Calls Dialed (${periodLabel})`}
            </Text>
            <Text style={styles.kpiValue}>{teamTotals.totalCalls}</Text>
            <Text style={styles.kpiSub}>
              {isAgent
                ? `Dialed ${periodLabel.toLowerCase()}`
                : `Across ${teamTotals.totalAgents} team agents`}
            </Text>
          </View>

          {/* Card 2: Connected Calls */}
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>
              {isAgent ? 'My Connected Calls' : 'Connected Calls'}
            </Text>
            <Text style={[styles.kpiValue, { color: '#0F9D58' }]}>
              {teamTotals.totalConnected}
            </Text>
            <Text style={styles.kpiSub}>{teamTotals.overallRate}% overall connect rate</Text>
          </View>

          {/* Card 3: Total Talk Time */}
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>
              {isAgent ? 'My Talk Time' : 'Total Talk Time'}
            </Text>
            <Text style={styles.kpiValue}>{teamTotals.formattedTalkTime}</Text>
            <Text style={styles.kpiSub}>Cumulative spoken hours</Text>
          </View>

          {/* Card 4: Active Agents / Connect Rate */}
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>
              {isAgent ? 'Connect Rate' : 'Active Dialing'}
            </Text>
            <Text style={[styles.kpiValue, { color: isAgent ? '#0F9D58' : '#2563EB' }]}>
              {isAgent ? `${teamTotals.overallRate}%` : teamTotals.activeDialingAgents}
            </Text>
            <Text style={styles.kpiSub}>
              {isAgent
                ? 'Successful customer pickups'
                : `Agents with active calls ${periodLabel.toLowerCase()}`}
            </Text>
          </View>
        </View>

        {/* 2. DATE FILTER TABS */}
        <View style={styles.dateTabsRow}>
          {(['TODAY', 'YESTERDAY', 'WEEK', 'MONTH', 'ALL'] as const).map((p) => {
            const isSelected = period === p;
            const label =
              p === 'TODAY'
                ? 'Today'
                : p === 'YESTERDAY'
                ? 'Yesterday'
                : p === 'WEEK'
                ? '7 Days'
                : p === 'MONTH'
                ? '30 Days'
                : 'All Time';

            return (
              <TouchableOpacity
                key={p}
                style={[styles.dateTab, isSelected && styles.dateTabActive]}
                onPress={() => setPeriod(p)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dateTabText, isSelected && styles.dateTabTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 3. BRANCH FILTER & SEARCH BAR (Admins & Managers Only) */}
        {!isAgent && (
          <>
            <View style={styles.filterBar}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6 }}
              >
                {['ALL', ...availableBranchNames].map((br) => {
                  const isSelected = selectedBranch.toLowerCase() === br.toLowerCase();
                  return (
                    <TouchableOpacity
                      key={br}
                      style={[styles.branchChip, isSelected && styles.branchChipActive]}
                      onPress={() => setSelectedBranch(br)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.branchChipText, isSelected && styles.branchChipTextActive]}>
                        {br === 'ALL' ? 'All Branches' : `${br} Branch`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.searchRow}>
              <View style={styles.searchInputWrap}>
                <Search size={16} color="#64748B" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search agent by name or email..."
                  placeholderTextColor="#94A3B8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <X size={14} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </>
        )}

        {/* Section Heading */}
        <View style={{ marginBottom: 10, marginTop: isAgent ? 12 : 4 }}>
          <Text style={styles.sectionHeaderTitle}>
            {isAgent ? 'MY CALL SUMMARY' : `AGENT ROSTER & CALL LOGS (${filteredAgents.length})`}
          </Text>
          <Text style={styles.sectionHeaderSubtitle}>
            {isAgent
              ? 'Tap your card below to inspect your detailed customer call logs & notes'
              : 'Tap any agent to drill into individual customer call logs & timeline'}
          </Text>
        </View>

        {/* 4. AGENTS CALL MONITOR LIST */}
        <View style={{ gap: 12, marginTop: 4 }}>
          {isReportLoading && filteredAgents.length === 0 ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#0F9D58" />
              <Text style={{ fontSize: 13, color: '#64748B', marginTop: 12 }}>
                Loading agent call statistics...
              </Text>
            </View>
          ) : filteredAgents.length === 0 ? (
            <View style={styles.emptyCard}>
              <Users size={36} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No Agents Found</Text>
              <Text style={styles.emptySub}>
                {searchQuery
                  ? 'No agent matches your search criteria.'
                  : 'No active calling agents registered in this branch.'}
              </Text>
            </View>
          ) : (
            filteredAgents.map((agent) => {
              const nameParts = typeof agent.name === 'string' ? agent.name.trim().split(/\s+/).filter(Boolean) : [];
              const initials =
                nameParts.length >= 2
                  ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
                  : nameParts.length === 1
                  ? nameParts[0].substring(0, 2).toUpperCase()
                  : 'AG';

              const connectRate =
                agent.calls > 0
                  ? ((agent.connected / agent.calls) * 100).toFixed(0) + '%'
                  : '0%';
              const totalTalkFormatted = formatSeconds(agent.totalDurationSeconds);
              const avgTalkFormatted = formatSeconds(agent.avgDurationSeconds);

              return (
                <TouchableOpacity
                  key={agent.userId}
                  style={styles.agentCard}
                  onPress={() => setSelectedAgentDetail(agent)}
                  activeOpacity={0.8}
                >
                  {/* Card Header */}
                  <View style={styles.cardHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                      <View style={styles.agentAvatar}>
                        <Text style={styles.agentAvatarText}>{initials}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={styles.agentName}>{agent.name}</Text>
                          <View style={styles.branchPill}>
                            <Text style={styles.branchPillText}>{agent.branch || 'Trichy'}</Text>
                          </View>
                        </View>
                        <Text style={styles.agentEmail} numberOfLines={1}>
                          {agent.email}
                        </Text>
                      </View>
                    </View>

                    {/* Drill-down chevron */}
                    <View style={styles.drillDownBtn}>
                      <Text style={styles.drillDownText}>Logs</Text>
                      <ChevronRight size={14} color="#0F9D58" strokeWidth={2.5} />
                    </View>
                  </View>

                  {/* Metrics Grid */}
                  <View style={styles.metricGrid}>
                    {/* Calls */}
                    <View style={styles.metricBox}>
                      <Text style={styles.metricNumber}>{agent.calls}</Text>
                      <Text style={styles.metricLabel}>Calls</Text>
                    </View>

                    {/* Connected */}
                    <View style={styles.metricBox}>
                      <Text style={[styles.metricNumber, { color: '#0F9D58' }]}>
                        {agent.connected}
                      </Text>
                      <Text style={styles.metricLabel}>Connected</Text>
                    </View>

                    {/* Not Connected */}
                    <View style={styles.metricBox}>
                      <Text style={[styles.metricNumber, { color: '#DC2626' }]}>
                        {agent.notConnected}
                      </Text>
                      <Text style={styles.metricLabel}>No Answer</Text>
                    </View>

                    {/* Total Talk Time */}
                    <View style={styles.metricBox}>
                      <Text style={[styles.metricNumber, { color: '#1F2937' }]}>
                        {totalTalkFormatted}
                      </Text>
                      <Text style={styles.metricLabel}>Total Talk</Text>
                    </View>

                    {/* Connect Rate */}
                    <View style={styles.metricBox}>
                      <Text style={[styles.metricNumber, { color: '#2563EB' }]}>
                        {connectRate}
                      </Text>
                      <Text style={styles.metricLabel}>Rate</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* 5. AGENT DETAILED CALL LOGS MODAL (Drill-Down) */}
      <Modal
        visible={Boolean(selectedAgentDetail)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedAgentDetail(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.modalTitle} numberOfLines={1}>
                    {selectedAgentDetail?.userId === currentUser?._id
                      ? 'My Call History & Log'
                      : `${selectedAgentDetail?.name}'s Call Log`}
                  </Text>
                  <View style={styles.branchPill}>
                    <Text style={styles.branchPillText}>
                      {selectedAgentDetail?.branch || 'Trichy'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.modalSubtitle}>
                  Showing individual calls made during {periodLabel}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                  style={styles.modalExportBtn}
                  onPress={handleExportAgentCallLogs}
                  disabled={isExportingAgentLog || selectedAgentCalls.length === 0}
                  activeOpacity={0.7}
                >
                  <Download size={13} color="#0F9D58" strokeWidth={2.4} />
                  <Text style={styles.modalExportBtnText}>
                    {isExportingAgentLog ? 'Exporting...' : 'Export Logs CSV'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => setSelectedAgentDetail(null)}
                >
                  <X size={18} color="#64748B" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Modal Summary KPI strip */}
            <View style={styles.modalSummaryStrip}>
              <View style={styles.modalSummaryItem}>
                <Text style={styles.modalSummaryVal}>{selectedAgentDetail?.calls || 0}</Text>
                <Text style={styles.modalSummaryLbl}>Total Calls</Text>
              </View>
              <View style={styles.modalSummaryItem}>
                <Text style={[styles.modalSummaryVal, { color: '#0F9D58' }]}>
                  {selectedAgentDetail?.connected || 0}
                </Text>
                <Text style={styles.modalSummaryLbl}>Connected</Text>
              </View>
              <View style={styles.modalSummaryItem}>
                <Text style={[styles.modalSummaryVal, { color: '#DC2626' }]}>
                  {selectedAgentDetail?.notConnected || 0}
                </Text>
                <Text style={styles.modalSummaryLbl}>No Pick</Text>
              </View>
              <View style={styles.modalSummaryItem}>
                <Text style={styles.modalSummaryVal}>
                  {formatSeconds(selectedAgentDetail?.totalDurationSeconds || 0)}
                </Text>
                <Text style={styles.modalSummaryLbl}>Talk Time</Text>
              </View>
            </View>

            {/* Calls List */}
            <ScrollView
              style={{ flex: 1, paddingHorizontal: 16 }}
              contentContainerStyle={{ paddingVertical: 12, gap: 10 }}
              showsVerticalScrollIndicator={false}
            >
              {selectedAgentCalls.length === 0 ? (
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <PhoneCall size={32} color="#94A3B8" />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#1F2937', marginTop: 10 }}>
                    No Call Details Recorded
                  </Text>
                  <Text style={{ fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 4 }}>
                    Detailed individual timestamps will automatically sync here as this agent dials contacts from their queue.
                  </Text>
                </View>
              ) : (
                selectedAgentCalls.map((act) => {
                  const actTime = act.createdAt
                    ? new Date(act.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Today';

                  const durFormatted = formatSeconds(act.durationSeconds || 0);

                  return (
                    <View key={act._id} style={styles.callRowCard}>
                      <View style={styles.callRowTop}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                          <View
                            style={[
                              styles.callStatusCircle,
                              { backgroundColor: act.connected ? '#ECFDF5' : '#FEF2F2' },
                            ]}
                          >
                            {act.connected ? (
                              <Phone size={14} color="#0F9D58" />
                            ) : (
                              <PhoneOff size={14} color="#DC2626" />
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.customerName} numberOfLines={1}>
                              {act.customerName || 'Customer Contact'}
                            </Text>
                            <Text style={styles.customerPhone}>
                              {formatDisplayPhone(act.phone || '')} · {actTime}
                            </Text>
                          </View>
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <Text
                            style={[
                              styles.callDuration,
                              { color: act.connected ? '#0F9D58' : '#DC2626' },
                            ]}
                          >
                            {act.connected ? durFormatted : 'No Answer'}
                          </Text>
                          <View style={styles.stageTag}>
                            <Text style={styles.stageTagText}>{act.stage || 'Contacted'}</Text>
                          </View>
                        </View>
                      </View>

                      {act.remark ? (
                        <View style={styles.remarkBox}>
                          <Text style={styles.remarkText} numberOfLines={2}>
                            📝 {act.remark}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 6. REPORT GENERATOR MODAL */}
      <ReportGeneratorModal
        visible={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        initialPeriod={period}
        initialBranch={selectedBranch}
        availableBranches={availableBranchNames}
        localStats={combinedAgentStats}
        localActivities={getAllActivities()}
      />
    </CrmShell>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  generateReportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F9D58',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
  },
  generateReportBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  refreshBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F9D58',
  },
  modalExportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  modalExportBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F9D58',
  },
  bannerRow: {
    marginBottom: 16,
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  bannerSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 4,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveTagText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#047857',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiLabel: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginVertical: 4,
  },
  kpiSub: {
    fontSize: 11,
    color: '#94A3B8',
  },
  dateTabsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    gap: 4,
  },
  dateTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
  },
  dateTabActive: {
    backgroundColor: '#E6F4EA',
  },
  dateTabText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  dateTabTextActive: {
    color: '#0F9D58',
    fontWeight: '800',
  },
  filterBar: {
    marginBottom: 10,
  },
  branchChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  branchChipActive: {
    backgroundColor: '#0F9D58',
    borderColor: '#0F9D58',
  },
  branchChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  branchChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  searchRow: {
    marginBottom: 12,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
  },
  sectionHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.6,
  },
  sectionHeaderSubtitle: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 36,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
  agentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  agentAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E6F4EA',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  agentAvatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#047857',
  },
  agentName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  agentEmail: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  branchPill: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  branchPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  drillDownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  drillDownText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F9D58',
  },
  metricGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    justifyContent: 'space-between',
  },
  metricBox: {
    alignItems: 'center',
    flex: 1,
  },
  metricNumber: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  metricLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '82%',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSummaryStrip: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    justifyContent: 'space-between',
  },
  modalSummaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  modalSummaryVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSummaryLbl: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  callRowCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  callRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  callStatusCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  customerPhone: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  callDuration: {
    fontSize: 13,
    fontWeight: '700',
  },
  stageTag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    marginTop: 3,
  },
  stageTagText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#475569',
  },
  remarkBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    padding: 6,
    marginTop: 8,
  },
  remarkText: {
    fontSize: 11,
    color: '#475569',
  },
});
