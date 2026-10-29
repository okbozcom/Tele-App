import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import Svg, { G, Circle } from 'react-native-svg';
import {
  ArrowLeft,
  ChevronDown,
  PhoneCall,
  Clock3,
  Users,
  Eye,
  Headphones,
  Bell,
  Sparkles,
  Flame,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react-native';

import { fetchMyLeads, fetchCampaignById, fetchCampaigns } from '../api/leadApi';
import { useCampaignStore } from '../store/campaignStore';
import { CrmSidebarContent, CrmSidebarModalDrawer } from '../components/CrmSidebar';
import { FloatingDialpadFab } from '../components/FloatingDialpadFab';
import { useSafeTopPadding } from '../utils/safeArea';
import { RootStackParamList, Campaign, Lead } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ScreenRouteProp = RouteProp<RootStackParamList, 'CampaignDetail'>;

// ======================================================================
// MATHEMATICAL SVG DONUT CHART
interface DonutSegment {
  value: number;
  color: string;
}

const DonutChart: React.FC<{
  size?: number;
  strokeWidth?: number;
  segments: DonutSegment[];
}> = ({ size = 110, strokeWidth = 14, segments }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const validSegments = (segments || []).filter(
    (s) => s && typeof s.value === 'number' && !isNaN(s.value) && s.value > 0
  );
  const total = validSegments.reduce((sum, s) => sum + s.value, 0);

  if (total <= 0) {
    return (
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="#E2E8F0"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
      </Svg>
    );
  }

  let accumulated = 0;

  return (
    <Svg width={size} height={size}>
      {/* Background circle */}
      <Circle
        cx={center}
        cy={center}
        r={radius}
        stroke="#E2E8F0"
        strokeWidth={strokeWidth}
        fill="transparent"
      />
      {/* Rotated group so the first segment starts cleanly at 12 o'clock */}
      <G transform={`rotate(-90 ${center} ${center})`}>
        {validSegments.map((segment, index) => {
          const dashLength = (segment.value / total) * circumference;
          const offset = -accumulated;
          accumulated += dashLength;

          return (
            <Circle
              key={index}
              cx={center}
              cy={center}
              r={radius}
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLength} ${circumference}`}
              strokeDashoffset={offset}
              fill="transparent"
            />
          );
        })}
      </G>
    </Svg>
  );
};

// ======================================================================
// MAIN CAMPAIGN DETAIL & ANALYTICS SCREEN (Image 3 Standard)
// ======================================================================
export const CampaignDetailScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const { width } = useWindowDimensions();
  const isWide = width >= 860;
  const safeTopPadding = useSafeTopPadding(isWide);

  const initialCampaign = route.params?.campaign;
  const paramCampaignId = route.params?.campaignId || initialCampaign?._id || '';

  // 0. Fetch all active campaigns for sidebar switching & fallback
  const { data: allCampaignsData, isLoading: isCampaignsLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: fetchCampaigns,
  });

  const campaignsList: Campaign[] = useMemo(() => {
    return (allCampaignsData?.campaigns || []).filter((c) => c.isActive !== false);
  }, [allCampaignsData]);

  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(paramCampaignId);
  const [showPicker, setShowPicker] = useState<boolean>(false);

  useEffect(() => {
    if (paramCampaignId) {
      setSelectedCampaignId(paramCampaignId);
    } else if (!selectedCampaignId && campaignsList.length > 0) {
      const storedId = useCampaignStore.getState().selectedCampaignId;
      if (storedId && storedId !== 'All campaigns') {
        setSelectedCampaignId(storedId);
      } else {
        setSelectedCampaignId(campaignsList[0]._id);
      }
    }
  }, [paramCampaignId, selectedCampaignId, campaignsList]);

  const activeCampaignId = selectedCampaignId;

  // 1. Fetch Campaign Info
  const { data: campaignData, isLoading: isCampaignLoading, refetch: refetchCampaign } = useQuery<{ campaign: Campaign | null }>({
    queryKey: ['campaignDetailInfo', activeCampaignId],
    queryFn: async () => {
      if (!activeCampaignId) return { campaign: null };
      return fetchCampaignById(activeCampaignId);
    },
    enabled: Boolean(activeCampaignId),
  });

  // 2. Fetch Leads assigned to this campaign
  const { data: leadsData, isLoading: isLeadsLoading, isRefetching, refetch: refetchLeads } = useQuery({
    queryKey: ['campaignDetailLeads', activeCampaignId],
    queryFn: () => fetchMyLeads({ campaignId: activeCampaignId, limit: 5000 }),
    enabled: Boolean(activeCampaignId),
  });

  const campaign = campaignData?.campaign || campaignsList.find((c) => c._id === activeCampaignId) || initialCampaign;
  const campaignName = campaign?.name || route.params?.campaignName || 'Campaign Details';
  const leads: Lead[] = leadsData?.leads || [];

  // ====================================================================
  // METRICS COMPUTATIONS (Matching Image 3)
  // ====================================================================
  const stats = useMemo(() => {
    const total = leads.length;

    // Open leads: New or 0 attempts
    const open = leads.filter(
      (l) => l.status === 'OPEN' && (l.stage === 'New' || !l.stage || l.attemptCount === 0),
    ).length;

    // Follow-up leads
    const followUp = leads.filter((l) => l.stage?.toLowerCase().includes('follow')).length;

    // Not Connected leads
    const notConnected = leads.filter(
      (l) =>
        l.stage?.toLowerCase().includes('not connected') ||
        l.stage?.toLowerCase().includes('busy') ||
        l.stage?.toLowerCase().includes('missed') ||
        l.stage?.toLowerCase().includes('switched'),
    ).length;

    // In-Progress leads: Open but attempted
    const inProgress = Math.max(
      0,
      leads.filter((l) => l.status === 'OPEN' && l.stage !== 'New' && l.attemptCount > 0).length ||
        followUp + notConnected,
    );

    // Converted leads
    const converted = leads.filter(
      (l) =>
        l.stage?.toLowerCase().includes('converted') ||
        l.stage?.toLowerCase().includes('won') ||
        l.stage?.toLowerCase().includes('deal'),
    ).length;

    // Lost leads
    const lost = leads.filter(
      (l) =>
        l.stage?.toLowerCase().includes('lost') ||
        l.stage?.toLowerCase().includes('not interested') ||
        l.stage?.toLowerCase().includes('junk'),
    ).length;

    // Closed by system / Admin
    const rawClosed = leads.filter((l) => l.status === 'CLOSED').length;
    const closedBySystem = Math.max(0, rawClosed - converted - lost);
    const closed = converted + lost + closedBySystem || rawClosed;

    return {
      total,
      open,
      inProgress,
      closed,
      followUp,
      notConnected,
      converted,
      lost,
      closedBySystem,
    };
  }, [leads]);

  // Lead distribution by agent
  const agentDistribution = useMemo(() => {
    const map = new Map<
      string,
      {
        agentName: string;
        open: number;
        followUp: number;
        notConnected: number;
        closed: number;
        total: number;
      }
    >();

    for (const l of leads) {
      let aName = 'Unassigned';
      if (typeof l.assignedTo === 'object' && l.assignedTo?.name) {
        aName = l.assignedTo.name;
      } else if (typeof l.assignedTo === 'string' && l.assignedTo) {
        aName = l.assignedTo;
      }

      if (!map.has(aName)) {
        map.set(aName, {
          agentName: aName,
          open: 0,
          followUp: 0,
          notConnected: 0,
          closed: 0,
          total: 0,
        });
      }

      const rec = map.get(aName)!;
      rec.total++;

      const stg = (l.stage || '').toLowerCase();
      if (l.status === 'CLOSED' || stg.includes('converted') || stg.includes('lost')) {
        rec.closed++;
      } else if (stg.includes('follow')) {
        rec.followUp++;
      } else if (
        stg.includes('not connected') ||
        stg.includes('busy') ||
        stg.includes('missed')
      ) {
        rec.notConnected++;
      } else {
        rec.open++;
      }
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [leads]);

  const handleRefresh = () => {
    refetchCampaign();
    refetchLeads();
  };

  const priorityLabel =
    campaign?.priority === 'HIGH'
      ? 'Highest'
      : campaign?.priority === 'LOW'
      ? 'Low'
      : 'Highest';

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: safeTopPadding }]} edges={['left', 'right']}>
      <View style={styles.screenRowLayout}>
        {isWide && <CrmSidebarContent />}
        <View style={styles.screenMainLayout}>
          {/* Campaign Switcher Dropdown */}
          {showPicker && campaignsList.length > 0 && (
            <View style={styles.dropdownModalWrap}>
              <TouchableOpacity
                style={styles.dropdownBackdrop}
                activeOpacity={1}
                onPress={() => setShowPicker(false)}
              />
              <View style={styles.dropdownCard}>
                <Text style={styles.dropdownTitle}>Switch Campaign</Text>
                <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                  {campaignsList.map((c) => {
                    const isSelected = c._id === activeCampaignId;
                    return (
                      <TouchableOpacity
                        key={c._id}
                        style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                        onPress={() => {
                          setSelectedCampaignId(c._id);
                          setShowPicker(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.dropdownItemText,
                            isSelected && styles.dropdownItemTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {c.name}
                        </Text>
                        {isSelected && <CheckCircle2 size={15} color="#0F9D58" />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          )}

      {/* =========================================================================
          TOP BAR (Image 3 Standard)
         ========================================================================= */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                (navigation as any).navigate('Main', { screen: 'Home' });
              }
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ArrowLeft size={18} color="#475569" />
          </TouchableOpacity>

          {/* Campaign Title with Red Highlighted Frame & Switcher */}
          <TouchableOpacity
            style={styles.campaignTitleBox}
            onPress={() => setShowPicker(!showPicker)}
            activeOpacity={0.7}
          >
            <Text style={styles.campaignTitleText} numberOfLines={1}>
              {campaignName}
            </Text>
            {campaignsList.length > 1 && (
              <ChevronDown size={14} color="#DC2626" style={{ marginLeft: 4 }} />
            )}
          </TouchableOpacity>

          <View style={styles.priorityWrap}>
            <Text style={styles.priorityLabel}>Priority: </Text>
            <Flame size={12} color="#DC2626" />
            <Text style={styles.priorityValue}>{priorityLabel}</Text>
          </View>
        </View>

        {/* Action Buttons: [ View Leads ] & [ View Call Logs ] */}
        <View style={styles.topBarRight}>
          <TouchableOpacity
            style={styles.viewLeadsPillBtn}
            onPress={() =>
              navigation.navigate('MyLeads', {
                campaignId: campaign?._id || activeCampaignId,
                campaignName,
              })
            }
            activeOpacity={0.8}
          >
            <Text style={styles.viewLeadsPillBtnText}>View Leads</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.viewCallLogsBtn}
            onPress={() =>
              navigation.navigate('CallHistory', {
                campaignId: campaign?._id || activeCampaignId,
                campaignName,
              })
            }
            activeOpacity={0.85}
          >
            <Clock3 size={13} color="#FFFFFF" strokeWidth={2.5} />
            <Text style={styles.viewCallLogsBtnText}>View Call Logs</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} colors={['#0F9D58']} />}
      >
        {(isLeadsLoading || (!activeCampaignId && isCampaignsLoading)) ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#0F9D58" />
            <Text style={styles.loadingText}>Loading campaign statistics...</Text>
          </View>
        ) : (
          <>
            {/* ===================================================================
                ROW 1: 3 KPI & DONUT STATISTIC CARDS (Image 3)
               =================================================================== */}
            <View style={[styles.donutsRow, isWide && styles.donutsRowWide]}>
              {/* Card 1: LEADS STATISTICS */}
              <View style={[styles.statCard, isWide && { flex: 1 }]}>
                <Text style={styles.cardHeaderTitle}>LEADS STATISTICS</Text>

                <View style={styles.metricsGrid}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>TOTAL</Text>
                    <Text style={styles.metricValue}>{stats?.total ?? 0}</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>OPEN</Text>
                    <Text style={[styles.metricValue, { color: '#16A34A' }]}>{stats?.open ?? 0}</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>IN-PROGRESS</Text>
                    <Text style={[styles.metricValue, { color: '#D97706' }]}>{stats?.inProgress ?? 0}</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>CLOSED</Text>
                    <Text style={[styles.metricValue, { color: '#DC2626' }]}>{stats?.closed ?? 0}</Text>
                  </View>
                </View>

                {/* Donut Chart */}
                <View style={styles.chartContainer}>
                  <DonutChart
                    segments={[
                      { value: stats?.open || 0, color: '#16A34A' },
                      { value: stats?.inProgress || 0, color: '#F59E0B' },
                      { value: stats?.closed || 0, color: '#DC2626' },
                    ]}
                  />
                  <View style={styles.donutLegendRow}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#16A34A' }]} />
                      <Text style={styles.legendText}>OPEN</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
                      <Text style={styles.legendText}>IN-PROG</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#DC2626' }]} />
                      <Text style={styles.legendText}>CLOSED</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Card 2: IN-PROGRESS LEADS */}
              <View style={[styles.statCard, isWide && { flex: 1 }]}>
                <Text style={styles.cardHeaderTitle}>IN-PROGRESS LEADS</Text>

                <View style={styles.metricsGrid}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>TOTAL</Text>
                    <Text style={styles.metricValue}>{stats?.inProgress ?? 0}</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>FOLLOW-UP</Text>
                    <Text style={[styles.metricValue, { color: '#D97706' }]}>{stats?.followUp ?? 0}</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>NOT CONNECTED</Text>
                    <Text style={[styles.metricValue, { color: '#F87171' }]}>{stats?.notConnected ?? 0}</Text>
                  </View>
                </View>

                {/* Donut Chart */}
                <View style={styles.chartContainer}>
                  <DonutChart
                    segments={[
                      { value: stats?.notConnected || 0, color: '#F87171' },
                      { value: stats?.followUp || 0, color: '#FBBF24' },
                    ]}
                  />
                  <View style={styles.donutLegendRow}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#F87171' }]} />
                      <Text style={styles.legendText}>NOT CONNECTED</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#FBBF24' }]} />
                      <Text style={styles.legendText}>FOLLOW-UP</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Card 3: CLOSED LEADS */}
              <View style={[styles.statCard, isWide && { flex: 1 }]}>
                <Text style={styles.cardHeaderTitle}>CLOSED LEADS</Text>

                <View style={styles.metricsGrid}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>TOTAL</Text>
                    <Text style={styles.metricValue}>{stats?.closed ?? 0}</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>CONVERTED</Text>
                    <Text style={[styles.metricValue, { color: '#9333EA' }]}>{stats?.converted ?? 0}</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>LOST</Text>
                    <Text style={[styles.metricValue, { color: '#EF4444' }]}>{stats?.lost ?? 0}</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>CLOSED BY SYS</Text>
                    <Text style={[styles.metricValue, { color: '#2563EB' }]}>{stats?.closedBySystem ?? 0}</Text>
                  </View>
                </View>

                {/* Donut Chart */}
                <View style={styles.chartContainer}>
                  <DonutChart
                    segments={[
                      { value: stats?.converted || 0, color: '#9333EA' },
                      { value: stats?.closedBySystem || 0, color: '#2563EB' },
                      { value: stats?.lost || 0, color: '#EF4444' },
                    ]}
                  />
                  <View style={styles.donutLegendRow}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#9333EA' }]} />
                      <Text style={styles.legendText}>CONVERTED</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#2563EB' }]} />
                      <Text style={styles.legendText}>SYSTEM</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* ===================================================================
                ROW 2: LEAD DISTRIBUTION (STACKED BAR CHART BY AGENT)
               =================================================================== */}
            <View style={styles.distributionCard}>
              <View style={styles.distributionHeaderRow}>
                <Text style={styles.cardHeaderTitle}>LEAD DISTRIBUTION</Text>

                {/* Legend on Right (Image 3) */}
                <View style={styles.barLegendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSquare, { backgroundColor: '#16A34A' }]} />
                    <Text style={styles.barLegendText}>OPEN</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSquare, { backgroundColor: '#FBBF24' }]} />
                    <Text style={styles.barLegendText}>FOLLOW-UP</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSquare, { backgroundColor: '#F87171' }]} />
                    <Text style={styles.barLegendText}>NOT CONNECTED</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSquare, { backgroundColor: '#DC2626' }]} />
                    <Text style={styles.barLegendText}>CLOSED</Text>
                  </View>
                </View>
              </View>

              {/* Agent Rows */}
              {agentDistribution.length === 0 ? (
                <View style={styles.emptyDistBox}>
                  <Users size={32} color="#94A3B8" />
                  <Text style={styles.emptyDistText}>No leads assigned to agents in this campaign yet.</Text>
                </View>
              ) : (
                <View style={styles.agentList}>
                  {agentDistribution.map((ag) => {
                    const totalAg = ag.total || 1;
                    const openPct = (ag.open / totalAg) * 100;
                    const followUpPct = (ag.followUp / totalAg) * 100;
                    const notConnPct = (ag.notConnected / totalAg) * 100;
                    const closedPct = (ag.closed / totalAg) * 100;

                    return (
                      <View key={ag.agentName} style={styles.agentBarRow}>
                        <View style={styles.agentNameCol}>
                          <Text style={styles.agentNameText} numberOfLines={1}>
                            {ag.agentName}
                          </Text>
                          <Text style={styles.agentTotalSub}>{ag.total} leads</Text>
                        </View>

                        {/* Horizontal Stacked Bar */}
                        <View style={styles.stackedBarTrack}>
                          {openPct > 0 && (
                            <View
                              style={[
                                styles.barSegment,
                                { width: `${openPct}%`, backgroundColor: '#16A34A' },
                              ]}
                            />
                          )}
                          {followUpPct > 0 && (
                            <View
                              style={[
                                styles.barSegment,
                                { width: `${followUpPct}%`, backgroundColor: '#FBBF24' },
                              ]}
                            />
                          )}
                          {notConnPct > 0 && (
                            <View
                              style={[
                                styles.barSegment,
                                { width: `${notConnPct}%`, backgroundColor: '#F87171' },
                              ]}
                            />
                          )}
                          {closedPct > 0 && (
                            <View
                              style={[
                                styles.barSegment,
                                { width: `${closedPct}%`, backgroundColor: '#DC2626' },
                              ]}
                            />
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
        </View>
      </View>
      <CrmSidebarModalDrawer />
      <FloatingDialpadFab bottomOffset={24} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenRowLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  screenMainLayout: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  },
  dropdownModalWrap: {
    position: 'absolute',
    top: 56,
    left: 16,
    zIndex: 999,
    width: 260,
  },
  dropdownBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  dropdownCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  dropdownTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  dropdownItemActive: {
    backgroundColor: '#ECFDF5',
  },
  dropdownItemText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
    flex: 1,
  },
  dropdownItemTextActive: {
    color: '#0F9D58',
    fontWeight: '700',
  },
  campaignTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#DC2626',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#FFFFFF',
  },
  campaignTitleText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  priorityWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  priorityLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  priorityValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewLeadsPillBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  viewLeadsPillBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  viewCallLogsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#DC2626',
    borderWidth: 1.5,
    borderColor: '#B91C1C',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    shadowColor: '#DC2626',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  viewCallLogsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollContainer: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 80,
    gap: 16,
  },
  loadingWrap: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  donutsRow: {
    gap: 14,
  },
  donutsRowWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  metricItem: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  chartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  donutLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  distributionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  distributionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 10,
  },
  barLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  legendSquare: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  barLegendText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  emptyDistBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 8,
  },
  emptyDistText: {
    fontSize: 12.5,
    color: '#94A3B8',
  },
  agentList: {
    gap: 14,
  },
  agentBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  agentNameCol: {
    width: 110,
  },
  agentNameText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  agentTotalSub: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  stackedBarTrack: {
    flex: 1,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#F1F5F9',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  barSegment: {
    height: '100%',
  },
});
