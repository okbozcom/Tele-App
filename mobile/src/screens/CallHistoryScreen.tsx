import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ScrollView,
  TextInput,
  Alert,
  useWindowDimensions,
  AppState,
  AppStateStatus,
  Platform,
  KeyboardAvoidingView,
  RefreshControl,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import {
  PhoneCall,
  Phone,
  MessageCircle,
  Search,
  X,
  Calendar,
  Clock,
  Clock3,
  Flame,
  Sun,
  Snowflake,
  CheckCircle2,
  PhoneOff,
  RotateCw,
  TrendingUp,
  PhoneOutgoing,
  PhoneIncoming,
  PhoneMissed,
  BookmarkCheck,
  Filter,
} from 'lucide-react-native';

import { CrmShell } from '../components/CrmShell';
import { useLeadHistoryStore, deduplicateActivities } from '../store/leadHistoryStore';
import { callSession } from '../services/callSession';
import { incomingCallSyncService } from '../services/incomingCallSync.service';
import { useAuthStore } from '../store/authStore';
import { fetchUserActivities, fetchCampaigns } from '../api/leadApi';
import { Activity, CustomerTemperature, Lead, RootStackParamList } from '../types';
import { formatDisplayPhone, normalizePhoneDigits } from '../utils/phoneUtils';
import { WhatsAppTemplateModal } from '../components/WhatsAppTemplateModal';
import { LeadQuickModal } from '../components/LeadQuickModal';
import { CrmDateTimePickerModal } from '../components/CrmDateTimePickerModal';
import { TagManagerModal } from '../components/TagManagerModal';
import { callService } from '../services/call.service';
import { toast } from '../store/toastStore';
import { colors } from '../theme';

type DateFilter = 'TODAY' | 'YESTERDAY' | 'WEEK' | 'CUSTOM' | 'ALL';
type StageFilter = 'ALL' | 'CONNECTED' | 'INTERESTED' | 'FOLLOW_UP' | 'NOT_CONNECTED';
type DirectionTab = 'ALL' | 'OUTGOING' | 'INCOMING';

// Safe initials helper
const getInitials = (name?: string, fallback = 'CL') => {
  if (!name || typeof name !== 'string') return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

// Formats date & time matching NeoDove format: "04:52 PM, 29 Aug 2023"
const formatCallDetails = (isoString?: string) => {
  if (!isoString) return 'Recent';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    const day = d.getDate();
    const month = d.toLocaleDateString([], { month: 'short' });
    const year = d.getFullYear();
    return `${timeStr}, ${day} ${month} ${year}`;
  } catch {
    return isoString;
  }
};

const formatDuration = (seconds?: number, connected?: boolean) => {
  if (!connected) return 'Not connected';
  if (!seconds || seconds <= 0) return 'Connected (0s)';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
};

// ======================================================================
// MEMOIZED NEODOVE CALL LOG CARD (MATCHING IMAGE 2 EXACTLY)
// ======================================================================
// Canonical incoming call detector:
// An activity is INCOMING only if direction is explicitly INCOMING, or prefixed with 'inc-'.
// Outgoing calls (even if unanswered or marked 'Missed Call') are NEVER classified as incoming.
export const isActivityIncoming = (act: Activity): boolean => {
  const dir = ((act as any).direction || '').toUpperCase();
  if (dir === 'OUTGOING') return false;
  if (dir === 'INCOMING') return true;
  if ((act as any).callType === 'INCOMING') return true;
  if (act._id && act._id.startsWith('inc-')) return true;
  return act.stage === 'Missed Call' && dir !== 'OUTGOING';
};

interface CallCardProps {
  act: Activity;
  campaignName: string;
  onCallAgain: (act: Activity) => void;
  onOpenWhatsApp: (act: Activity) => void;
  onOpenLead: (act: Activity) => void;
  onTagLead: (act: Activity) => void;
}

const CallHistoryCard = React.memo<CallCardProps>(
  ({ act, campaignName, onCallAgain, onOpenWhatsApp, onOpenLead, onTagLead }) => {
    const displayName =
      act.customerName ||
      (act.phone ? `Customer (${formatDisplayPhone(act.phone)})` : 'Lead Contact');
    const isConnected = Boolean(act.connected);
    const isIncoming = isActivityIncoming(act);
    const isMissed = act.stage === 'Missed Call' || (!isConnected && isIncoming);

    return (
      <TouchableOpacity
        style={styles.logCard}
        onPress={() => onOpenLead(act)}
        activeOpacity={0.88}
      >
        {/* Main Content Row: Info Details on Left + Quick Action Buttons on Right */}
        <View style={styles.logCardTopRow}>
          <View style={styles.logFieldsCol}>
            {/* Name */}
            <View style={styles.logFieldRow}>
              <Text style={styles.logFieldLabel}>Name: </Text>
              <Text style={styles.logFieldValueBold} numberOfLines={1}>
                {displayName}
              </Text>
            </View>

            {/* Number */}
            <TouchableOpacity
              style={styles.logFieldRow}
              onPress={(e) => {
                e.stopPropagation();
                onCallAgain(act);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.logFieldLabel}>Number: </Text>
              <Text style={styles.logFieldValuePhone}>
                {act.phone ? formatDisplayPhone(act.phone) : 'No phone'}
              </Text>
            </TouchableOpacity>

            {/* Campaign */}
            <View style={styles.logFieldRow}>
              <Text style={styles.logFieldLabel}>Campaign: </Text>
              <Text style={styles.logFieldValueCampaign} numberOfLines={1}>
                {campaignName}
              </Text>
            </View>

            {/* Call Details */}
            <View style={styles.logFieldRow}>
              <Text style={styles.logFieldLabel}>Call Details: </Text>
              <Text style={styles.logFieldValueDetails}>
                {formatCallDetails(act.createdAt)}
              </Text>
            </View>
          </View>

          {/* Quick Action Buttons (Call, WhatsApp, Tag Lead) */}
          <View style={styles.topRightActionsCol}>
            <TouchableOpacity
              style={styles.actionCallBtn}
              onPress={(e) => {
                e.stopPropagation();
                onCallAgain(act);
              }}
              activeOpacity={0.8}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityLabel="Call customer"
            >
              <Phone size={15} color="#FFFFFF" strokeWidth={2.5} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionWhatsAppBtn}
              onPress={(e) => {
                e.stopPropagation();
                onOpenWhatsApp(act);
              }}
              activeOpacity={0.8}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityLabel="Open WhatsApp"
            >
              <MessageCircle size={15} color="#FFFFFF" strokeWidth={2.5} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionTagBtn}
              onPress={(e) => {
                e.stopPropagation();
                onTagLead(act);
              }}
              activeOpacity={0.8}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityLabel="Tag lead to manager"
            >
              <BookmarkCheck size={15} color="#4F46E5" strokeWidth={2.3} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Status / Duration / Remark pill strip */}
        <View style={styles.logMetaStrip}>
          <View
            style={[
              styles.stageBadge,
              { flexDirection: 'row', alignItems: 'center' },
              isMissed
                ? styles.stageBadgeMissed
                : isIncoming && isConnected
                ? styles.stageBadgeIncoming
                : isConnected
                ? styles.stageBadgeConnected
                : styles.stageBadgeNeutral,
            ]}
          >
            {isMissed ? (
              <PhoneMissed size={11} color="#DC2626" style={{ marginRight: 4 }} />
            ) : isIncoming ? (
              <PhoneIncoming
                size={11}
                color={isConnected ? '#1D4ED8' : '#DC2626'}
                style={{ marginRight: 4 }}
              />
            ) : (
              <PhoneOutgoing
                size={11}
                color={isConnected ? '#15803D' : '#64748B'}
                style={{ marginRight: 4 }}
              />
            )}
            <Text
              style={[
                styles.stageBadgeText,
                isMissed
                  ? styles.stageTextMissed
                  : isIncoming && isConnected
                  ? styles.stageTextIncoming
                  : isConnected
                  ? styles.stageTextConnected
                  : styles.stageTextNeutral,
              ]}
            >
              {isMissed
                ? 'Missed Call'
                : isIncoming
                ? isConnected
                  ? 'Incoming'
                  : 'Incoming (Unanswered)'
                : act.stage || (isConnected ? 'Connected' : 'Not Connected')}
            </Text>
          </View>

          <View
            style={[
              styles.durationBadge,
              isConnected ? styles.durationConnected : styles.durationMissed,
            ]}
          >
            {isMissed ? (
              <PhoneMissed size={10} color="#DC2626" />
            ) : isIncoming && isConnected ? (
              <PhoneIncoming size={10} color="#0F9D58" />
            ) : isConnected ? (
              <Phone size={10} color="#0F9D58" />
            ) : (
              <PhoneOff size={10} color="#DC2626" />
            )}
            <Text
              style={[
                styles.durationText,
                isConnected ? { color: '#0F9D58' } : { color: '#DC2626' },
              ]}
            >
              {isMissed ? 'Missed' : formatDuration(act.durationSeconds, isConnected)}
            </Text>
          </View>

          {act.followUpAt ? (
            <View style={styles.followUpScheduledTag}>
              <Calendar size={11} color="#0D9488" />
              <Text style={styles.followUpScheduledText}>Callback</Text>
            </View>
          ) : null}

          {act.remark && act.remark !== 'Call completed' && act.remark !== 'Call not answered' ? (
            <View style={styles.logRemarkBadge}>
              <Text style={styles.logRemarkText} numberOfLines={1}>
                "{act.remark}"
              </Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  },
);

// ======================================================================
// MAIN CALL HISTORY / LOGS SCREEN
// ======================================================================
export const CallHistoryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'CallHistory'>>();
  const { width } = useWindowDimensions();

  const { user } = useAuthStore();
  const isAgent = user?.role === 'AGENT';

  const { getAllActivities, loadHistory } = useLeadHistoryStore();

  // Campaign Filter from Navigation Route (e.g. from Campaign Analytics)
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | undefined>(
    route.params?.campaignId,
  );
  const [selectedCampaignName, setSelectedCampaignName] = useState<string | undefined>(
    route.params?.campaignName,
  );

  // Redial Tracking Refs (NeoDove Tracking)
  const isCallingRef = useRef(false);
  const callStartTimeRef = useRef<number | null>(null);
  const callingActRef = useRef<Activity | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Filters
  const [directionTab, setDirectionTab] = useState<DirectionTab>('ALL');
  const [dateFilter, setDateFilter] = useState<DateFilter>('TODAY');
  const [selectedCustomDate, setSelectedCustomDate] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [stageFilter, setStageFilter] = useState<StageFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [whatsAppData, setWhatsAppData] = useState<{
    visible: boolean;
    name: string;
    phone: string;
  }>({
    visible: false,
    name: '',
    phone: '',
  });

  const [tagModalData, setTagModalData] = useState<{
    visible: boolean;
    customerName: string;
    customerPhone: string;
    leadId?: string;
  }>({
    visible: false,
    customerName: '',
    customerPhone: '',
    leadId: undefined,
  });

  const [quickLead, setQuickLead] = useState<Lead | null>(null);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  // Dynamic date tracker to re-evaluate boundaries across midnight
  const [currentDateKey, setCurrentDateKey] = useState(() => new Date().toDateString());

  useEffect(() => {
    // Monitor midnight transition every 60s
    const timer = setInterval(() => {
      const todayStr = new Date().toDateString();
      if (todayStr !== currentDateKey) {
        setCurrentDateKey(todayStr);
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [currentDateKey]);

  useEffect(() => {
    incomingCallSyncService.syncIncomingCalls().catch(() => {});
    loadHistory();
  }, [loadHistory]);

  const handlePullRefresh = async () => {
    setIsPullRefreshing(true);
    try {
      await incomingCallSyncService.syncIncomingCalls().catch(() => {});
      loadHistory();
      await refetchServer();
      setCurrentDateKey(new Date().toDateString());
    } finally {
      setIsPullRefreshing(false);
    }
  };

  // Update selected campaign if route params change
  useEffect(() => {
    if (route.params?.campaignId) {
      setSelectedCampaignId(route.params.campaignId);
      setSelectedCampaignName(route.params.campaignName);
    }
  }, [route.params?.campaignId, route.params?.campaignName]);

  // Fetch campaigns for campaign name lookup
  const { data: campaignData } = useQuery({
    queryKey: ['campaigns'],
    queryFn: fetchCampaigns,
    staleTime: 1000 * 60 * 5,
  });

  const campaignMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (campaignData?.campaigns) {
      for (const c of campaignData.campaigns) {
        map[c._id] = c.name;
      }
    }
    return map;
  }, [campaignData]);

  // Date boundary helpers - dynamically recomputed across midnight
  const { startOfToday, startOfYesterday, endOfYesterday, startOfWeek } = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 24 * 60 * 60 * 1000;
    const endYesterday = today - 1;
    const week = today - 7 * 24 * 60 * 60 * 1000;
    return {
      startOfToday: today,
      startOfYesterday: yesterday,
      endOfYesterday: endYesterday,
      startOfWeek: week,
    };
  }, [currentDateKey]);

  // Fetch activities from server with date bounds
  const {
    data: serverActivities = [],
    isLoading: isLoadingServer,
    refetch: refetchServer,
  } = useQuery({
    queryKey: ['myCallActivities', user?._id, dateFilter, selectedCustomDate, currentDateKey],
    queryFn: () => {
      let from: string | undefined;
      let to: string | undefined;
      if (dateFilter === 'TODAY') {
        from = new Date(startOfToday).toISOString();
      } else if (dateFilter === 'YESTERDAY') {
        from = new Date(startOfYesterday).toISOString();
        to = new Date(endOfYesterday).toISOString();
      } else if (dateFilter === 'WEEK') {
        from = new Date(startOfWeek).toISOString();
      } else if (dateFilter === 'CUSTOM' && selectedCustomDate) {
        const cd = new Date(selectedCustomDate);
        from = new Date(cd.getFullYear(), cd.getMonth(), cd.getDate(), 0, 0, 0).toISOString();
        to = new Date(cd.getFullYear(), cd.getMonth(), cd.getDate(), 23, 59, 59, 999).toISOString();
      }
      return fetchUserActivities({
        userId: isAgent && user?._id ? user._id : undefined,
        from,
        to,
      });
    },
    staleTime: 1000 * 15,
  });

  // Combined activities (Server DB + Local Store), fully deduplicated
  const userActivities = useMemo(() => {
    const cleanId = (user?._id || '').toLowerCase();
    const cleanName = (user?.name || '').toLowerCase();

    const matchesMe = (a: Activity) => {
      if (!isAgent) return true;
      const uId = typeof a.userId === 'object' && a.userId ? (a.userId as any)._id : a.userId;
      const uName = typeof a.userId === 'object' && a.userId ? (a.userId as any).name : '';
      return Boolean(
        (cleanId && uId && String(uId).toLowerCase() === cleanId) ||
          (cleanId && a.agentId && String(a.agentId).toLowerCase() === cleanId) ||
          (cleanName && uName && String(uName).toLowerCase() === cleanName) ||
          (cleanName && a.agentName && String(a.agentName).toLowerCase() === cleanName),
      );
    };

    const targetAgentId = isAgent ? user?._id || user?.name : undefined;
    const local = getAllActivities(targetAgentId).filter(
      (activity) => activity.type === 'CALL' && matchesMe(activity),
    );

    const serverMatched = serverActivities.filter(
      (a) => a && a._id && a.type === 'CALL' && matchesMe(a),
    );

    // Merge server activities (priority) and local activities with deduplication
    const combined = [...serverMatched, ...local];
    return deduplicateActivities(combined);
  }, [serverActivities, getAllActivities, user, isAgent]);

  const customDateDisplay = useMemo(() => {
    if (!selectedCustomDate) return null;
    const d = new Date(selectedCustomDate);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
  }, [selectedCustomDate]);

  // Base list filtered by Campaign & Date
  const dateAndCampaignFiltered = useMemo(() => {
    return userActivities.filter((act) => {
      // Campaign filter
      if (selectedCampaignId && act.campaignId !== selectedCampaignId) {
        return false;
      }

      // Date Filter
      const actTime = new Date(act.createdAt).getTime();
      if (dateFilter === 'TODAY') {
        if (actTime < startOfToday) return false;
      } else if (dateFilter === 'YESTERDAY') {
        if (actTime < startOfYesterday || actTime > endOfYesterday) return false;
      } else if (dateFilter === 'WEEK') {
        if (actTime < startOfWeek) return false;
      } else if (dateFilter === 'CUSTOM' && selectedCustomDate) {
        const cd = new Date(selectedCustomDate);
        const startOfCustom = new Date(cd.getFullYear(), cd.getMonth(), cd.getDate()).getTime();
        const endOfCustom = startOfCustom + 24 * 60 * 60 * 1000 - 1;
        if (actTime < startOfCustom || actTime > endOfCustom) return false;
      }

      return true;
    });
  }, [userActivities, selectedCampaignId, dateFilter, selectedCustomDate, startOfToday, startOfYesterday, endOfYesterday, startOfWeek]);

  // Direction counts based on current date & campaign filter
  const directionCounts = useMemo(() => {
    let outCount = 0;
    let inCount = 0;
    for (const a of dateAndCampaignFiltered) {
      if (isActivityIncoming(a)) inCount++;
      else outCount++;
    }
    return {
      all: dateAndCampaignFiltered.length,
      outgoing: outCount,
      incoming: inCount,
    };
  }, [dateAndCampaignFiltered]);

  // Final filtered list including Direction, Stage, and Search Query
  const filteredActivities = useMemo(() => {
    return dateAndCampaignFiltered.filter((act) => {
      // Direction filter using canonical helper
      const isInc = isActivityIncoming(act);
      if (directionTab === 'OUTGOING' && isInc) return false;
      if (directionTab === 'INCOMING' && !isInc) return false;

      // Safe stage filter (defensive null check prevents crash)
      const stageLower = (act.stage ?? '').toLowerCase();
      if (stageFilter === 'CONNECTED' && !act.connected) return false;
      if (stageFilter === 'NOT_CONNECTED' && act.connected) return false;
      if (stageFilter === 'INTERESTED' && !stageLower.includes('interested')) return false;
      if (stageFilter === 'FOLLOW_UP' && !stageLower.includes('follow')) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (act.customerName || '').toLowerCase().includes(q);
        const phoneMatch = (act.phone || '').toLowerCase().includes(q);
        const remarkMatch = (act.remark || '').toLowerCase().includes(q);
        const stageMatch = stageLower.includes(q);
        return nameMatch || phoneMatch || remarkMatch || stageMatch;
      }

      return true;
    });
  }, [dateAndCampaignFiltered, directionTab, stageFilter, searchQuery]);

  // Date Tab Badge Counts (scoped by campaign if selected)
  const todayCount = useMemo(() => {
    return userActivities.filter((a) => {
      if (selectedCampaignId && a.campaignId !== selectedCampaignId) return false;
      return new Date(a.createdAt).getTime() >= startOfToday;
    }).length;
  }, [userActivities, selectedCampaignId, startOfToday]);

  const yesterdayCount = useMemo(() => {
    return userActivities.filter((a) => {
      if (selectedCampaignId && a.campaignId !== selectedCampaignId) return false;
      const t = new Date(a.createdAt).getTime();
      return t >= startOfYesterday && t <= endOfYesterday;
    }).length;
  }, [userActivities, selectedCampaignId, startOfYesterday, endOfYesterday]);

  const weekCount = useMemo(() => {
    return userActivities.filter((a) => {
      if (selectedCampaignId && a.campaignId !== selectedCampaignId) return false;
      return new Date(a.createdAt).getTime() >= startOfWeek;
    }).length;
  }, [userActivities, selectedCampaignId, startOfWeek]);

  // Computed metrics for currently filtered call activities
  const callStats = useMemo(() => {
    const total = filteredActivities.length;
    const connected = filteredActivities.filter((a) => a.connected).length;
    const missed = total - connected;
    const rate = total > 0 ? Math.round((connected / total) * 100) : 0;
    const totalDurationSec = filteredActivities
      .filter((a) => a.connected)
      .reduce((sum, a) => sum + (a.durationSeconds || 0), 0);

    const formatSec = (sec: number) => {
      if (!sec || sec <= 0) return '0s';
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      if (m === 0) return `${s}s`;
      return `${m}m ${s}s`;
    };

    return {
      total,
      connected,
      missed,
      rate,
      totalDuration: formatSec(totalDurationSec),
    };
  }, [filteredActivities]);

  // Helper to resolve accurate total call attempts for a phone number
  const getAttemptCountForPhone = (phone?: string) => {
    if (!phone) return 1;
    const clean = normalizePhoneDigits(phone);
    if (!clean) return 1;
    const count = userActivities.filter((a) => normalizePhoneDigits(a.phone || '') === clean).length;
    return Math.max(count, 1);
  };

  // Redial handler using centralized callSession with double-call protection
  const handleCallAgain = (act: Activity) => {
    if (isCallingRef.current || callSession.isCallInProgress()) {
      toast.warning('A call is already in progress');
      return;
    }
    if (!act.phone) {
      Alert.alert('No Number', 'Customer phone number is unavailable.');
      return;
    }

    toast.info(`Dialing ${act.customerName || act.phone}...`, 'Calling');

    const cleanDigits = normalizePhoneDigits(act.phone);
    const deterministicId = act.leadId || `lead-phone-${cleanDigits || act._id}`;
    const realAttempts = getAttemptCountForPhone(act.phone);

    const syntheticLead: Lead = {
      _id: deterministicId,
      name: act.customerName || 'Customer',
      phone: act.phone,
      campaignId: act.campaignId || 'default-camp',
      stage: act.stage || 'New',
      source: 'DIRECT_CALL',
      customProperties: {},
      status: 'OPEN',
      attemptCount: realAttempts,
      createdAt: act.createdAt || new Date().toISOString(),
      updatedAt: act.updatedAt || new Date().toISOString(),
    };

    isCallingRef.current = true;
    setTimeout(() => {
      isCallingRef.current = false;
    }, 2000);

    callSession
      .startCall(syntheticLead, {
        callerSource: 'CALL_HISTORY',
        onCallComplete: () => {
          refetchServer();
        },
      })
      .catch(() => {
        Alert.alert('Call Error', 'Unable to launch phone call on this device.');
      });
  };

  const handleOpenWhatsApp = (act: Activity) => {
    if (!act.phone) return;
    setWhatsAppData({
      visible: true,
      name: act.customerName || 'Customer',
      phone: act.phone,
    });
  };

  const handleOpenLead = (act: Activity) => {
    const cleanDigits = normalizePhoneDigits(act.phone || '');
    const deterministicId = act.leadId || `lead-phone-${cleanDigits || act._id}`;
    const realAttempts = getAttemptCountForPhone(act.phone);

    const syntheticLead: Lead = {
      _id: deterministicId,
      campaignId: act.campaignId || '',
      name: act.customerName || 'Customer',
      phone: act.phone || '',
      source: 'DIRECT_CALL',
      stage: act.stage || 'Follow Up',
      tag: act.tag || act.temperature || 'WARM',
      temperature: (act.temperature || act.tag || 'WARM') as CustomerTemperature,
      status: 'OPEN',
      attemptCount: realAttempts,
      customProperties: {},
      nextFollowUpAt: act.followUpAt || undefined,
      createdAt: act.createdAt || new Date().toISOString(),
      updatedAt: act.updatedAt || new Date().toISOString(),
    };
    setQuickLead(syntheticLead);
  };

  const handleTagLead = (act: Activity) => {
    setTagModalData({
      visible: true,
      customerName: act.customerName || 'Customer',
      customerPhone: act.phone || '',
      leadId: act.leadId,
    });
  };

  // Header Component for Virtualized FlatList
  const renderListHeader = () => (
    <View style={styles.headerContainer}>
      {/* NeoDove Direction Segmented Tabs: ALL | OUTGOING | INCOMING */}
      <View style={styles.directionTabsBar}>
        <TouchableOpacity
          style={[styles.directionTabBtn, directionTab === 'ALL' && styles.directionTabBtnActive]}
          onPress={() => setDirectionTab('ALL')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.directionTabText,
              directionTab === 'ALL' && styles.directionTabTextActive,
            ]}
          >
            ALL ({directionCounts.all})
          </Text>
          {directionTab === 'ALL' && <View style={styles.directionActiveBar} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.directionTabBtn,
            directionTab === 'OUTGOING' && styles.directionTabBtnActive,
          ]}
          onPress={() => setDirectionTab('OUTGOING')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.directionTabText,
              directionTab === 'OUTGOING' && styles.directionTabTextActive,
            ]}
          >
            OUTGOING ({directionCounts.outgoing})
          </Text>
          {directionTab === 'OUTGOING' && <View style={styles.directionActiveBar} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.directionTabBtn,
            directionTab === 'INCOMING' && styles.directionTabBtnActive,
          ]}
          onPress={() => setDirectionTab('INCOMING')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.directionTabText,
              directionTab === 'INCOMING' && styles.directionTabTextActive,
            ]}
          >
            INCOMING ({directionCounts.incoming})
          </Text>
          {directionTab === 'INCOMING' && <View style={styles.directionActiveBar} />}
        </TouchableOpacity>
      </View>

      {/* Campaign Filter Pill Banner (if filtered by Campaign) */}
      {selectedCampaignId ? (
        <View style={styles.campaignFilterBanner}>
          <View style={styles.campaignFilterInfo}>
            <Filter size={13} color="#0F9D58" />
            <Text style={styles.campaignFilterLabel}>Campaign:</Text>
            <Text style={styles.campaignFilterValue} numberOfLines={1}>
              {selectedCampaignName || campaignMap[selectedCampaignId] || 'Selected Campaign'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.campaignClearBtn}
            onPress={() => {
              setSelectedCampaignId(undefined);
              setSelectedCampaignName(undefined);
            }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <X size={13} color="#DC2626" />
            <Text style={styles.campaignClearText}>Clear</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Top Search Bar & Refresh */}
      <View style={styles.topSearchRow}>
        <View style={styles.searchInputWrap}>
          <Search size={16} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search customer, phone or remark..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={15} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.iconRefreshBtn}
          onPress={async () => {
            try {
              toast.info('Syncing call logs...', 'Refresh');
              await incomingCallSyncService.syncIncomingCalls();
              loadHistory();
              const res = await refetchServer();
              setCurrentDateKey(new Date().toDateString());
              if (res.isError) {
                toast.warning('Unable to sync all server calls');
              } else {
                toast.success('Call logs refreshed');
              }
            } catch (err) {
              console.warn('[CallHistory] Refresh error:', err);
              toast.error('Sync failed. Please check connection');
            }
          }}
          activeOpacity={0.7}
        >
          <RotateCw size={15} color="#475569" />
        </TouchableOpacity>
      </View>

      {/* 4-Card NeoDove KPI Strip (Compact & User-Friendly) */}
      <View style={styles.kpiRow}>
        <View style={[styles.kpiCard, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}>
          <View style={[styles.kpiIconWrap, { backgroundColor: '#EFF6FF' }]}>
            <Phone size={12} color="#2563EB" />
          </View>
          <Text style={styles.kpiValue}>{callStats.total}</Text>
          <Text style={styles.kpiLabel}>Total Dials</Text>
        </View>

        <View style={[styles.kpiCard, { backgroundColor: '#F0FDF4', borderColor: '#DCFCE7' }]}>
          <View style={[styles.kpiIconWrap, { backgroundColor: '#DCFCE7' }]}>
            <CheckCircle2 size={12} color="#16A34A" />
          </View>
          <Text style={[styles.kpiValue, { color: '#16A34A' }]}>{callStats.connected}</Text>
          <Text style={styles.kpiLabel}>Connected ({callStats.rate}%)</Text>
        </View>

        <View style={[styles.kpiCard, { backgroundColor: '#F5F3FF', borderColor: '#EDE9FE' }]}>
          <View style={[styles.kpiIconWrap, { backgroundColor: '#EDE9FE' }]}>
            <Clock3 size={12} color="#7C3AED" />
          </View>
          <Text style={[styles.kpiValue, { color: '#6D28D9' }]}>{callStats.totalDuration}</Text>
          <Text style={styles.kpiLabel}>Talk Time</Text>
        </View>

        <View style={[styles.kpiCard, { backgroundColor: '#FEF2F2', borderColor: '#FEE2E2' }]}>
          <View style={[styles.kpiIconWrap, { backgroundColor: '#FEE2E2' }]}>
            <PhoneOff size={12} color="#DC2626" />
          </View>
          <Text style={[styles.kpiValue, { color: '#DC2626' }]}>{callStats.missed}</Text>
          <Text style={styles.kpiLabel}>Not Connected</Text>
        </View>
      </View>

      {/* Date Filter Tabs with Historical Browsing (Single-row Horizontal Scroll) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterHorizontalTrack}
        style={styles.filterScrollView}
      >
        <TouchableOpacity
          style={[styles.dateTab, dateFilter === 'TODAY' && styles.dateTabActive]}
          onPress={() => {
            setDateFilter('TODAY');
            setSelectedCustomDate(null);
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.dateTabText, dateFilter === 'TODAY' && styles.dateTabTextActive]}>
            Today
          </Text>
          <View style={[styles.tabBadge, dateFilter === 'TODAY' && styles.tabBadgeActive]}>
            <Text style={[styles.tabBadgeText, dateFilter === 'TODAY' && styles.tabBadgeTextActive]}>
              {todayCount}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dateTab, dateFilter === 'YESTERDAY' && styles.dateTabActive]}
          onPress={() => {
            setDateFilter('YESTERDAY');
            setSelectedCustomDate(null);
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.dateTabText, dateFilter === 'YESTERDAY' && styles.dateTabTextActive]}>
            Yesterday
          </Text>
          <View style={[styles.tabBadge, dateFilter === 'YESTERDAY' && styles.tabBadgeActive]}>
            <Text style={[styles.tabBadgeText, dateFilter === 'YESTERDAY' && styles.tabBadgeTextActive]}>
              {yesterdayCount}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dateTab, dateFilter === 'WEEK' && styles.dateTabActive]}
          onPress={() => {
            setDateFilter('WEEK');
            setSelectedCustomDate(null);
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.dateTabText, dateFilter === 'WEEK' && styles.dateTabTextActive]}>
            Last 7 Days
          </Text>
          <View style={[styles.tabBadge, dateFilter === 'WEEK' && styles.tabBadgeActive]}>
            <Text style={[styles.tabBadgeText, dateFilter === 'WEEK' && styles.tabBadgeTextActive]}>
              {weekCount}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dateTab, dateFilter === 'ALL' && styles.dateTabActive]}
          onPress={() => {
            setDateFilter('ALL');
            setSelectedCustomDate(null);
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.dateTabText, dateFilter === 'ALL' && styles.dateTabTextActive]}>
            All Time
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.dateTab,
            dateFilter === 'CUSTOM' && styles.dateTabActive,
            styles.datePickerTab,
          ]}
          onPress={() => setShowDatePicker(true)}
          activeOpacity={0.7}
        >
          <Calendar size={12} color={dateFilter === 'CUSTOM' ? '#FFFFFF' : '#475569'} />
          <Text
            style={[styles.dateTabText, dateFilter === 'CUSTOM' && styles.dateTabTextActive]}
            numberOfLines={1}
          >
            {dateFilter === 'CUSTOM' && customDateDisplay ? customDateDisplay : 'Choose Date'}
          </Text>
          {dateFilter === 'CUSTOM' ? (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                setDateFilter('TODAY');
                setSelectedCustomDate(null);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ marginLeft: 2 }}
            >
              <X size={11} color="#FFFFFF" strokeWidth={2.5} />
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
      </ScrollView>

      {/* Stage / Status Chips (Single-row Horizontal Scroll) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterHorizontalTrack}
        style={[styles.filterScrollView, { marginBottom: 10 }]}
      >
        {(['ALL', 'CONNECTED', 'NOT_CONNECTED', 'INTERESTED', 'FOLLOW_UP'] as StageFilter[]).map(
          (stg) => {
            const isSelected = stageFilter === stg;
            const labelMap: Record<StageFilter, string> = {
              ALL: 'All Statuses',
              CONNECTED: 'Connected',
              NOT_CONNECTED: 'Not Connected',
              INTERESTED: 'Interested',
              FOLLOW_UP: 'Follow-up',
            };
            return (
              <TouchableOpacity
                key={stg}
                style={[styles.stageChip, isSelected && styles.stageChipActive]}
                onPress={() => setStageFilter(stg)}
                activeOpacity={0.7}
              >
                <Text style={[styles.stageChipText, isSelected && styles.stageChipTextActive]}>
                  {labelMap[stg]}
                </Text>
              </TouchableOpacity>
            );
          },
        )}
      </ScrollView>
    </View>
  );

  // Empty State Component
  const renderEmptyState = () => (
    <View style={styles.emptyStateBox}>
      <View style={styles.emptyIconCircle}>
        <Clock3 size={32} color="#94A3B8" />
      </View>
      <Text style={styles.emptyTitle}>No Calls Recorded</Text>
      <Text style={styles.emptySub}>
        {dateFilter === 'TODAY'
          ? "You haven't placed any calls today yet. Calls you make will automatically appear here with duration and connection status."
          : 'No call logs match the selected direction, date, and filter criteria.'}
      </Text>
      <TouchableOpacity
        style={styles.emptyResetBtn}
        onPress={() => {
          setDateFilter('TODAY');
          setStageFilter('ALL');
          setDirectionTab('ALL');
          setSearchQuery('');
          setSelectedCustomDate(null);
          setSelectedCampaignId(undefined);
        }}
        activeOpacity={0.7}
      >
        <Text style={styles.emptyResetBtnText}>Reset to Today's Calls</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <CrmShell
      title="Call Logs"
      headerIcon={<PhoneCall size={16} color={colors.textSecondary} />}
      breadcrumb="Workspace"
      showBack={true}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={filteredActivities}
          keyExtractor={(item) => item._id}
          refreshControl={
            <RefreshControl
              refreshing={isPullRefreshing}
              onRefresh={handlePullRefresh}
              colors={['#0F9D58']}
            />
          }
          renderItem={({ item }) => (
            <CallHistoryCard
              act={item}
              campaignName={
                (item.campaignId && campaignMap[item.campaignId]) ||
                (item as any).campaignName ||
                'General Campaign'
              }
              onCallAgain={handleCallAgain}
              onOpenWhatsApp={handleOpenWhatsApp}
              onOpenLead={handleOpenLead}
              onTagLead={handleTagLead}
            />
          )}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={styles.listContainer}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
          showsVerticalScrollIndicator={false}
        />
      </KeyboardAvoidingView>

      {/* WhatsApp Template Modal */}
      <WhatsAppTemplateModal
        visible={whatsAppData.visible}
        onClose={() => setWhatsAppData((prev) => ({ ...prev, visible: false }))}
        customerName={whatsAppData.name}
        customerPhone={whatsAppData.phone}
      />

      {/* Lead Quick Modal */}
      <LeadQuickModal
        visible={Boolean(quickLead)}
        onClose={() => setQuickLead(null)}
        lead={quickLead}
      />

      {/* Tag Lead to Manager / Admin Modal */}
      <TagManagerModal
        visible={tagModalData.visible}
        onClose={() => setTagModalData((prev) => ({ ...prev, visible: false }))}
        customerName={tagModalData.customerName}
        customerPhone={tagModalData.customerPhone}
        leadId={tagModalData.leadId}
        onSuccess={() => {
          loadHistory();
          refetchServer();
        }}
      />

      {/* Custom Date Picker Modal for Past Dates */}
      <CrmDateTimePickerModal
        visible={showDatePicker}
        mode="date"
        title="Select Date to View History"
        initialDate={selectedCustomDate ? new Date(selectedCustomDate) : new Date()}
        allowPastDates={true}
        allowFutureDates={false}
        onClose={() => setShowDatePicker(false)}
        onConfirm={(isoDate: string) => {
          setSelectedCustomDate(isoDate);
          setDateFilter('CUSTOM');
          setShowDatePicker(false);
        }}
      />
    </CrmShell>
  );
};

const styles = StyleSheet.create({
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  headerContainer: {
    paddingTop: 10,
    marginBottom: 8,
  },

  // Direction Segmented Tabs Bar (Image 2)
  directionTabsBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 12,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  directionTabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  directionTabBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  directionTabText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  directionTabTextActive: {
    color: '#0F9D58',
    fontWeight: '800',
  },
  directionActiveBar: {
    position: 'absolute',
    bottom: -1,
    left: 12,
    right: 12,
    height: 3,
    backgroundColor: '#0F9D58',
    borderRadius: 2,
  },

  // Campaign Filter Banner
  campaignFilterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  campaignFilterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  campaignFilterLabel: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '600',
  },
  campaignFilterValue: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '700',
    flexShrink: 1,
  },
  campaignClearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
  },
  campaignClearText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '700',
  },

  // Top Search
  topSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
    padding: 0,
  },
  iconRefreshBtn: {
    width: 42,
    height: 42,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 4 KPI Cards (Compact & User-Friendly)
  kpiRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  kpiCard: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  kpiIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  kpiLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
    textAlign: 'center',
  },

  // Horizontal Scrollable Filter Tracks (Zero Wrapping!)
  filterScrollView: {
    marginBottom: 7,
    marginHorizontal: -16,
  },
  filterHorizontalTrack: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 6,
    alignItems: 'center',
  },
  dateTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    gap: 4,
    height: 28,
  },
  dateTabActive: {
    backgroundColor: '#0F9D58',
  },
  dateTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  dateTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  datePickerTab: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 5,
    paddingVertical: 0.5,
    borderRadius: 8,
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  tabBadgeTextActive: {
    color: '#FFFFFF',
  },

  // Stage Chips (Compact)
  stageChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageChipActive: {
    backgroundColor: '#E6F4EA',
    borderColor: '#0F9D58',
  },
  stageChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  stageChipTextActive: {
    color: '#0F9D58',
    fontWeight: '700',
  },

  // ==========================================================
  // NEODOVE LOG CARD (IMAGE 2)
  // ==========================================================
  logCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  logCardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  logFieldsCol: {
    flex: 1,
    gap: 4,
  },
  logFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  logFieldLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  logFieldValueBold: {
    fontSize: 13.5,
    color: '#0F172A',
    fontWeight: '700',
    flexShrink: 1,
  },
  logFieldValuePhone: {
    fontSize: 13,
    color: '#0F9D58',
    fontWeight: '700',
  },
  logFieldValueCampaign: {
    fontSize: 12.5,
    color: '#334155',
    fontWeight: '600',
    flexShrink: 1,
  },
  logFieldValueDetails: {
    fontSize: 12.5,
    color: '#475569',
    fontWeight: '500',
  },

  // Top Right Quick Action Buttons
  topRightActionsCol: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginLeft: 6,
  },
  actionCallBtn: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    backgroundColor: '#0F9D58',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F9D58',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  actionWhatsAppBtn: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#25D366',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  actionTagBtn: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRightCallBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#0F9D58',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F9D58',
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    marginTop: 2,
  },

  // Status / Metadata Strip
  logMetaStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  stageBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  stageBadgeConnected: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  stageBadgeIncoming: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  stageBadgeMissed: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  stageBadgeNeutral: {
    backgroundColor: '#F1F5F9',
  },
  stageBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stageTextConnected: {
    color: '#15803D',
  },
  stageTextIncoming: {
    color: '#1D4ED8',
  },
  stageTextMissed: {
    color: '#DC2626',
  },
  stageTextNeutral: {
    color: '#475569',
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    gap: 4,
  },
  durationConnected: {
    backgroundColor: '#E6F4EA',
  },
  durationMissed: {
    backgroundColor: '#FEE2E2',
  },
  durationText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  followUpScheduledTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  followUpScheduledText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#0D9488',
  },
  logRemarkBadge: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: '100%',
  },
  logRemarkText: {
    fontSize: 10.5,
    color: '#64748B',
    fontStyle: 'italic',
  },



  // Empty State
  emptyStateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  emptyResetBtn: {
    backgroundColor: '#0F9D58',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  emptyResetBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
