import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  Phone,
  PhoneOff,
  Calendar,
  Clock,
  Flame,
  Sun,
  Snowflake,
  User as UserIcon,
  MessageSquare,
  MapPin,
  BookmarkCheck,
} from 'lucide-react-native';
import { Activity } from '../types';
import { colors } from '../theme';

export const deduplicateActivities = (list: Activity[]): Activity[] => {
  if (!list || list.length === 0) return [];

  // Sort newest first
  const sorted = [...list].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const result: Activity[] = [];

  for (const act of sorted) {
    const actTime = new Date(act.createdAt).getTime();

    // Check if an identical or near-identical activity already exists in result within 120 seconds
    const isDuplicate = result.some((existing) => {
      // 1. Exact ID match
      if (existing._id && act._id && existing._id === act._id) return true;

      // 2. Same lead & same stage & created within 120 seconds of each other
      const existingTime = new Date(existing.createdAt).getTime();
      const timeDiff = Math.abs(existingTime - actTime);

      if (timeDiff < 120000) {
        const sameStage = (existing.stage || '').toLowerCase().trim() === (act.stage || '').toLowerCase().trim();
        const sameConnected = existing.connected === act.connected;

        if (existing.type === act.type && sameStage && sameConnected) {
          return true;
        }

        // If same connected status and both are calls within 60 seconds
        if (existing.type === act.type && sameConnected && timeDiff < 60000) {
          return true;
        }
      }

      return false;
    });

    if (!isDuplicate) {
      result.push(act);
    }
  }

  return result;
};

interface LeadTimelineProps {
  activities: Activity[];
  isLoading?: boolean;
}

export const LeadTimeline: React.FC<LeadTimelineProps> = ({
  activities,
  isLoading = false,
}) => {
  const cleanActivities = React.useMemo(() => deduplicateActivities(activities), [activities]);

  if (isLoading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="small" color="#2563EB" />
        <Text style={styles.loadingText}>Loading call history…</Text>
      </View>
    );
  }

  if (cleanActivities.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <View style={styles.emptyIconCircle}>
          <Clock size={20} color="#94A3B8" />
        </View>
        <Text style={styles.emptyTitle}>No Previous Call History</Text>
        <Text style={styles.emptySubtitle}>
          No agent has recorded a call for this lead yet. Once you log an outcome or follow-up, it will appear here in the timeline.
        </Text>
      </View>
    );
  }

  const formatActivityDate = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);

      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const isYesterday = d.toDateString() === yesterday.toDateString();

      const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (isToday) return `Today at ${timePart}`;
      if (isYesterday) return `Yesterday at ${timePart}`;
      return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timePart}`;
    } catch {
      return String(dateStr);
    }
  };

  const formatDuration = (sec?: number) => {
    if (!sec || sec <= 0) return '0s';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // Distinct agent avatar colors
  const getAvatarBg = (name: string) => {
    const char = name.charCodeAt(0) || 0;
    const bgs = ['#EEF2FF', '#ECFDF5', '#FEF3C7', '#F3E8FF', '#FCE7F3'];
    return bgs[char % bgs.length];
  };

  const getAvatarTextColor = (name: string) => {
    const char = name.charCodeAt(0) || 0;
    const colorsList = ['#3730A3', '#047857', '#B45309', '#6B21A8', '#9D174D'];
    return colorsList[char % colorsList.length];
  };

  return (
    <View style={styles.container}>
      {/* Header Info Bar */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryTitle}>Activity Timeline</Text>
        <Text style={styles.summaryCount}>
          {cleanActivities.length} {cleanActivities.length === 1 ? 'activity recorded' : 'activities recorded'}
        </Text>
      </View>

      {/* Vertical Timeline Items */}
      <View style={styles.timelineList}>
        {cleanActivities.map((act, index) => {
          const isCall = act.type === 'CALL';
          const isConnected = isCall && act.connected;
          const agent = typeof act.userId === 'object' && act.userId ? act.userId : null;
          const agentName = agent?.name || (typeof act.userId === 'string' ? act.userId : 'Agent');
          const isCurrentUser =
            agentName.toLowerCase().includes('you') ||
            agentName.toLowerCase().includes('john agent');

          const nameParts = typeof agentName === 'string' ? agentName.trim().split(/\s+/).filter(Boolean) : [];
          const initials =
            nameParts.length >= 2
              ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
              : nameParts.length === 1
              ? nameParts[0].substring(0, 2).toUpperCase()
              : 'AG';

          // Temperature badge logic
          const temp = (act.temperature || act.tag || '').toUpperCase();
          const isHot = temp.includes('HOT');
          const isWarm = temp.includes('WARM');
          const isCold = temp.includes('COLD');

          const isLast = index === cleanActivities.length - 1;

          return (
            <View key={act._id || String(index)} style={styles.timelineItemWrap}>
              {/* Left Line & Node */}
              <View style={styles.leftCol}>
                <View
                  style={[
                    styles.nodeCircle,
                    isConnected ? styles.nodeConnected : styles.nodeNotConnected,
                  ]}
                >
                  {!isCall ? (
                    <MessageSquare size={10} color="#FFFFFF" strokeWidth={2.5} />
                  ) : isConnected ? (
                    <Phone size={10} color="#FFFFFF" strokeWidth={2.5} />
                  ) : (
                    <PhoneOff size={10} color="#FFFFFF" strokeWidth={2.5} />
                  )}
                </View>
                {!isLast && <View style={styles.verticalTrack} />}
              </View>

              {/* Right Content Card */}
              <View style={styles.itemCard}>
                {/* Agent Header & Timestamp */}
                <View style={styles.itemHeader}>
                  <View style={styles.agentInfoRow}>
                    <View
                      style={[
                        styles.agentAvatar,
                        { backgroundColor: getAvatarBg(agentName) },
                      ]}
                    >
                      <Text
                        style={[
                          styles.agentAvatarText,
                          { color: getAvatarTextColor(agentName) },
                        ]}
                      >
                        {initials}
                      </Text>
                    </View>
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={styles.agentNameText}>{agentName}</Text>
                        {isCurrentUser && (
                          <View style={styles.youBadge}>
                            <Text style={styles.youBadgeText}>You</Text>
                          </View>
                        )}
                        {Boolean(agent?.branch || act.branch) && (
                          <View style={styles.branchBadge}>
                            <MapPin size={9} color="#0D9488" />
                            <Text style={styles.branchBadgeText}>
                              {agent?.branch || act.branch}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.timestampText}>
                        {formatActivityDate(act.createdAt)}
                      </Text>
                    </View>
                  </View>

                  {/* Call status or non-call lead update */}
                  <View
                    style={[
                      styles.callStatusPill,
                      isCall && isConnected ? styles.callConnectedPill : styles.callNotConnectedPill,
                    ]}
                  >
                    {isCall && isConnected && (
                      <Phone size={10} color="#047857" strokeWidth={2.5} style={{ marginRight: 3 }} />
                    )}
                    <Text
                      style={[
                        styles.callStatusText,
                        isCall && isConnected ? styles.callConnectedText : styles.callNotConnectedText,
                      ]}
                    >
                      {!isCall
                        ? 'Updated'
                        : isConnected
                        ? (act.durationSeconds && act.durationSeconds > 0 ? formatDuration(act.durationSeconds) : 'Connected')
                        : `${act.notConnectedReason?.replace(/_/g, ' ') || 'Did Not Pick'}`}
                    </Text>
                  </View>
                </View>

                {/* Outcome Badges (Stage & Temperature / Customer Importance) */}
                <View style={styles.badgesRow}>
                  {/* Stage Pill */}
                  <View style={styles.stagePill}>
                    <Text style={styles.stagePillLabel}>Stage:</Text>
                    <Text style={styles.stagePillValue}>{act.stage || 'Interested'}</Text>
                  </View>

                  {/* Temperature / Customer Rating */}
                  {isHot ? (
                    <View style={styles.hotBadge}>
                      <Flame size={11} color="#DC2626" fill="#DC2626" />
                      <Text style={styles.hotBadgeText}>Hot Lead</Text>
                    </View>
                  ) : isWarm ? (
                    <View style={styles.warmBadge}>
                      <Sun size={11} color="#D97706" />
                      <Text style={styles.warmBadgeText}>Warm Lead</Text>
                    </View>
                  ) : isCold ? (
                    <View style={styles.coldBadge}>
                      <Snowflake size={11} color="#2563EB" />
                      <Text style={styles.coldBadgeText}>Cold Lead</Text>
                    </View>
                  ) : act.tag ? (
                    <View style={styles.generalTagBadge}>
                      <BookmarkCheck size={11} color="#4F46E5" />
                      <Text style={styles.generalTagBadgeText}>{act.tag}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Agent Call Remarks / Notes */}
                {act.remark ? (
                  <View style={styles.remarkContainer}>
                    <MessageSquare size={12} color="#64748B" style={{ marginTop: 2 }} />
                    <Text style={styles.remarkText}>{act.remark}</Text>
                  </View>
                ) : null}

                {/* Engagement Form Answers */}
                {act.answers && act.answers.length > 0 ? (
                  <View style={styles.answersContainer}>
                    <Text style={styles.answersHeading}>Engagement Form Answers:</Text>
                    {act.answers.map((ans, aIdx) => (
                      <View key={aIdx} style={styles.answerRow}>
                        <Text style={styles.answerQuestion}>{ans.questionId}: </Text>
                        <Text style={styles.answerValue}>
                          {Array.isArray(ans.value) ? ans.value.join(', ') : String(ans.value ?? '')}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Scheduled Follow-up Badge */}
                {act.followUpAt ? (
                  <View style={styles.followUpBanner}>
                    <Calendar size={12} color="#B45309" />
                    <Text style={styles.followUpText}>
                      Next Follow-up:{' '}
                      <Text style={{ fontWeight: '700' }}>
                        {formatActivityDate(act.followUpAt)}
                      </Text>
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  emptyCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  emptyIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EDF2F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
    maxWidth: 280,
  },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryCount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  timelineList: {
    gap: 0,
  },
  timelineItemWrap: {
    flexDirection: 'row',
    gap: 12,
  },
  leftCol: {
    alignItems: 'center',
    width: 22,
  },
  nodeCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    marginTop: 2,
  },
  nodeConnected: {
    backgroundColor: '#10B981',
  },
  nodeNotConnected: {
    backgroundColor: '#F59E0B',
  },
  verticalTrack: {
    width: 2,
    flex: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  itemCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
    gap: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  agentInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  agentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentAvatarText: {
    fontSize: 10,
    fontWeight: '800',
  },
  agentNameText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  youBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  youBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  branchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  branchBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0F766E',
  },
  timestampText: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  callStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 20,
    borderWidth: 1,
    flexShrink: 0,
  },
  callStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  callConnectedPill: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  callConnectedText: {
    color: '#047857',
  },
  callNotConnectedPill: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  callNotConnectedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  stagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  stagePillLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  stagePillValue: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F172A',
  },
  hotBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  hotBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
  },
  warmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  warmBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
  },
  coldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  coldBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB',
  },
  remarkContainer: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 8,
    padding: 8,
    gap: 6,
  },
  remarkText: {
    fontSize: 11,
    color: '#334155',
    lineHeight: 16,
    flex: 1,
    fontStyle: 'normal',
  },
  followUpBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 6,
  },
  followUpText: {
    fontSize: 10,
    color: '#B45309',
  },
  generalTagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  generalTagBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4F46E5',
  },
  answersContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 8,
    gap: 4,
  },
  answersHeading: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 2,
  },
  answerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  answerQuestion: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#334155',
  },
  answerValue: {
    fontSize: 10.5,
    color: '#0F172A',
  },
});
