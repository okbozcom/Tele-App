import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  StyleSheet,
  Alert,
  AppState,
  AppStateStatus,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  X,
  ArrowUpRight,
  AlertTriangle,
  Phone,
  MessageCircle,
  Flame,
  Sun,
  Snowflake,
  CheckCircle2,
  Clock,
  RotateCw,
  Clock3,
  CalendarClock,
  FileEdit,
} from 'lucide-react-native';

import { fetchMyLeads, disposeLead } from '../api/leadApi';
import { notificationService } from '../services/notification.service';
import { callService } from '../services/call.service';
import { callSession } from '../services/callSession';
import { Lead, RootStackParamList } from '../types';
import { colors } from '../theme';
import { useAuthStore } from '../store/authStore';
import { useLeadHistoryStore } from '../store/leadHistoryStore';
import { CrmShell } from '../components/CrmShell';
import { LeadQuickModal } from '../components/LeadQuickModal';
import { WhatsAppTemplateModal } from '../components/WhatsAppTemplateModal';
import { formatDisplayPhone } from '../utils/phoneUtils';
import { adjustForCallingHours } from '../utils/callingHours';
import { toast } from '../store/toastStore';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type TabCategory = 'Overdue' | 'Today' | 'Upcoming';

interface FollowUpItem {
  _id: string;
  name: string;
  phone: string;
  campaignId?: string;
  campaignName: string;
  attempts: number;
  assignedAgent: string;
  status: string;
  time: string;
  date: string;
  category: TabCategory;
  temperature?: 'HOT' | 'WARM' | 'COLD';
  rawDate: Date;
  lastRemark?: string;
  rawLead?: Lead;
}

// Design Tokens (Hi Talk brand palette)
const T = {
  radius: { sm: 10, md: 14, lg: 16 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 },
  color: {
    bg: '#F6F8FA',
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
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
};

// Safe Initials Helper (Zero Crash)
const getInitials = (name?: string, fallback = 'LD') => {
  if (!name || typeof name !== 'string') return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const getCountdownLabel = (rawDate: Date, category: TabCategory) => {
  const now = new Date().getTime();
  const target = rawDate.getTime();
  const diffMs = target - now;

  if (category === 'Overdue' || diffMs < 0) {
    const overdueMins = Math.floor(Math.abs(diffMs) / (1000 * 60));
    if (overdueMins < 60) {
      return `${Math.max(1, overdueMins)}m overdue`;
    }
    const overdueHours = Math.floor(overdueMins / 60);
    if (overdueHours < 24) {
      return `${overdueHours}h overdue`;
    }
    const days = Math.floor(overdueHours / 24);
    return `${days}d overdue`;
  }

  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 60) {
    return `Due in ${Math.max(1, diffMins)}m`;
  }
  const hours = Math.floor(diffMins / 60);
  if (hours < 24) {
    return `Due in ${hours}h ${diffMins % 60}m`;
  }
  const days = Math.floor(hours / 24);
  return `In ${days} day${days > 1 ? 's' : ''}`;
};

// ======================================================================
// MEMOIZED NEODOVE-GRADE FOLLOW-UP CARD
// ======================================================================
interface FollowUpCardProps {
  item: FollowUpItem;
  onCall: (item: FollowUpItem) => void;
  onSnooze: (item: FollowUpItem) => void;
  onWhatsApp: (item: FollowUpItem) => void;
  onOpen: (item: FollowUpItem) => void;
}

const FollowUpCard = React.memo<FollowUpCardProps>(({ item, onCall, onSnooze, onWhatsApp, onOpen }) => {
  const initials = getInitials(item.name);
  const isHot = item.temperature === 'HOT';
  const isCold = item.temperature === 'COLD';
  const isOverdue = item.category === 'Overdue';
  const countdownText = getCountdownLabel(item.rawDate, item.category);

  return (
    <View style={styles.followupCard}>
      {/* Top Row: Avatar + Name & Phone + Countdown Badge */}
      <View style={styles.cardHeaderRow}>
        <View style={[styles.avatarCircle, isOverdue && styles.avatarCircleOverdue]}>
          <Text style={[styles.avatarText, isOverdue && styles.avatarTextOverdue]}>{initials}</Text>
        </View>

        <View style={styles.leadInfoCol}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.customerName} numberOfLines={1}>
              {item.name || 'Lead Contact'}
            </Text>
            {/* Priority Pill */}
            <View
              style={[
                styles.priorityPill,
                isHot
                  ? styles.priorityHot
                  : isCold
                  ? styles.priorityCold
                  : styles.priorityWarm,
              ]}
            >
              {isHot ? (
                <Flame size={10} color={T.color.danger} fill={T.color.danger} />
              ) : isCold ? (
                <Snowflake size={10} color={T.color.info} />
              ) : (
                <Sun size={10} color={T.color.warn} />
              )}
              <Text
                style={[
                  styles.priorityPillText,
                  { color: isHot ? T.color.danger : isCold ? T.color.info : T.color.warn },
                ]}
              >
                {item.temperature || 'Warm'}
              </Text>
            </View>
          </View>

          {/* Phone Number */}
          <Text style={styles.customerPhone}>
            {formatDisplayPhone(item.phone)}
          </Text>
        </View>

        {/* Countdown Badge Pill */}
        <View
          style={[
            styles.countdownBadge,
            isOverdue
              ? styles.countdownBadgeOverdue
              : item.category === 'Today'
              ? styles.countdownBadgeToday
              : styles.countdownBadgeUpcoming,
          ]}
        >
          <Clock3
            size={11}
            color={
              isOverdue ? T.color.danger : item.category === 'Today' ? T.color.warn : T.color.info
            }
          />
          <Text
            style={[
              styles.countdownText,
              {
                color:
                  isOverdue ? T.color.danger : item.category === 'Today' ? T.color.warn : T.color.info,
              },
            ]}
          >
            {countdownText}
          </Text>
        </View>
      </View>

      {/* Last Remark Preview Line */}
      <View style={styles.remarkPreviewBox}>
        <Clock size={12} color={T.color.textMuted} />
        <Text style={styles.remarkPreviewText} numberOfLines={1}>
          {item.lastRemark || 'Customer requested callback to discuss details'}
        </Text>
      </View>

      {/* Bottom Action Row (1-Tap Fast Actions) */}
      <View style={styles.actionButtonsRow}>
        {/* Call Now Button */}
        <TouchableOpacity
          style={styles.callNowBtn}
          onPress={() => onCall(item)}
          activeOpacity={0.85}
        >
          <Phone size={13} color="#FFFFFF" strokeWidth={2.5} />
          <Text style={styles.callNowBtnText}>Call now</Text>
        </TouchableOpacity>

        {/* Snooze Button */}
        <TouchableOpacity
          style={styles.snoozeBtn}
          onPress={() => onSnooze(item)}
          activeOpacity={0.8}
        >
          <Clock3 size={13} color={T.color.warn} strokeWidth={2.5} />
          <Text style={styles.snoozeBtnText}>Snooze</Text>
        </TouchableOpacity>

        {/* WhatsApp Button */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => onWhatsApp(item)}
          activeOpacity={0.8}
        >
          <MessageCircle size={14} color={T.color.primaryDark} strokeWidth={2.5} />
        </TouchableOpacity>

        {/* Details / Modal Button */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => onOpen(item)}
          activeOpacity={0.8}
        >
          <FileEdit size={14} color={T.color.info} strokeWidth={2} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

// ======================================================================
// MAIN SCREEN
// ======================================================================
export const FollowUpsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuthStore();
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabCategory>('Today');
  const [searchQuery, setSearchQuery] = useState('');
  const [quickModalLead, setQuickModalLead] = useState<Lead | null>(null);
  const [whatsAppModalVisible, setWhatsAppModalVisible] = useState(false);
  const [whatsAppTarget, setWhatsAppTarget] = useState<{ name: string; phone: string } | null>(null);
  const [tick, setTick] = useState(0);

  // Live timer tick: update overdue and countdown labels every minute
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  // Calling & Telephony Tracking
  const callStartTimeRef = useRef<number | null>(null);
  const callingLeadRef = useRef<Lead | null>(null);
  const isCallingRef = useRef<boolean>(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const { addActivity } = useLeadHistoryStore();

  // Real backend query for follow-ups
  const { data: realFollowupsData, refetch, isRefetching } = useQuery({
    queryKey: ['followUps'],
    queryFn: () => fetchMyLeads({ type: 'FOLLOW_UP', limit: 500 }),
  });

  const handleOpenLead = useCallback((item: FollowUpItem) => {
    if (item.rawLead) {
      setQuickModalLead(item.rawLead);
      return;
    }
    const syntheticLead: Lead = {
      _id: item._id,
      campaignId: item.campaignId || 'default-camp',
      name: item.name || 'Lead Contact',
      phone: item.phone,
      source: 'OUTREACH',
      stage: item.status,
      tag: item.temperature,
      temperature: item.temperature,
      status: 'OPEN',
      attemptCount: item.attempts,
      nextFollowUpAt: item.rawDate.toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      customProperties: { campaign: item.campaignName, lastRemark: item.lastRemark || '' },
    };
    setQuickModalLead(syntheticLead);
  }, []);

  // Native Calling Handler (NeoDove Standard)
  const handleDirectCall = useCallback(async (item: FollowUpItem) => {
    if (isCallingRef.current || callSession.isCallInProgress()) {
      toast.warning('A call is already in progress');
      return;
    }

    const fullLead: Lead = item.rawLead || {
      _id: item._id,
      campaignId: item.campaignId || 'default-camp',
      name: item.name || 'Lead Contact',
      phone: item.phone,
      source: 'FOLLOW_UP',
      stage: item.status || 'Follow Up',
      tag: item.temperature,
      temperature: item.temperature,
      status: 'OPEN',
      attemptCount: item.attempts,
      nextFollowUpAt: item.rawDate?.toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      customProperties: { campaign: item.campaignName, lastRemark: item.lastRemark || '' },
    };

    if (Platform.OS === 'android') {
      const hasPerm = await callService.checkPermissions();
      if (!hasPerm) {
        Alert.alert('Permission Required', 'Phone call permissions are required to dial leads.');
        return;
      }
    }

    try {
      await callSession.startCall(fullLead, {
        callerSource: 'FOLLOW_UPS',
        onCallComplete: () => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ['followUps'] });
          queryClient.invalidateQueries({ queryKey: ['myLeadsList'] });
          queryClient.invalidateQueries({ queryKey: ['homeDashboard'] });
        },
      });
    } catch {
      Alert.alert(
        'Unable to dial',
        `Could not open phone dialer for ${item.phone}. Would you like to record an outcome manually?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Update Outcome',
            onPress: () => handleOpenLead(item),
          },
        ]
      );
    }
  }, [refetch, queryClient, handleOpenLead]);

  // Direct WhatsApp Handler
  const handleOpenWhatsApp = useCallback((item: FollowUpItem) => {
    setWhatsAppTarget({
      name: item.name,
      phone: item.phone,
    });
    setWhatsAppModalVisible(true);
  }, []);

  // Quick Snooze Handler (Snooze +2 Hours or Tomorrow 10 AM, adjusted for Calling Hours 09:00 - 20:00 IST)
  const handleQuickSnooze = useCallback((item: FollowUpItem) => {
    Alert.alert(
      'Snooze Follow-up',
      `Reschedule callback for ${item.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: '+2 Hours',
          onPress: async () => {
            const baseDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
            const nextTime = adjustForCallingHours(baseDate).toISOString();
            try {
              await disposeLead(item._id, {
                connected: false,
                callAttempt: false,
                stage: 'Follow Up',
                remark: 'Snoozed by 2 hours',
                followUpAt: nextTime,
                durationSeconds: 0,
              });
              addActivity(item._id, {
                phone: item.phone,
                agentName: user?.name || 'Agent',
                agentId: user?._id,
                connected: false,
                type: 'UPDATE',
                stage: 'Follow Up',
                remark: 'Follow-up snoozed +2 hours',
                followUpAt: nextTime,
                durationSeconds: 0,
              });
              notificationService.scheduleFollowUpReminder(
                { _id: item._id, name: item.name, phone: item.phone } as any,
                nextTime,
              );
              queryClient.invalidateQueries({ queryKey: ['followUps'] });
              queryClient.invalidateQueries({ queryKey: ['myLeadsList'] });
              queryClient.invalidateQueries({ queryKey: ['homeDashboard'] });
              refetch();
              toast.success(`Rescheduled ${item.name} for 2 hours later`, 'Snoozed');
            } catch (err: any) {
              Alert.alert('Update Failed', err?.message || 'Could not reschedule follow-up. Please check your connection.');
            }
          },
        },
        {
          text: 'Tomorrow 10 AM',
          onPress: async () => {
            const d = new Date();
            d.setDate(d.getDate() + 1);
            d.setHours(10, 0, 0, 0);
            const nextTime = adjustForCallingHours(d).toISOString();
            try {
              await disposeLead(item._id, {
                connected: false,
                callAttempt: false,
                stage: 'Follow Up',
                remark: 'Snoozed to Tomorrow 10 AM',
                followUpAt: nextTime,
                durationSeconds: 0,
              });
              addActivity(item._id, {
                phone: item.phone,
                agentName: user?.name || 'Agent',
                agentId: user?._id,
                connected: false,
                type: 'UPDATE',
                stage: 'Follow Up',
                remark: 'Follow-up snoozed to Tomorrow 10 AM',
                followUpAt: nextTime,
                durationSeconds: 0,
              });
              notificationService.scheduleFollowUpReminder(
                { _id: item._id, name: item.name, phone: item.phone } as any,
                nextTime,
              );
              queryClient.invalidateQueries({ queryKey: ['followUps'] });
              queryClient.invalidateQueries({ queryKey: ['myLeadsList'] });
              queryClient.invalidateQueries({ queryKey: ['homeDashboard'] });
              refetch();
              toast.success(`Rescheduled ${item.name} for Tomorrow 10 AM`, 'Snoozed');
            } catch (err: any) {
              Alert.alert('Update Failed', err?.message || 'Could not reschedule follow-up. Please check your connection.');
            }
          },
        },
      ],
    );
  }, [addActivity, queryClient, refetch, user]);

  // Extract real follow-ups from backend leads and local follow-ups
  const combinedItems: FollowUpItem[] = useMemo(() => {
    const list: FollowUpItem[] = [];
    const seenIds = new Set<string>();

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1;

    // 1. From real backend leads
    const realLeads = realFollowupsData?.leads || [];
    for (const l of realLeads) {
      if (!l._id || seenIds.has(l._id)) continue;
      seenIds.add(l._id);

      const campId = l.campaignId || (typeof l.campaign === 'object' && l.campaign ? (l.campaign as any)._id : undefined);
      const camp = typeof l.campaign === 'object' && l.campaign ? l.campaign.name : (l.customProperties?.campaign || 'Campaign');
      const dateObj = l.nextFollowUpAt ? new Date(l.nextFollowUpAt) : new Date();
      const fTime = dateObj.getTime();

      let cat: TabCategory = 'Today';
      if (fTime < now.getTime()) {
        cat = 'Overdue';
      } else if (fTime >= startOfToday && fTime <= endOfToday) {
        cat = 'Today';
      } else {
        cat = 'Upcoming';
      }

      const temp = (l.temperature || (l.tag?.toUpperCase() === 'HOT' ? 'HOT' : l.tag?.toUpperCase() === 'COLD' ? 'COLD' : 'WARM')) as 'HOT' | 'WARM' | 'COLD';
      const lastNote = l.customProperties?.lastRemark || (l.attemptCount && l.attemptCount > 0 ? 'Requested detailed callback' : 'Initial follow-up scheduled');

      list.push({
        _id: l._id,
        name: l.name || 'Lead Contact',
        phone: l.phone,
        campaignId: campId,
        campaignName: camp,
        attempts: l.attemptCount || 1,
        assignedAgent: user?.name || 'You',
        status: l.stage || 'Follow Up',
        time: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        category: cat,
        temperature: temp,
        rawDate: dateObj,
        lastRemark: lastNote,
        rawLead: l,
      });
    }

    // 2. From local activities that scheduled a followUpAt
    const localActs = useLeadHistoryStore.getState().getAllActivities(user?._id || user?.name);
    for (const act of localActs) {
      if (act.followUpAt && act.leadId && !seenIds.has(act.leadId)) {
        seenIds.add(act.leadId);
        const dateObj = new Date(act.followUpAt);
        if (!isNaN(dateObj.getTime())) {
          const fTime = dateObj.getTime();
          let cat: TabCategory = 'Today';
          if (fTime < now.getTime()) {
            cat = 'Overdue';
          } else if (fTime >= startOfToday && fTime <= endOfToday) {
            cat = 'Today';
          } else {
            cat = 'Upcoming';
          }

          list.push({
            _id: act.leadId,
            name: act.customerName || 'Lead Contact',
            phone: act.phone || '',
            campaignId: act.campaignId,
            campaignName: 'Assigned Leads',
            attempts: 1,
            assignedAgent: user?.name || 'You',
            status: act.stage || 'Follow Up',
            time: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            date: dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' }),
            category: cat,
            temperature: (act.temperature as any) || 'WARM',
            rawDate: dateObj,
            lastRemark: act.remark || 'Scheduled callback note',
          });
        }
      }
    }

    return list.sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());
  }, [realFollowupsData, user?._id, user?.name, tick]);

  // Tab counts
  const overdueCount = useMemo(() => combinedItems.filter((i) => i.category === 'Overdue').length, [combinedItems]);
  const todayCount = useMemo(() => combinedItems.filter((i) => i.category === 'Today').length, [combinedItems]);
  const upcomingCount = useMemo(() => combinedItems.filter((i) => i.category === 'Upcoming').length, [combinedItems]);

  // Filtered Items
  const displayedItems = useMemo(() => {
    let items = combinedItems.filter((i) => i.category === activeTab);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      items = items.filter(
        (i) => (i.name && i.name.toLowerCase().includes(q)) || (i.phone && i.phone.includes(q)),
      );
    }
    return items;
  }, [combinedItems, activeTab, searchQuery]);

  // Render Item for Virtualized FlatList
  const renderItem = useCallback(
    ({ item }: { item: FollowUpItem }) => (
      <FollowUpCard
        item={item}
        onCall={handleDirectCall}
        onSnooze={handleQuickSnooze}
        onWhatsApp={handleOpenWhatsApp}
        onOpen={handleOpenLead}
      />
    ),
    [handleDirectCall, handleQuickSnooze, handleOpenWhatsApp, handleOpenLead],
  );

  // FlatList Header Component
  const renderHeader = useCallback(
    () => (
      <View>
        {/* Top Header Summary */}
        <View style={styles.headerBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Follow-up callbacks</Text>
            <Text style={styles.bannerSubtitle}>
              {todayCount > 0
                ? `${todayCount} scheduled callbacks for today`
                : 'All follow-up callbacks are organized.'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => {
              refetch();
              toast.info('Refreshed callbacks');
            }}
            activeOpacity={0.7}
          >
            <RotateCw size={13} color={T.color.textMuted} />
            <Text style={styles.refreshBtnText}>{isRefetching ? 'Syncing...' : 'Refresh'}</Text>
          </TouchableOpacity>
        </View>

        {/* Overdue Attention Banner if any */}
        {overdueCount > 0 && (
          <TouchableOpacity
            style={styles.overdueAlertBanner}
            onPress={() => setActiveTab('Overdue')}
            activeOpacity={0.8}
          >
            <View style={styles.overdueIconBubble}>
              <AlertTriangle size={15} color={T.color.danger} strokeWidth={2.5} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.overdueAlertTitle}>
                {overdueCount} overdue callback{overdueCount > 1 ? 's' : ''} need attention
              </Text>
              <Text style={styles.overdueAlertSub}>
                Tap here to clear and call overdue customers now
              </Text>
            </View>
            <ArrowUpRight size={14} color={T.color.danger} />
          </TouchableOpacity>
        )}

        {/* Search Bar */}
        <View style={styles.searchBarWrap}>
          <Search size={16} color={T.color.textFaint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search scheduled contact by name or number"
            placeholderTextColor={T.color.textFaint}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={14} color={T.color.textFaint} />
            </TouchableOpacity>
          )}
        </View>

        {/* 3 Segmented Tabs: Overdue / Today / Upcoming */}
        <View style={styles.segmentedTabsRow}>
          {/* Overdue Tab */}
          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === 'Overdue' && styles.tabBtnActiveOverdue,
            ]}
            onPress={() => setActiveTab('Overdue')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'Overdue' && { color: T.color.danger, fontWeight: '800' },
              ]}
            >
              Overdue
            </Text>
            <View
              style={[
                styles.tabBadge,
                { backgroundColor: overdueCount > 0 ? '#FEE2E2' : T.color.surfaceSunken },
                activeTab === 'Overdue' && { backgroundColor: T.color.danger },
              ]}
            >
              <Text
                style={[
                  styles.tabBadgeText,
                  { color: overdueCount > 0 ? T.color.danger : T.color.textMuted },
                  activeTab === 'Overdue' && { color: '#FFFFFF' },
                ]}
              >
                {overdueCount}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Today Tab */}
          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === 'Today' && styles.tabBtnActiveToday,
            ]}
            onPress={() => setActiveTab('Today')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'Today' && { color: T.color.warn, fontWeight: '800' },
              ]}
            >
              Today
            </Text>
            <View
              style={[
                styles.tabBadge,
                { backgroundColor: todayCount > 0 ? '#FEF3C7' : T.color.surfaceSunken },
                activeTab === 'Today' && { backgroundColor: T.color.warn },
              ]}
            >
              <Text
                style={[
                  styles.tabBadgeText,
                  { color: todayCount > 0 ? T.color.warn : T.color.textMuted },
                  activeTab === 'Today' && { color: '#FFFFFF' },
                ]}
              >
                {todayCount}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Upcoming Tab */}
          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === 'Upcoming' && styles.tabBtnActiveUpcoming,
            ]}
            onPress={() => setActiveTab('Upcoming')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'Upcoming' && { color: T.color.info, fontWeight: '800' },
              ]}
            >
              Upcoming
            </Text>
            <View
              style={[
                styles.tabBadge,
                { backgroundColor: upcomingCount > 0 ? T.color.infoTint : T.color.surfaceSunken },
                activeTab === 'Upcoming' && { backgroundColor: T.color.info },
              ]}
            >
              <Text
                style={[
                  styles.tabBadgeText,
                  { color: upcomingCount > 0 ? T.color.info : T.color.textMuted },
                  activeTab === 'Upcoming' && { color: '#FFFFFF' },
                ]}
              >
                {upcomingCount}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    ),
    [activeTab, isRefetching, overdueCount, refetch, searchQuery, todayCount, upcomingCount],
  );

  // FlatList Empty Component
  const renderEmpty = useCallback(
    () => (
      <View style={styles.emptyStateCard}>
        <CheckCircle2 size={38} color={T.color.primary} />
        <Text style={styles.emptyStateTitle}>
          {activeTab === 'Today'
            ? 'No follow-up callbacks due today! 🎉'
            : activeTab === 'Overdue'
            ? 'Zero overdue callbacks! Great job. 👍'
            : 'No upcoming callbacks scheduled.'}
        </Text>
        <Text style={styles.emptyStateSubtitle}>
          {activeTab === 'Today'
            ? 'You are all caught up with your scheduled calls.'
            : 'Future follow-ups will appear here automatically.'}
        </Text>
        <TouchableOpacity
          style={styles.emptyQueueBtn}
          onPress={() => navigation.navigate('MyLeads')}
          activeOpacity={0.8}
        >
          <Phone size={14} color="#FFFFFF" strokeWidth={2.5} />
          <Text style={styles.emptyQueueBtnText}>Go to calling queue</Text>
        </TouchableOpacity>
      </View>
    ),
    [activeTab, navigation],
  );

  return (
    <CrmShell
      title="Scheduled Follow-ups"
      headerIcon={<CalendarClock size={15} color={colors.textSecondary} />}
    >
      <View style={styles.container}>
        <FlatList
          data={displayedItems}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
        />
      </View>

      {/* Embedded Lead Quick Modal */}
      {quickModalLead && (
        <LeadQuickModal
          lead={quickModalLead}
          visible={Boolean(quickModalLead)}
          onClose={() => setQuickModalLead(null)}
          onOpenFullDispose={(leadToDispose) => {
            setQuickModalLead(null);
            navigation.navigate('Dispose', { lead: leadToDispose });
          }}
        />
      )}

      {/* Direct WhatsApp Template Modal */}
      {whatsAppModalVisible && whatsAppTarget && (
        <WhatsAppTemplateModal
          visible={whatsAppModalVisible}
          onClose={() => setWhatsAppModalVisible(false)}
          customerName={whatsAppTarget.name}
          customerPhone={whatsAppTarget.phone}
        />
      )}
    </CrmShell>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.color.bg,
  },
  contentContainer: {
    padding: 12,
    paddingBottom: 110,
  },
  headerBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bannerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: T.color.text,
    letterSpacing: -0.3,
  },
  bannerSubtitle: {
    fontSize: 11.5,
    color: T.color.textMuted,
    marginTop: 2,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: T.color.surface,
    borderWidth: 1,
    borderColor: T.color.border,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  refreshBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: T.color.text,
  },
  overdueAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.color.dangerTint,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
  },
  overdueIconBubble: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overdueAlertTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#991B1B',
  },
  overdueAlertSub: {
    fontSize: 10.5,
    color: '#B91C1C',
    marginTop: 1,
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.color.surface,
    borderWidth: 1,
    borderColor: T.color.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 36,
    gap: 6,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: T.color.text,
    paddingVertical: 0,
  },
  segmentedTabsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.color.surface,
    borderWidth: 1,
    borderColor: T.color.border,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 5,
  },
  tabBtnActiveOverdue: {
    backgroundColor: T.color.dangerTint,
    borderColor: '#FCA5A5',
    borderWidth: 1.5,
  },
  tabBtnActiveToday: {
    backgroundColor: T.color.warnTint,
    borderColor: '#FDE68A',
    borderWidth: 1.5,
  },
  tabBtnActiveUpcoming: {
    backgroundColor: T.color.infoTint,
    borderColor: '#BFDBFE',
    borderWidth: 1.5,
  },
  tabLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: T.color.textMuted,
  },
  tabBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
  },
  tabBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  followupCard: {
    backgroundColor: T.color.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.color.border,
    padding: 10,
    marginBottom: 8,
    ...T.shadowCard,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: T.color.primaryTint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarCircleOverdue: {
    backgroundColor: T.color.dangerTint,
  },
  avatarText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: T.color.primaryDark,
  },
  avatarTextOverdue: {
    color: T.color.danger,
  },
  leadInfoCol: {
    flex: 1,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '700',
    color: T.color.text,
  },
  customerPhone: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginTop: 1,
  },
  priorityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    borderWidth: 1,
  },
  priorityHot: {
    backgroundColor: T.color.dangerTint,
    borderColor: '#FECACA',
  },
  priorityWarm: {
    backgroundColor: T.color.warnTint,
    borderColor: '#FDE68A',
  },
  priorityCold: {
    backgroundColor: T.color.infoTint,
    borderColor: '#BFDBFE',
  },
  priorityPillText: {
    fontSize: 9,
    fontWeight: '800',
  },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  countdownBadgeOverdue: {
    backgroundColor: T.color.dangerTint,
    borderColor: '#FECACA',
  },
  countdownBadgeToday: {
    backgroundColor: T.color.warnTint,
    borderColor: '#FDE68A',
  },
  countdownBadgeUpcoming: {
    backgroundColor: T.color.infoTint,
    borderColor: '#BFDBFE',
  },
  countdownText: {
    fontSize: 10,
    fontWeight: '800',
  },
  remarkPreviewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: T.color.surfaceSunken,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: T.color.border,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  remarkPreviewText: {
    fontSize: 10.5,
    color: T.color.textMuted,
    fontWeight: '500',
    flex: 1,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  callNowBtn: {
    flex: 1.5,
    height: 32,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: T.color.primary,
    borderRadius: 8,
    shadowColor: T.color.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
    elevation: 1,
  },
  callNowBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  snoozeBtn: {
    flex: 1.1,
    height: 32,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: T.color.warnTint,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
  },
  snoozeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: T.color.warn,
  },
  iconBtn: {
    width: 32,
    height: 32,
    minHeight: 32,
    borderRadius: 8,
    backgroundColor: T.color.surfaceSunken,
    borderWidth: 1,
    borderColor: T.color.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateCard: {
    backgroundColor: T.color.surface,
    borderRadius: T.radius.md + 2,
    padding: T.space.xl + 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: T.color.border,
    marginTop: 20,
    ...T.shadowCard,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: T.color.text,
    marginTop: T.space.sm + 2,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: 12,
    color: T.color.textMuted,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 260,
    lineHeight: 16,
  },
  emptyQueueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.space.sm - 2,
    backgroundColor: T.color.primary,
    paddingHorizontal: T.space.lg,
    paddingVertical: T.space.sm + 2,
    borderRadius: T.radius.sm,
    marginTop: T.space.md + 2,
  },
  emptyQueueBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
