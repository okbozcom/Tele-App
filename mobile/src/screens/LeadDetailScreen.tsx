import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  AppState,
  AppStateStatus,
  Alert,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Modal,
  Linking,
  StatusBar as RNStatusBar,
  useWindowDimensions,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeTopPadding } from '../utils/safeArea';
import {
  ArrowLeft,
  Phone,
  PhoneCall,
  PhoneOff,
  MessageCircle,
  Clock,
  Calendar,
  CalendarClock,
  Users,
  CheckCircle2,
  AlertCircle,
  FileText,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Flame,
  Sun,
  Snowflake,
  Edit2,
  Plus,
  X,
  Check,
  Megaphone,
  RotateCw,
  Ban,
  PhoneOutgoing,
  BookmarkCheck,
  CalendarCheck2,
} from 'lucide-react-native';

import { CreateTaskModal } from '../components/CreateTaskModal';
import { callService } from '../services/call.service';
import { callSession } from '../services/callSession';
import {
  fetchLeadHistory,
  reassignLead,
  fetchAssignableUsers,
  fetchCampaigns,
  fetchCampaignById,
  fetchPipeline,
  disposeLead,
  updateLeadDetails,
} from '../api/leadApi';
import { RootStackParamList, Activity, Lead, CustomerTemperature, NotConnectedReason, NotConnectedReasons, User, Campaign, PipelineStage, DisposeLeadPayload } from '../types';
import { colors, borderRadius, shadows } from '../theme';
import { CallPermissionModal } from '../components/CallPermissionModal';
import { LeadTimeline, deduplicateActivities } from '../components/LeadTimeline';
import { CrmDateTimePickerModal } from '../components/CrmDateTimePickerModal';
import { TagManagerModal } from '../components/TagManagerModal';
import { notificationService } from '../services/notification.service';
import { useLeadHistoryStore } from '../store/leadHistoryStore';
import { useAuthStore } from '../store/authStore';
import { useOutboxStore } from '../store/outboxStore';
import { OutboxStatusBanner } from '../components/OutboxStatusBanner';
import { toast } from '../store/toastStore';
import { getWhatsAppUrl, formatDisplayPhone, isLeadLostOrSuppressed } from '../utils/phoneUtils';
import { adjustForCallingHours, getDefaultFollowUpIso } from '../utils/callingHours';

type ScreenRouteProp = RouteProp<RootStackParamList, 'LeadDetail' | 'Dispose'>;
type ScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

type LeadTab = 'LEAD INFO' | 'DISPOSE LEAD';

const PIPELINE_STATES = [
  'NOT CONNECTED',
  'IN PROGRESS',
  'NEW',
  'INTERESTED',
  'FOLLOW UP',
  'NOT INTERESTED',
  'CONVERTED',
  'LOST',
];

const NOT_CONNECTED_LABELS: Record<NotConnectedReason, string> = {
  DID_NOT_PICK: 'Ringing / Did Not Pick',
  BUSY: 'Line Busy',
  USER_DISCONNECTED: 'Call Cut / Disconnected',
  SWITCHED_OFF: 'Switched Off',
  OUT_OF_COVERAGE: 'Out of Coverage / Not Reachable',
  CALL_NOT_COMPLETED: 'Call Not Completed',
  INVALID_NUMBER: 'Invalid / Wrong Number',
  INCOMING_NOT_AVAILABLE: 'Incoming Call Not Available',
  NUMBER_NOT_IN_USE: 'Number Not in Use',
  OTHER: 'Other Reason',
};

const ALL_NOT_CONNECTED_REASONS: Array<{ label: string; code: NotConnectedReason; emoji: string }> = [
  { label: 'Ringing / Did Not Pick', code: 'DID_NOT_PICK', emoji: '🔔' },
  { label: 'Line Busy', code: 'BUSY', emoji: '⏳' },
  { label: 'Switched Off', code: 'SWITCHED_OFF', emoji: '📴' },
  { label: 'Out of Coverage / Unreachable', code: 'OUT_OF_COVERAGE', emoji: '📡' },
  { label: 'Call Cut / Disconnected', code: 'USER_DISCONNECTED', emoji: '✂️' },
  { label: 'Call Not Completed', code: 'CALL_NOT_COMPLETED', emoji: '⚠️' },
  { label: 'Invalid / Wrong Number', code: 'INVALID_NUMBER', emoji: '📵' },
  { label: 'Incoming Not Available', code: 'INCOMING_NOT_AVAILABLE', emoji: '🚫' },
  { label: 'Number Not in Use', code: 'NUMBER_NOT_IN_USE', emoji: '❌' },
  { label: 'Other Reason', code: 'OTHER', emoji: '📝' },
];

const QUICK_NOT_CONNECTED_PRESETS: Array<{
  reason: NotConnectedReason;
  label: string;
  emoji: string;
}> = [
  { reason: 'DID_NOT_PICK', label: 'No Answer', emoji: '🔔' },
  { reason: 'BUSY', label: 'Line Busy', emoji: '⏳' },
  { reason: 'SWITCHED_OFF', label: 'Switched Off', emoji: '📴' },
  { reason: 'OUT_OF_COVERAGE', label: 'Unreachable', emoji: '📡' },
  { reason: 'USER_DISCONNECTED', label: 'Call Cut', emoji: '✂️' },
  { reason: 'CALL_NOT_COMPLETED', label: 'Not Completed', emoji: '⚠️' },
  { reason: 'INVALID_NUMBER', label: 'Wrong Number', emoji: '📵' },
  { reason: 'INCOMING_NOT_AVAILABLE', label: 'No Incoming', emoji: '🚫' },
  { reason: 'NUMBER_NOT_IN_USE', label: 'Not in Use', emoji: '❌' },
  { reason: 'OTHER', label: 'Other', emoji: '📝' },
];

const LOST_REASONS = [
  { label: 'Price High / Budget', code: 'PRICE_HIGH', emoji: '💰' },
  { label: 'Bought Elsewhere', code: 'COMPETITOR', emoji: '🏢' },
  { label: 'Not Interested / Not Needed', code: 'NOT_NEEDED', emoji: '❌' },
  { label: 'Wrong Number / Invalid', code: 'WRONG_NUMBER', emoji: '📵' },
  { label: 'Do Not Call (DND)', code: 'DND', emoji: '⛔' },
];

const OUTCOME_OPTIONS = [
  { stage: 'INTERESTED', label: 'Interested', icon: CheckCircle2, color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0' },
  { stage: 'FOLLOW UP', label: 'Follow-up', icon: CalendarClock, color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  { stage: 'NOT INTERESTED', label: 'Customer Lost / Not Interested', icon: Ban, color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  { stage: 'CONVERTED', label: 'Converted / Won', icon: CheckCircle2, color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
];

const formatDuration = (seconds?: number, connected?: boolean) => {
  if (!connected) return 'Not connected';
  if (!seconds || seconds <= 0) return 'Connected (0s)';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
};

// NeoDove-Grade 1-Tap Core Outcomes
const PRIMARY_OUTCOMES = [
  {
    stage: 'NOT CONNECTED',
    label: 'Not Connected',
    sublabel: 'No answer / Busy',
    emoji: '📵',
    activeColor: '#DC2626',
    activeBg: '#FEF2F2',
    activeBorder: '#FCA5A5',
    tag: 'Cold' as const,
  },
  {
    stage: 'FOLLOW UP',
    label: 'Follow Up',
    sublabel: 'Callback needed',
    emoji: '📅',
    activeColor: '#D97706',
    activeBg: '#FFFBEB',
    activeBorder: '#FCD34D',
    tag: 'Warm' as const,
  },
  {
    stage: 'INTERESTED',
    label: 'Interested',
    sublabel: 'Prospect agreed',
    emoji: '⭐',
    activeColor: '#059669',
    activeBg: '#ECFDF5',
    activeBorder: '#86EFAC',
    tag: 'Hot' as const,
  },
  {
    stage: 'NOT INTERESTED',
    label: 'Not Interested',
    sublabel: 'Declined / Lost',
    emoji: '❌',
    activeColor: '#64748B',
    activeBg: '#F1F5F9',
    activeBorder: '#CBD5E1',
    tag: 'Cold' as const,
  },
];

export const LeadDetailScreen: React.FC = () => {
  const { user } = useAuthStore();
  const route = useRoute<ScreenRouteProp>();
  const navigation = useNavigation<ScreenNavigationProp>();
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const isWide = width >= 860;
  const safeTopPadding = useSafeTopPadding(isWide);

  const { lead, queue, queueIndex } = route.params;
  const routeParams = route.params as RootStackParamList['Dispose'];
  const detectedCallConnected =
    route.name === 'Dispose' ? routeParams.isCallConnected : undefined;
  const initialCallDuration =
    route.name === 'Dispose' ? routeParams.callDurationSeconds || 0 : 0;
  const initialTab: LeadTab =
    routeParams.initialTab === 'DISPOSE LEAD' || route.name === 'Dispose'
      ? 'DISPOSE LEAD'
      : 'LEAD INFO';

  // Active top tab (Only 2 clean tabs: LEAD INFO | DISPOSE LEAD)
  const [activeTab, setActiveTab] = useState<LeadTab>(initialTab);

  const [currentLead, setCurrentLead] = useState<Lead>(lead);
  const [callActive, setCallActive] = useState<boolean>(false);
  const [callDurationSeconds, setCallDurationSeconds] = useState<number>(initialCallDuration);
  const [isCallAttempt, setIsCallAttempt] = useState<boolean>(
    route.name === 'Dispose' && routeParams.callAttempt === true,
  );
  const [showPermissionModal, setShowPermissionModal] = useState<boolean>(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Calling & AppState refs
  const callStartTimeRef = useRef<number | null>(null);
  const isCallingRef = useRef<boolean>(false);
  const skipPermissionCheckRef = useRef<boolean>(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ==========================================
  // DISPOSE LEAD TAB STATE (Clean Native Dropdowns)
  // ==========================================
  const shouldAutoOpenNotConnected =
    route.name === 'Dispose' &&
    (routeParams.autoOpenNotConnectedSheet === true || detectedCallConnected === false);

  const [showNotConnectedModal, setShowNotConnectedModal] = useState<boolean>(
    Boolean(shouldAutoOpenNotConnected),
  );
  const [selectedState, setSelectedState] = useState<string>(
    detectedCallConnected === false
      ? 'NOT CONNECTED'
      : detectedCallConnected === true
      ? 'FOLLOW UP'
      : lead.stage?.toUpperCase() || 'IN PROGRESS',
  );
  const [showStatePicker, setShowStatePicker] = useState<boolean>(false);
  const [selectedNotConnectedReason, setSelectedNotConnectedReason] = useState<NotConnectedReason>('DID_NOT_PICK');
  const [showNotConnectedReasonPicker, setShowNotConnectedReasonPicker] = useState<boolean>(false);

  // Select Tag Radio Buttons: Hot, Cold, Warm
  const [selectedTag, setSelectedTag] = useState<'Hot' | 'Cold' | 'Warm'>(
    lead.tag?.toUpperCase() === 'HOT'
      ? 'Hot'
      : lead.tag?.toUpperCase() === 'WARM'
      ? 'Warm'
      : 'Cold',
  );

  // Checkboxes for "Select next action*"
  const [actionNextFollowUp, setActionNextFollowUp] = useState<boolean>(true);
  const defaultFollowUpDate = useMemo(() => {
    if (lead.nextFollowUpAt) return lead.nextFollowUpAt;
    return getDefaultFollowUpIso(2);
  }, [lead.nextFollowUpAt]);
  const [followUpDate, setFollowUpDate] = useState<string | null>(defaultFollowUpDate);
  const [showDatePickerModal, setShowDatePickerModal] = useState<boolean>(false);

  // Clean unselected checkboxes by default
  const [actionReassign, setActionReassign] = useState<boolean>(false);
  const [selectedReassignUserId, setSelectedReassignUserId] = useState<string | null>(null);
  const [showReassignPicker, setShowReassignPicker] = useState<boolean>(false);

  const [actionCopyCampaign, setActionCopyCampaign] = useState<boolean>(false);
  const [selectedCopyCampaignId, setSelectedCopyCampaignId] = useState<string | null>(null);
  const [showCampaignPicker, setShowCampaignPicker] = useState<boolean>(false);

  const [remarks, setRemarks] = useState<string>('');
  const [dealAmount, setDealAmount] = useState<string>(
    lead.dealAmount ? String(lead.dealAmount) : '',
  );
  const [currency, setCurrency] = useState<string>(lead.currency || 'INR');

  // Modals for LEAD INFO
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [showEditContactModal, setShowEditContactModal] = useState<boolean>(false);
  const [showTagManagerModal, setShowTagManagerModal] = useState<boolean>(false);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>(lead.name);
  const [editPhone, setEditPhone] = useState<string>(lead.phone);

  // Query: Assignable agents
  const { data: usersData } = useQuery({
    queryKey: ['assignableUsers'],
    queryFn: fetchAssignableUsers,
    enabled: actionReassign || showReassignPicker,
  });
  const assignableAgents: User[] = usersData?.users || [];

  // Query: Campaigns
  const { data: allCampaignsData } = useQuery({
    queryKey: ['allCampaigns'],
    queryFn: fetchCampaigns,
    enabled: actionCopyCampaign || showCampaignPicker,
  });
  const campaignsList: Campaign[] = allCampaignsData?.campaigns || [];

  // Lead History Query
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['leadHistory', currentLead._id],
    queryFn: () => fetchLeadHistory(currentLead._id),
  });
  const { getHistoryForLead } = useLeadHistoryStore();

  const combinedActivities: Activity[] = useMemo(() => {
    const backend = historyData?.activities || [];
    const local = getHistoryForLead(currentLead._id);
    if (backend.length > 0) {
      const existingIds = new Set(backend.map((a) => a._id));
      const nonDup = local.filter((a) => !existingIds.has(a._id));
      return deduplicateActivities(
        [...backend, ...nonDup].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );
    }
    return deduplicateActivities(local);
  }, [historyData, currentLead._id, getHistoryForLead]);

  // Quick follow-up scheduling helper with India calling hours enforcement (09:00 - 20:00 IST)
  const setQuickFollowUp = (hoursAhead: number, specificHour?: number) => {
    const d = new Date();
    if (specificHour !== undefined) {
      const daysToAdd = hoursAhead >= 24 ? Math.floor(hoursAhead / 24) : 1;
      d.setDate(d.getDate() + daysToAdd);
      d.setHours(specificHour, 0, 0, 0);
    } else {
      d.setTime(d.getTime() + hoursAhead * 60 * 60 * 1000);
    }
    const compliant = adjustForCallingHours(d);
    setFollowUpDate(compliant.toISOString());
    setActionNextFollowUp(true);
  };

  // 1-Tap Quick Outcome Selection (NeoDove Standard)
  const handleSelectOutcome = (stage: string, defaultTag?: 'Hot' | 'Cold' | 'Warm') => {
    setSelectedState(stage);
    if (stage === 'NOT CONNECTED') {
      if (!selectedNotConnectedReason) setSelectedNotConnectedReason('DID_NOT_PICK');
      setShowNotConnectedModal(true);
    } else if (stage === 'INTERESTED') {
      setSelectedTag(defaultTag || 'Hot');
      setActionNextFollowUp(true);
    } else if (stage === 'FOLLOW UP') {
      setSelectedTag(defaultTag || 'Warm');
      setActionNextFollowUp(true);
    } else if (stage === 'NOT INTERESTED') {
      setSelectedTag('Cold');
      setActionNextFollowUp(false);
    }
  };

  // NeoDove-Grade 1-Tap Auto-Save for Unanswered / Not Connected Calls
  const handleQuickNotConnectedSubmit = (reason: NotConnectedReason) => {
    setSelectedNotConnectedReason(reason);
    setSelectedState('NOT CONNECTED');
    setSelectedTag('Cold');
    setShowNotConnectedModal(false);

    disposeMutation.mutate({
      stage: 'NOT CONNECTED',
      notConnectedReason: reason,
      tag: 'Cold',
      remark: `Call Not Connected: ${NOT_CONNECTED_LABELS[reason] || reason}`,
    });
  };

  const formatScheduledDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      const now = new Date();
      const isTomorrow =
        d.getDate() === now.getDate() + 1 &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear();

      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (isTomorrow) {
        return `Tomorrow at ${timeStr}`;
      }
      return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeStr}`;
    } catch {
      return isoStr;
    }
  };

  const initiateCall = async () => {
    if (isCallingRef.current || callSession.isCallInProgress()) {
      toast.warning('A call is already in progress');
      return;
    }
    isCallingRef.current = true;
    setCallActive(true);

    try {
      await callSession.startCall(currentLead, {
        callerSource: 'LEAD_DETAIL',
        onCallComplete: (result) => {
          isCallingRef.current = false;
          setCallActive(false);
          setIsCallAttempt(true);
          setCallDurationSeconds(result.connected ? result.durationSeconds : 0);
          if (!result.connected) {
            setSelectedState('NOT CONNECTED');
            setSelectedNotConnectedReason('DID_NOT_PICK');
          } else {
            if (selectedState === 'NOT CONNECTED' || selectedState === 'NEW') {
              setSelectedState('FOLLOW UP');
            }
          }
          setActiveTab('DISPOSE LEAD');
          toast.info(
            result.connected
              ? 'Call completed. Please record the disposition below.'
              : 'Call not answered. Please update lead state below.',
            'Call Ended',
          );
        },
      });
    } catch {
      isCallingRef.current = false;
      setCallActive(false);
      Alert.alert(
        'Call Could Not Launch',
        'Could not open device phone dialer. Would you like to record a manual call outcome?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Record Outcome',
            onPress: () => {
              setActiveTab('DISPOSE LEAD');
            },
          },
        ],
      );
    }
  };

  const handlePressCall = async () => {
    const isSuppressed = isLeadLostOrSuppressed(currentLead);

    const proceedCall = async () => {
      if (Platform.OS === 'android' && !skipPermissionCheckRef.current) {
        const hasPerm = await callService.checkPermissions();
        if (!hasPerm) {
          setShowPermissionModal(true);
          return;
        }
      }
      await initiateCall();
    };

    if (isSuppressed) {
      if (user?.role === 'AGENT') {
        Alert.alert(
          'Customer Suppressed',
          `${currentLead.name} is marked as not interested and cannot be called from the agent queue.`,
        );
        return;
      }

      Alert.alert(
        '⚠️ Customer Not Interested',
        `${currentLead.name} was marked as "${currentLead.stage || 'Not Interested'}". Calling again may cause customer irritation.\n\nAre you sure you want to dial anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Call Anyway', style: 'destructive', onPress: proceedCall },
        ],
      );
      return;
    }

    await proceedCall();
  };

  // Submit Disposition Mutation
  const disposeMutation = useMutation({
    mutationFn: async (override?: {
      stage?: string;
      notConnectedReason?: NotConnectedReason;
      tag?: 'Hot' | 'Cold' | 'Warm';
      remark?: string;
    }) => {
      const activeStage = override?.stage || selectedState;
      if (activeStage === 'FOLLOW UP' && (!actionNextFollowUp || !followUpDate)) {
        throw new Error('Please select a scheduled date and time for this follow-up.');
      }

      const isConnected =
        activeStage !== 'NOT CONNECTED' &&
        activeStage !== 'SWITCHED OFF' &&
        activeStage !== 'BUSY';

      const notConnectedReason: NotConnectedReason | undefined = !isConnected
        ? override?.notConnectedReason || selectedNotConnectedReason
        : undefined;

      const isClosing =
        isLeadLostOrSuppressed({ stage: activeStage }) ||
        activeStage === 'CONVERTED';

      const finalFollowUp =
        !isClosing && actionNextFollowUp
          ? adjustForCallingHours(new Date(followUpDate || getDefaultFollowUpIso(2))).toISOString()
          : null;

      const activeTag = override?.tag || selectedTag;
      const activeRemark =
        override?.remark ||
        remarks.trim() ||
        (!isConnected
          ? `Call Not Connected: ${NOT_CONNECTED_LABELS[notConnectedReason || 'DID_NOT_PICK'] || notConnectedReason || 'Did Not Pick'}`
          : undefined);

      const payload: DisposeLeadPayload = {
        phone: currentLead.phone,
        connected: isConnected,
        callAttempt: isCallAttempt,
        notConnectedReason,
        stage: activeStage,
        tag: activeTag.toUpperCase() as any,
        followUpAt: finalFollowUp,
        remark: activeRemark,
        durationSeconds: isConnected ? callDurationSeconds : 0,
        reassignToUserId: actionReassign && selectedReassignUserId ? selectedReassignUserId : undefined,
        copyToCampaignId: actionCopyCampaign && selectedCopyCampaignId ? selectedCopyCampaignId : undefined,
        direction: routeParams.direction || 'OUTGOING',
        clientEventId: routeParams.clientEventId || null,
        startedAt: routeParams.startedAt || null,
        durationSource: routeParams.durationSource || 'APP_ESTIMATE',
        dispositionMismatch:
          Boolean(routeParams.dispositionMismatch) ||
          (!isConnected && callDurationSeconds >= 20) ||
          (isConnected && isCallAttempt && callDurationSeconds === 0),
        noAttempt: !isCallAttempt,
        clientTimestamp: routeParams.startedAt || new Date().toISOString(),
        callLogId: routeParams.callLogId,
        idempotencyKey: routeParams.idempotencyKey || (`disp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`),
        classificationReason: routeParams.classificationReason,
        dealAmount: dealAmount.trim() ? parseFloat(dealAmount) : undefined,
        currency: currency || 'INR',
      };

      try {
        return await disposeLead(currentLead._id, payload);
      } catch (err: any) {
        // P4: If offline or network unreachable, enqueue in durable offline outbox
        const isNetworkErr = !err?.response || err?.code === 'ERR_NETWORK' || !useOutboxStore.getState().isOnline;
        if (isNetworkErr) {
          await useOutboxStore.getState().enqueueMutation(
            'DISPOSE_LEAD',
            currentLead._id,
            payload,
            payload.idempotencyKey,
          );
          // Return optimistic local activity & lead update so telecaller queue seamlessly advances
          return {
            activity: {
              _id: 'local_' + Date.now(),
              leadId: currentLead._id,
              userId: user?._id || '',
              type: 'CALL',
              stage: activeStage,
              connected: isConnected,
              durationSeconds: isConnected ? callDurationSeconds : 0,
              remark: activeRemark,
              direction: payload.direction,
              callLogId: payload.callLogId,
              idempotencyKey: payload.idempotencyKey,
              classificationReason: payload.classificationReason,
              dealAmount: payload.dealAmount,
              currency: payload.currency,
              createdAt: new Date().toISOString(),
            },
            lead: {
              ...currentLead,
              stage: activeStage,
              tag: activeTag.toUpperCase() as any,
              attemptCount: (currentLead.attemptCount || 0) + 1,
              status: isClosing ? 'CLOSED' : 'OPEN',
              dealAmount: payload.dealAmount,
              currency: payload.currency,
              nextFollowUpAt: finalFollowUp || undefined,
            },
          };
        }
        throw err;
      }
    },
    onSuccess: (data, override) => {
      const activeStage = override?.stage || selectedState;
      const isConnected =
        activeStage !== 'NOT CONNECTED' &&
        activeStage !== 'SWITCHED OFF' &&
        activeStage !== 'BUSY';
      const notConnectedReason: NotConnectedReason | undefined = !isConnected
        ? override?.notConnectedReason || selectedNotConnectedReason
        : undefined;
      const activeTag = override?.tag || selectedTag;
      const activeRemark =
        override?.remark ||
        remarks.trim() ||
        (!isConnected
          ? `Call Not Connected: ${NOT_CONNECTED_LABELS[notConnectedReason || 'DID_NOT_PICK'] || notConnectedReason || 'Did Not Pick'}`
          : undefined);

      const isLost = isLeadLostOrSuppressed({ stage: activeStage });
      const isClosing = data.lead.status === 'CLOSED' || isLost;

      const finalFollowUp =
        !isClosing && actionNextFollowUp
          ? followUpDate || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
          : null;

      // Optimistically push dialed lead to the BOTTOM of active queue
      queryClient.setQueryData(['homeMyLeadsQueue'], (old: any) => {
        if (!old?.leads) return old;
        const remaining = old.leads.filter((l: Lead) => l._id !== currentLead._id);
        const updatedCurrent: Lead = {
          ...currentLead,
          stage: activeStage,
          tag: activeTag.toUpperCase(),
          attemptCount: (currentLead.attemptCount || 0) + 1,
          lastContactedAt: new Date().toISOString(),
          nextFollowUpAt: finalFollowUp,
        };
        return {
          ...old,
          leads: isClosing ? remaining : [...remaining, updatedCurrent],
        };
      });

      queryClient.setQueryData(['myLeadsList'], (old: any) => {
        if (!old?.leads) return old;
        const remaining = old.leads.filter((l: Lead) => l._id !== currentLead._id);
        const updatedCurrent: Lead = {
          ...currentLead,
          stage: activeStage,
          tag: activeTag.toUpperCase(),
          attemptCount: (currentLead.attemptCount || 0) + 1,
          lastContactedAt: new Date().toISOString(),
          nextFollowUpAt: finalFollowUp,
        };
        return {
          ...old,
          leads: isClosing ? remaining : [...remaining, updatedCurrent],
        };
      });

      queryClient.invalidateQueries({ queryKey: ['myLeads'] });
      queryClient.invalidateQueries({ queryKey: ['myLeadsList'] });
      queryClient.invalidateQueries({ queryKey: ['homeDashboard'] });
      queryClient.invalidateQueries({ queryKey: ['homeMyLeadsQueue'] });
      queryClient.invalidateQueries({ queryKey: ['leadHistory', currentLead._id] });
      queryClient.invalidateQueries({ queryKey: ['myCallActivities'] });

      useLeadHistoryStore.getState().addActivity(currentLead._id, {
        phone: currentLead.phone,
        customerName: currentLead.name,
        agentName: user?.name,
        agentId: user?._id,
        branch: user?.branch,
        connected: isCallAttempt && isConnected,
        type: isCallAttempt ? 'CALL' : 'UPDATE',
        direction: 'OUTGOING',
        notConnectedReason: isCallAttempt ? notConnectedReason : undefined,
        stage: activeStage,
        tag: activeTag,
        remark:
          activeRemark ||
          (isCallAttempt && !isConnected
            ? `Call Not Connected: ${NOT_CONNECTED_LABELS[notConnectedReason || 'DID_NOT_PICK'] || notConnectedReason || 'Did Not Pick'}`
            : undefined),
        followUpAt: finalFollowUp,
        durationSeconds: isCallAttempt && isConnected ? callDurationSeconds : 0,
      });

      if (!isClosing && actionNextFollowUp && finalFollowUp) {
        notificationService.scheduleFollowUpReminder(
          { ...currentLead, nextFollowUpAt: finalFollowUp },
          finalFollowUp,
        );
      } else {
        notificationService.cancelFollowUpReminder(currentLead._id);
      }

      if (isLost) {
        toast.success(
          `${currentLead.name} marked as Customer Lost · Removed from active calling queue`,
          'Lead Suppressed',
        );
      } else if (isClosing) {
        toast.success(`Lead marked as ${activeStage}!`, 'Lead Closed');
      } else {
        toast.success(`Lead marked as ${activeStage}!`, 'Disposition Saved');
      }

      if (queue && queueIndex !== undefined && queueIndex + 1 < queue.length) {
        const remainingQueue = queue.slice(queueIndex + 1).filter((l) => !isLeadLostOrSuppressed(l));
        if (remainingQueue.length > 0) {
          const nextLead = remainingQueue[0];
          Alert.alert(
            'Lead Disposed',
            `Outcome recorded. Ready for next lead: ${nextLead.name}?`,
            [
              {
                text: 'Finish',
                style: 'cancel',
                onPress: () => navigation.navigate('Main'),
              },
              {
                text: 'Call Next Lead ›',
                onPress: () => {
                  navigation.replace('LeadDetail', {
                    lead: nextLead,
                    queue,
                    queueIndex: queue.findIndex((q) => q._id === nextLead._id),
                    initialTab: 'LEAD INFO',
                  });
                },
              },
            ],
          );
          return;
        }
      }

      navigation.goBack();
    },
    onError: (err: any) => {
      Alert.alert('Save Failed', err?.response?.data?.message || err?.message || 'Could not save disposition.');
    },
  });

  const campaignName =
    typeof currentLead.campaign === 'object' && currentLead.campaign?.name
      ? currentLead.campaign.name
      : 'Testing Campaigns';

  const assignedToName =
    typeof currentLead.assignedTo === 'object' && currentLead.assignedTo?.name
      ? currentLead.assignedTo.name
      : user?.name || 'Kavin';

  const formatDisplayDateTime = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return `${d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}  ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const formatDateOnly = (iso?: string | null) => {
    if (!iso) return '10-10-2026';
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? '10-10-2026'
      : d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatTimeOnly = (iso?: string | null) => {
    if (!iso) return '10:30 AM';
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? '10:30 AM'
      : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const openEditContact = () => {
    setEditName(currentLead.name || '');
    setEditPhone(currentLead.phone || '');
    setShowEditContactModal(true);
  };

  const handleSaveContactEdit = async () => {
    const newName = editName.trim() || currentLead.name;
    const rawPhone = editPhone.trim();
    const cleanDigits = rawPhone.replace(/\D/g, '');
    if (cleanDigits.length < 10) {
      Alert.alert('Invalid Phone', 'Customer phone number must contain at least 10 digits.');
      return;
    }
    const newPhone = rawPhone;
    setCurrentLead((prev) => ({
      ...prev,
      name: newName,
      phone: newPhone,
    }));
    setShowEditContactModal(false);

    try {
      if (currentLead._id) {
        await updateLeadDetails(currentLead._id, { name: newName, phone: newPhone });
        useLeadHistoryStore.getState().updateLeadName(currentLead._id, newName);
        queryClient.invalidateQueries({ queryKey: ['myLeadsList'] });
        queryClient.invalidateQueries({ queryKey: ['leadHistory', currentLead._id] });
      }
      toast.success('Contact info saved!', 'Updated');
    } catch {
      useLeadHistoryStore.getState().updateLeadName(currentLead._id, newName);
      toast.info('Contact info updated locally', 'Updated');
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: safeTopPadding }]} edges={['left', 'right']}>
      <RNStatusBar barStyle="dark-content" backgroundColor="transparent" translucent={true} />
      {/* 1. TOP HEADER (Clean White) */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.headerBackBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <ChevronDown size={24} color="#1F2937" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Lead Details</Text>
      </View>
      <OutboxStatusBanner />

      {/* 2. SUBHEADER 2 TABS (LEAD INFO | DISPOSE LEAD) */}
      <View style={styles.tabBar}>
        {(['LEAD INFO', 'DISPOSE LEAD'] as LeadTab[]).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabItemText, isActive && styles.tabItemTextActive]}>
                {tab}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 3. TAB BODIES */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={[
            styles.scrollContainer,
            activeTab === 'DISPOSE LEAD' && { backgroundColor: '#FFFFFF' },
          ]}
          contentContainerStyle={[
            styles.scrollContent,
            activeTab === 'DISPOSE LEAD' && styles.disposeScrollContent,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
        >
        {/* =========================================================================
            TAB 1: LEAD INFO (Exact match of Image 1)
           ========================================================================= */}
        {activeTab === 'LEAD INFO' && (
          <View style={{ gap: 14 }}>
            {/* Pill Banner: SCHEDULED LEADS */}
            <View style={styles.scheduledLeadsBanner}>
              <Text style={styles.scheduledLeadsBannerText}>SCHEDULED LEADS</Text>
            </View>

            {/* Card 1: Contact Details */}
            <View style={styles.neoCard}>
              <View style={styles.contactRow}>
                <Text style={styles.contactLabel}>Contact name: </Text>
                <Text style={styles.contactValue}>{currentLead.name}</Text>
                <TouchableOpacity
                  onPress={openEditContact}
                  style={styles.pencilBtn}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Edit2 size={13} color="#059669" />
                </TouchableOpacity>
              </View>

              <View style={styles.contactRow}>
                <Text style={styles.contactLabel}>Contact number: </Text>
                <Text style={styles.contactValue}>{formatDisplayPhone(currentLead.phone)}</Text>
                <TouchableOpacity
                  onPress={openEditContact}
                  style={styles.pencilBtn}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Edit2 size={13} color="#059669" />
                </TouchableOpacity>
              </View>

              <View style={[styles.contactRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.contactLabel}>Campaign name: </Text>
                <Text style={[styles.contactValue, { color: '#059669', fontWeight: '800' }]}>
                  {campaignName}
                </Text>
              </View>

              {/* Tag to Manager / Admin Button */}
              <TouchableOpacity
                style={styles.leadInfoTagBtn}
                onPress={() => setShowTagManagerModal(true)}
                activeOpacity={0.8}
              >
                <BookmarkCheck size={14} color="#D97706" strokeWidth={2.5} />
                <Text style={styles.leadInfoTagBtnText}>Tag Lead to Branch Manager / Admin</Text>
              </TouchableOpacity>

              {/* Add Task Button */}
              <TouchableOpacity
                style={[styles.leadInfoTagBtn, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', marginTop: 8 }]}
                onPress={() => setShowCreateTaskModal(true)}
                activeOpacity={0.8}
              >
                <CalendarCheck2 size={14} color="#059669" strokeWidth={2.5} />
                <Text style={[styles.leadInfoTagBtnText, { color: '#047857' }]}>Add Task / Reminder for Lead</Text>
              </TouchableOpacity>
            </View>

            {/* Card 2: Contact History */}
            <View style={[styles.neoCard, styles.contactHistoryCard]}>
              <Text style={styles.historyCardTitle}>Contact History:</Text>
              <TouchableOpacity
                style={styles.purpleViewBtn}
                onPress={() => setShowHistoryModal(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.purpleViewBtnText}>View</Text>
              </TouchableOpacity>
            </View>

            {/* Card 3: Other Details */}
            <View style={styles.neoCard}>
              <Text style={styles.otherDetailsHeading}>Other Details</Text>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>List name:</Text>
                <Text style={styles.detailValue}>{campaignName}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Creation date:</Text>
                <Text style={styles.detailValue}>
                  {formatDateOnly(currentLead.createdAt)} {formatTimeOnly(currentLead.createdAt)}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Lead status:</Text>
                <Text style={styles.detailValue}>{currentLead.status || 'OPEN'}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Lead state:</Text>
                <Text style={[styles.detailValue, { color: '#5B2C82', fontWeight: '700' }]}>
                  {currentLead.stage || 'IN PROGRESS'}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Lead tag:</Text>
                <Text style={styles.detailValue}>{currentLead.tag || 'Cold'}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Assigned to:</Text>
                <Text style={styles.detailValue}>{assignedToName}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Last call date:</Text>
                <Text style={styles.detailValue}>{formatDateOnly(currentLead.updatedAt)}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Last call time:</Text>
                <Text style={styles.detailValue}>{formatTimeOnly(currentLead.updatedAt)}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>References:</Text>
                <Text style={styles.detailValue}>None</Text>
              </View>

              <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.detailLabel}>Source type:</Text>
                <Text style={styles.detailValue}>{currentLead.source || 'Uploaded'}</Text>
              </View>
            </View>

            {/* Direct button to Disposition Form */}
            <TouchableOpacity
              style={styles.goToDisposeBtn}
              onPress={() => setActiveTab('DISPOSE LEAD')}
              activeOpacity={0.85}
            >
              <FileText size={16} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.goToDisposeBtnText}>Update Lead Outcome / Dispose ›</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* =========================================================================
            TAB 2: DISPOSE LEAD (Clean Native Dropdown Form)
           ========================================================================= */}
        {activeTab === 'DISPOSE LEAD' && (
          <View style={styles.disposeContainer}>
            {/* Customer Quick Summary Card */}
            <View style={styles.leadHeaderBanner}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.leadHeaderName} numberOfLines={1}>{currentLead.name}</Text>
                  <TouchableOpacity
                    onPress={openEditContact}
                    style={styles.headerEditBtn}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Edit2 size={13} color="#059669" />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={openEditContact}
                  activeOpacity={0.7}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}
                >
                  <Text style={styles.leadHeaderPhone} numberOfLines={1}>
                    {formatDisplayPhone(currentLead.phone)} • {campaignName}
                  </Text>
                  <Edit2 size={11} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {/* Tag Manager Button */}
                <TouchableOpacity
                  style={styles.quickTagBtn}
                  onPress={() => setShowTagManagerModal(true)}
                  activeOpacity={0.8}
                >
                  <BookmarkCheck size={13} color="#D97706" strokeWidth={2.5} />
                  <Text style={styles.quickTagBtnText}>Tag</Text>
                </TouchableOpacity>

                {/* Call Button */}
                <TouchableOpacity
                  style={styles.quickDialBtn}
                  onPress={handlePressCall}
                  activeOpacity={0.8}
                >
                  <Phone size={13} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.quickDialBtnText}>{callActive ? 'Calling…' : 'Call'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* NeoDove-Grade Post-Call Feedback Banner */}
            {isCallAttempt && (
              <View
                style={[
                  styles.callFeedbackBanner,
                  callDurationSeconds > 0 ? styles.callFeedbackConnected : styles.callFeedbackMissed,
                ]}
              >
                <View
                  style={[
                    styles.callFeedbackBadge,
                    callDurationSeconds > 0 ? styles.callFeedbackBadgeGreen : styles.callFeedbackBadgeRed,
                  ]}
                >
                  {callDurationSeconds > 0 ? (
                    <PhoneOutgoing size={12} color="#FFFFFF" strokeWidth={2.5} />
                  ) : (
                    <PhoneOff size={12} color="#FFFFFF" strokeWidth={2.5} />
                  )}
                  <Text style={styles.callFeedbackBadgeText}>
                    {callDurationSeconds > 0 ? 'Connected' : 'Not Connected'}
                  </Text>
                </View>
                <Text style={styles.callFeedbackDetailText}>
                  {callDurationSeconds > 0
                    ? `Talk Time: ${formatDuration(callDurationSeconds, true)}`
                    : 'Customer did not pick up / busy'}
                </Text>
              </View>
            )}

            {/* 1. Primary Outcomes (1-Tap Fast Selection) */}
            <View style={styles.fieldSection}>
              <Text style={styles.fieldLabel}>
                Select Outcome / State<Text style={styles.asterisk}>*</Text>
              </Text>
              <View style={styles.primaryOutcomeGrid}>
                {PRIMARY_OUTCOMES.map((item) => {
                  const isSelected = selectedState === item.stage;
                  return (
                    <TouchableOpacity
                      key={item.stage}
                      style={[
                        styles.outcomeCard,
                        isSelected && {
                          backgroundColor: item.activeBg,
                          borderColor: item.activeBorder,
                          borderWidth: 1.5,
                        },
                      ]}
                      onPress={() => handleSelectOutcome(item.stage, item.tag)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.outcomeCardTop}>
                        <Text style={styles.outcomeEmoji}>{item.emoji}</Text>
                        <Text
                          style={[
                            styles.outcomeLabel,
                            isSelected && { color: item.activeColor, fontWeight: '700' },
                          ]}
                        >
                          {item.label}
                        </Text>
                      </View>
                      <Text style={styles.outcomeSublabel}>{item.sublabel}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Other Stages (Fallback Dropdown) */}
              <TouchableOpacity
                style={styles.moreStagesBtn}
                onPress={() => setShowStatePicker(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.moreStagesBtnText}>
                  Other Stages:{' '}
                  <Text style={{ fontWeight: '700', color: '#1E293B' }}>{selectedState}</Text>
                </Text>
                <ChevronDown size={14} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* 1.5 Reason for Not Connected* (shown when state is NOT CONNECTED) */}
            {selectedState === 'NOT CONNECTED' && (
              <View style={styles.fieldSection}>
                <Text style={styles.fieldLabel}>
                  Reason for Not Connected<Text style={styles.asterisk}>*</Text>
                </Text>
                <View style={styles.quickReasonRow}>
                  {QUICK_NOT_CONNECTED_PRESETS.map((preset) => {
                    const isSelected = selectedNotConnectedReason === preset.reason;
                    return (
                      <TouchableOpacity
                        key={preset.reason}
                        style={[
                          styles.reasonChip,
                          isSelected && styles.reasonChipActive,
                        ]}
                        onPress={() => setSelectedNotConnectedReason(preset.reason)}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 12 }}>{preset.emoji}</Text>
                        <Text
                          style={[
                            styles.reasonChipText,
                            isSelected && styles.reasonChipTextActive,
                          ]}
                        >
                          {preset.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* 2. Select Tag* */}
            <View style={styles.fieldSection}>
              <Text style={styles.fieldLabel}>
                Select Tag<Text style={styles.asterisk}>*</Text>
              </Text>
              <View style={styles.radioGroup}>
                {(['Hot', 'Cold', 'Warm'] as const).map((tag) => {
                  const isSelected = selectedTag === tag;
                  const tagColor = tag === 'Hot' ? '#DC2626' : tag === 'Warm' ? '#D97706' : '#2563EB';
                  return (
                    <TouchableOpacity
                      key={tag}
                      style={styles.radioRow}
                      onPress={() => setSelectedTag(tag)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.radioCircle, isSelected && { borderColor: tagColor }]}>
                        {isSelected && <View style={[styles.radioDot, { backgroundColor: tagColor }]} />}
                      </View>
                      <Text style={[styles.radioText, isSelected && { color: tagColor, fontWeight: '500' }]}>
                        {tag}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 3. Select next action* */}
            <View style={styles.fieldSection}>
              <Text style={styles.fieldLabel}>
                Select next action<Text style={styles.asterisk}>*</Text>
              </Text>

              {/* Action 1: Next follow up date? */}
              <View style={styles.actionBlock}>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setActionNextFollowUp(!actionNextFollowUp)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkboxBox, actionNextFollowUp && styles.checkboxBoxChecked]}>
                    {actionNextFollowUp && <Check size={11} color="#0F9D58" strokeWidth={3} />}
                  </View>
                  <Text style={styles.checkboxLabel}>Next follow up date?</Text>
                </TouchableOpacity>

                {actionNextFollowUp && (
                  <View style={{ gap: 6 }}>
                    <TouchableOpacity
                      style={styles.dropdownBoxSub}
                      onPress={() => setShowDatePickerModal(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dropdownValueText, !followUpDate && styles.placeholderText]}>
                        {followUpDate ? formatDisplayDateTime(followUpDate) : 'Select date & time'}
                      </Text>
                      <Text style={styles.dropdownCaret}>▼</Text>
                    </TouchableOpacity>

                    {/* Quick follow up presets */}
                    <View style={styles.quickReasonRow}>
                      {[
                        { label: '+1 Hr', hours: 1 },
                        { label: '+2 Hrs', hours: 2 },
                        { label: 'Tomorrow 10 AM', hours: 24, hour: 10 },
                        { label: 'Tomorrow 3 PM', hours: 24, hour: 15 },
                      ].map((preset) => (
                        <TouchableOpacity
                          key={preset.label}
                          style={styles.reasonChip}
                          onPress={() => setQuickFollowUp(preset.hours, preset.hour)}
                          activeOpacity={0.7}
                        >
                          <Clock size={11} color="#4B5563" />
                          <Text style={styles.reasonChipText}>{preset.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>

              {/* Action 2: Re-assign this lead to other user? */}
              <View style={styles.actionBlock}>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setActionReassign(!actionReassign)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkboxBox, actionReassign && styles.checkboxBoxChecked]}>
                    {actionReassign && <Check size={11} color="#0F9D58" strokeWidth={3} />}
                  </View>
                  <Text style={styles.checkboxLabel}>Re-assign this lead to other user?</Text>
                </TouchableOpacity>

                {actionReassign && (
                  <TouchableOpacity
                    style={styles.dropdownBoxSub}
                    onPress={() => setShowReassignPicker(true)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.dropdownValueText,
                        !selectedReassignUserId && styles.placeholderText,
                      ]}
                    >
                      {selectedReassignUserId
                        ? (() => {
                            const found = assignableAgents.find((a) => a._id === selectedReassignUserId);
                            return found ? `${found.name} (${found.role || 'User'})` : 'Select User';
                          })()
                        : 'Select User'}
                    </Text>
                    <Text style={styles.dropdownCaret}>▼</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Action 3: Copy lead to other campaign? */}
              <View style={styles.actionBlock}>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setActionCopyCampaign(!actionCopyCampaign)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkboxBox, actionCopyCampaign && styles.checkboxBoxChecked]}>
                    {actionCopyCampaign && <Check size={11} color="#0F9D58" strokeWidth={3} />}
                  </View>
                  <Text style={styles.checkboxLabel}>Copy lead to other campaign?</Text>
                </TouchableOpacity>

                {actionCopyCampaign && (
                  <TouchableOpacity
                    style={styles.dropdownBoxSub}
                    onPress={() => setShowCampaignPicker(true)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.dropdownValueText,
                        !selectedCopyCampaignId && styles.placeholderText,
                      ]}
                    >
                      {selectedCopyCampaignId
                        ? campaignsList.find((c) => c._id === selectedCopyCampaignId)?.name ||
                          'Select Campaign'
                        : 'Select Campaign'}
                    </Text>
                    <Text style={styles.dropdownCaret}>▼</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* 4. Remarks */}
            <View style={styles.fieldSection}>
              <Text style={styles.fieldLabel}>Remarks</Text>
              <TextInput
                value={remarks}
                onChangeText={setRemarks}
                placeholder="Type here...."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                style={styles.remarksBox}
                onFocus={() => {
                  setTimeout(() => {
                    scrollViewRef.current?.scrollToEnd({ animated: true });
                  }, 250);
                }}
              />
            </View>

            {/* 4b. Deal Value & Currency (P11.4) */}
            <View style={styles.fieldSection}>
              <Text style={styles.fieldLabel}>Deal Value (Optional)</Text>
              <View style={styles.dealRow}>
                <View style={styles.currencyBadge}>
                  <Text style={styles.currencyBadgeText}>{currency}</Text>
                </View>
                <TextInput
                  value={dealAmount}
                  onChangeText={setDealAmount}
                  placeholder="e.g. 25000"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  style={styles.dealInput}
                />
              </View>
            </View>

            {/* 5. Save & Update Lead Button */}
            <TouchableOpacity
              style={styles.purpleSubmitBtn}
              onPress={() => disposeMutation.mutate()}
              disabled={disposeMutation.isPending}
              activeOpacity={0.85}
            >
              {disposeMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.purpleSubmitBtnText}>Save & Update Lead</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 4. STICKY BOTTOM ACTIONS FOR LEAD INFO TAB (Call Now + Floating +) */}
      {activeTab === 'LEAD INFO' && (
        <View style={styles.stickyBottomBar}>
          <TouchableOpacity
            style={styles.callNowPillBtn}
            onPress={handlePressCall}
            activeOpacity={0.85}
          >
            <Phone size={18} color="#FFFFFF" strokeWidth={2.5} />
            <Text style={styles.callNowPillBtnText}>
              {callActive ? 'Calling…' : 'Call Now'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.floatingPlusBtn}
            onPress={() => setShowEditContactModal(true)}
            activeOpacity={0.85}
          >
            <Plus size={22} color="#FFFFFF" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      )}

      {/* ==========================================
          MODALS
         ========================================== */}

      {/* Contact History Modal */}
      <Modal
        visible={showHistoryModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowHistoryModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Contact History</Text>
              <TouchableOpacity onPress={() => setShowHistoryModal(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <LeadTimeline
                activities={combinedActivities}
                isLoading={historyLoading}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Contact Modal */}
      <Modal
        visible={showEditContactModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditContactModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Contact Details</Text>
              <TouchableOpacity onPress={() => setShowEditContactModal(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <View style={{ gap: 12, paddingVertical: 10 }}>
              <View>
                <Text style={styles.formLabel}>Contact Name</Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  style={styles.textInput}
                />
              </View>
              <View>
                <Text style={styles.formLabel}>Contact Number</Text>
                <TextInput
                  value={editPhone}
                  onChangeText={setEditPhone}
                  keyboardType="phone-pad"
                  style={styles.textInput}
                />
              </View>
              <TouchableOpacity
                style={styles.purpleSubmitBtn}
                onPress={handleSaveContactEdit}
              >
                <Text style={styles.purpleSubmitBtnText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* State Picker Modal */}
      <Modal
        visible={showStatePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStatePicker(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update Lead State</Text>
              <TouchableOpacity onPress={() => setShowStatePicker(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 350 }}>
              {PIPELINE_STATES.map((stg) => {
                const isSelected = selectedState === stg;
                return (
                  <TouchableOpacity
                    key={stg}
                    style={[styles.pickerItemRow, isSelected && styles.pickerItemRowSelected]}
                    onPress={() => {
                      setSelectedState(stg);
                      setShowStatePicker(false);
                    }}
                  >
                    <Text style={[styles.pickerItemText, isSelected && styles.pickerItemTextSelected]}>
                      {stg}
                    </Text>
                    {isSelected ? <Check size={16} color="#0F9D58" strokeWidth={3} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Not Connected Reason Picker Modal */}
      <Modal
        visible={showNotConnectedReasonPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNotConnectedReasonPicker(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reason for Not Connected</Text>
              <TouchableOpacity onPress={() => setShowNotConnectedReasonPicker(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 380 }}>
              {NotConnectedReasons.map((reason) => {
                const isSelected = selectedNotConnectedReason === reason;
                return (
                  <TouchableOpacity
                    key={reason}
                    style={[styles.pickerItemRow, isSelected && styles.pickerItemRowSelected]}
                    onPress={() => {
                      setSelectedNotConnectedReason(reason);
                      setShowNotConnectedReasonPicker(false);
                    }}
                  >
                    <Text style={[styles.pickerItemText, isSelected && styles.pickerItemTextSelected]}>
                      {NOT_CONNECTED_LABELS[reason] || reason}
                    </Text>
                    {isSelected ? <Check size={16} color="#0F9D58" strokeWidth={3} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* User Reassign Picker Modal */}
      <Modal
        visible={showReassignPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReassignPicker(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select User to Re-assign</Text>
              <TouchableOpacity onPress={() => setShowReassignPicker(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 350 }}>
              {assignableAgents.map((ag) => (
                <TouchableOpacity
                  key={ag._id}
                  style={styles.pickerItemRow}
                  onPress={() => {
                    setSelectedReassignUserId(ag._id);
                    setShowReassignPicker(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>{ag.name} ({ag.role || ag.branch || 'User'})</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Campaign Picker Modal */}
      <Modal
        visible={showCampaignPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCampaignPicker(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Campaign to Copy Lead</Text>
              <TouchableOpacity onPress={() => setShowCampaignPicker(false)}>
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 350 }}>
              {campaignsList.map((c) => (
                <TouchableOpacity
                  key={c._id}
                  style={styles.pickerItemRow}
                  onPress={() => {
                    setSelectedCopyCampaignId(c._id);
                    setShowCampaignPicker(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Custom Date & Time Picker */}
      <CrmDateTimePickerModal
        visible={showDatePickerModal}
        initialDate={followUpDate || undefined}
        title="Next Follow up Date & Time"
        onConfirm={(iso) => {
          setFollowUpDate(iso);
          setShowDatePickerModal(false);
        }}
        onClose={() => setShowDatePickerModal(false)}
      />

      {/* Permissions Modal */}
      <CallPermissionModal
        visible={showPermissionModal}
        onGrant={async () => {
          setShowPermissionModal(false);
          await callService.requestPermissions();
          await initiateCall();
        }}
        onSkip={async () => {
          setShowPermissionModal(false);
          skipPermissionCheckRef.current = true;
          await initiateCall();
        }}
      />

      {/* Tag Manager / Admin Modal */}
      <TagManagerModal
        visible={showTagManagerModal}
        onClose={() => setShowTagManagerModal(false)}
        customerName={currentLead.name}
        customerPhone={currentLead.phone}
        leadId={currentLead._id}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['leadHistory', currentLead._id] });
        }}
      />

      {/* Create Task Modal */}
      <CreateTaskModal
        visible={showCreateTaskModal}
        onClose={() => setShowCreateTaskModal(false)}
        leadId={currentLead._id}
        leadName={currentLead.name}
        leadPhone={currentLead.phone}
      />

      {/* NeoDove-Grade 1-Tap Quick Not Connected Sheet */}
      <Modal
        visible={showNotConnectedModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNotConnectedModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={[styles.modalHeader, { paddingBottom: 12 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.ncIconCircle}>
                  <PhoneOff size={22} color="#DC2626" />
                </View>
                <View>
                  <Text style={styles.ncModalTitle}>Call Not Connected</Text>
                  <Text style={styles.ncModalSub}>Select reason to auto-save & proceed</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.ncCloseBtn}
                onPress={() => setShowNotConnectedModal(false)}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.ncPromptText}>
              Select what happened with <Text style={{ fontWeight: '700', color: '#0F172A' }}>{currentLead.name || currentLead.phone}</Text>. Tap to record in 1-tap:
            </Text>

            <View style={styles.ncGrid}>
              {QUICK_NOT_CONNECTED_PRESETS.slice(0, 6).map((item) => (
                <TouchableOpacity
                  key={item.reason}
                  style={styles.ncGridBtn}
                  activeOpacity={0.7}
                  disabled={disposeMutation.isPending}
                  onPress={() => handleQuickNotConnectedSubmit(item.reason)}
                >
                  <Text style={styles.ncBtnEmoji}>{item.emoji}</Text>
                  <Text style={styles.ncBtnLabel} numberOfLines={1}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.ncFullFormBtn}
              onPress={() => setShowNotConnectedModal(false)}
            >
              <Edit2 size={16} color="#475569" />
              <Text style={styles.ncFullFormBtnText}>Add custom notes / reschedule instead</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerBar: {
    height: 56,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  headerBackBtn: {
    width: 32,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: '#0F9D58',
  },
  tabItemText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#6B7280',
  },
  tabItemTextActive: {
    color: '#0F9D58',
    fontWeight: '500',
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 110,
  },
  scheduledLeadsBanner: {
    alignSelf: 'center',
    backgroundColor: '#E6F4EA',
    paddingVertical: 6,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  scheduledLeadsBannerText: {
    color: '#0F9D58',
    fontWeight: '500',
    fontSize: 12,
  },
  neoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  contactLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '400',
  },
  contactValue: {
    fontSize: 13.5,
    color: '#1F2937',
    fontWeight: '500',
    flex: 1,
  },
  pencilBtn: {
    padding: 4,
  },
  contactHistoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  historyCardTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  purpleViewBtn: {
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
  },
  purpleViewBtnText: {
    color: '#0F9D58',
    fontWeight: '500',
    fontSize: 12.5,
  },
  otherDetailsHeading: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7.5,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  detailLabel: {
    fontSize: 12.5,
    color: '#6B7280',
    fontWeight: '400',
  },
  detailValue: {
    fontSize: 12.5,
    color: '#1F2937',
    fontWeight: '500',
  },
  stickyBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  callNowPillBtn: {
    flex: 1,
    height: 48,
    backgroundColor: '#0F9D58',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  callNowPillBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  floatingPlusBtn: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#0F9D58',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disposeScrollContent: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 280,
  },
  disposeContainer: {
    backgroundColor: '#FFFFFF',
  },
  leadHeaderBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leadHeaderName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1F2937',
  },
  leadHeaderPhone: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '400',
  },
  quickDialBtn: {
    backgroundColor: '#0F9D58',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 5,
  },
  quickDialBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  headerEditBtn: {
    padding: 3,
    backgroundColor: '#ECFDF5',
    borderRadius: 6,
  },
  quickTagBtn: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  quickTagBtnText: {
    color: '#D97706',
    fontSize: 12,
    fontWeight: '600',
  },
  leadInfoTagBtn: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  leadInfoTagBtnText: {
    color: '#D97706',
    fontSize: 13,
    fontWeight: '700',
  },
  goToDisposeBtn: {
    backgroundColor: '#0F9D58',
    height: 46,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 8,
  },
  goToDisposeBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '500',
  },
  // Post-Call Feedback Banner (NeoDove Standard)
  callFeedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 16,
    gap: 10,
    borderWidth: 1,
  },
  callFeedbackConnected: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  callFeedbackMissed: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  callFeedbackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    gap: 4,
  },
  callFeedbackBadgeGreen: {
    backgroundColor: '#059669',
  },
  callFeedbackBadgeRed: {
    backgroundColor: '#DC2626',
  },
  callFeedbackBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  callFeedbackDetailText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },

  // 1-Tap Primary Outcome Cards
  primaryOutcomeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  outcomeCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  outcomeCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  outcomeEmoji: {
    fontSize: 15,
  },
  outcomeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  outcomeSublabel: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    marginLeft: 21,
  },
  moreStagesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  moreStagesBtnText: {
    fontSize: 12.5,
    color: '#64748B',
  },

  fieldSection: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: 6,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1F2937',
    marginBottom: 6,
  },
  asterisk: {
    color: '#DC2626',
  },
  dropdownBox: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  dropdownBoxSub: {
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginTop: 8,
  },
  dropdownValueText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#1F2937',
  },
  placeholderText: {
    color: '#9CA3AF',
    fontWeight: '400',
  },
  dropdownCaret: {
    fontSize: 10,
    color: '#6B7280',
    marginLeft: 6,
    transform: [{ scaleY: 0.85 }],
  },
  quickReasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  reasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  reasonChipActive: {
    backgroundColor: '#E6F4EA',
    borderColor: '#0F9D58',
  },
  reasonChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#4B5563',
  },
  reasonChipTextActive: {
    color: '#0F9D58',
    fontWeight: '700',
  },
  radioGroup: {
    gap: 10,
    paddingTop: 4,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: '#FFFFFF',
  },
  radioCircleActive: {
    borderColor: '#0F9D58',
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0F9D58',
  },
  radioText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '400',
  },
  radioTextActive: {
    color: '#1F2937',
    fontWeight: '500',
  },
  actionBlock: {
    marginBottom: 12,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxBoxChecked: {
    borderColor: '#0F9D58',
    backgroundColor: '#E6F4EA',
  },
  checkboxLabel: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '400',
  },
  remarksBox: {
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 12,
    fontSize: 14,
    color: '#1F2937',
  },
  dealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  currencyBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  currencyBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  dealInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#1F2937',
  },
  purpleSubmitBtn: {
    height: 48,
    backgroundColor: '#0F9D58',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  purpleSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  textInput: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#1F2937',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  pickerItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerItemRowSelected: {
    backgroundColor: '#E6F4EA',
  },
  pickerItemText: {
    fontSize: 13.5,
    fontWeight: '400',
    color: '#1F2937',
  },
  pickerItemTextSelected: {
    color: '#0F9D58',
    fontWeight: '500',
  },
  ncIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ncModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  ncModalSub: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  ncCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ncPromptText: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 16,
    lineHeight: 18,
  },
  ncGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  ncGridBtn: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  ncBtnEmoji: {
    fontSize: 20,
  },
  ncBtnLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  ncFullFormBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  ncFullFormBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
});
