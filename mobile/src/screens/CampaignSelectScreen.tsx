import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import {
  Megaphone,
  PhoneCall,
  ArrowRight,
  Sparkles,
  Layers,
  Calendar,
  LogOut,
  Plus,
  RefreshCw,
  Target,
  ChevronRight,
  BarChart2,
} from 'lucide-react-native';

import { useAuthStore } from '../store/authStore';
import { useCampaignStore } from '../store/campaignStore';
import { fetchCampaigns, fetchMyLeads } from '../api/leadApi';
import { useSafeTopPadding } from '../utils/safeArea';
import { RootStackParamList, Campaign, Lead } from '../types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const CampaignSelectScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { user, logout } = useAuthStore();
  const { setSelectedCampaign } = useCampaignStore();
  const { width } = useWindowDimensions();
  const isWide = width >= 860;
  const safeTopPadding = useSafeTopPadding(isWide);

  const currentMonthName = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

  // 1. Fetch accessible campaigns
  const {
    data: campaignsData,
    isLoading: isCampaignsLoading,
    isRefetching: isCampaignsRefetching,
    refetch: refetchCampaigns,
  } = useQuery({
    queryKey: ['campaigns'],
    queryFn: fetchCampaigns,
    staleTime: 30000,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  // 2. Fetch agent leads to calculate per-campaign assigned lead counts
  const {
    data: leadsData,
    isLoading: isLeadsLoading,
    isRefetching: isLeadsRefetching,
    refetch: refetchLeads,
  } = useQuery({
    queryKey: ['myLeadsList'],
    queryFn: () => fetchMyLeads({ limit: 1 }),
    staleTime: 30000,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const allLeads: Lead[] = leadsData?.leads || [];
  const campaigns: any[] = campaignsData?.campaigns || [];

  // Total leads across campaigns (accurate aggregation from DB)
  const totalSystemLeads = useMemo(() => {
    const sumFromCamps = campaigns.reduce((acc, c: any) => acc + (c.totalLeads || 0), 0);
    if (sumFromCamps > 0) return sumFromCamps;
    if (leadsData?.total && leadsData.total > 0) return leadsData.total;
    return allLeads.length;
  }, [campaigns, leadsData, allLeads]);

  const handleSelectCampaign = async (campaign: Campaign | null) => {
    if (!campaign) {
      await setSelectedCampaign(null, 'All campaigns');
    } else {
      await setSelectedCampaign(campaign._id, campaign.name);
    }
    // Navigate to Main Tab -> MyLeads
    navigation.navigate('Main' as any, {
      screen: 'MyLeads',
    });
  };

  const isRefreshing = isCampaignsRefetching || isLeadsRefetching;
  const onRefresh = () => {
    refetchCampaigns();
    refetchLeads();
  };

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: safeTopPadding }]} edges={['left', 'right']}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerGreeting}>Welcome, {user?.name || 'Agent'}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{user?.role || 'AGENT'}</Text>
            </View>
            <View style={styles.branchBadge}>
              <Text style={styles.branchBadgeText}>{user?.branch || 'General Branch'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={onRefresh}
            activeOpacity={0.7}
          >
            <RefreshCw size={18} color="#475569" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerIconBtn, { backgroundColor: '#FEE2E2' }]}
            onPress={logout}
            activeOpacity={0.7}
          >
            <LogOut size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isWide && { maxWidth: 900, alignSelf: 'center', width: '100%' },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={['#10B981']} />
        }
      >
        {/* Banner Section */}
        <View style={styles.bannerCard}>
          <View style={styles.bannerIconWrap}>
            <Megaphone size={28} color="#FFFFFF" strokeWidth={2.3} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.monthPill}>
              <Calendar size={13} color="#047857" />
              <Text style={styles.monthPillText}>{currentMonthName} Campaigns</Text>
            </View>
            <Text style={styles.bannerTitle}>Select Campaign Workspace</Text>
            <Text style={styles.bannerSubtitle}>
              Choose a campaign to start calling. Numbers and progress are strictly maintained within each campaign.
            </Text>
          </View>
        </View>

        {/* Option 1: Combined All Leads Queue */}
        <TouchableOpacity
          style={styles.allLeadsCard}
          onPress={() => handleSelectCampaign(null)}
          activeOpacity={0.85}
        >
          <View style={styles.allLeadsLeft}>
            <View style={styles.allLeadsIconWrap}>
              <Layers size={22} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.allLeadsTitle}>All Campaigns (Combined Queue)</Text>
              </View>
              <Text style={styles.allLeadsSubtitle}>
                Access all {totalSystemLeads} leads assigned to you across all active campaigns
              </Text>
            </View>
          </View>
          <View style={styles.allLeadsBadge}>
            <Text style={styles.allLeadsBadgeText}>{totalSystemLeads} Leads</Text>
            <ChevronRight size={16} color="#2563EB" />
          </View>
        </TouchableOpacity>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Active Campaigns</Text>
          <Text style={styles.sectionSubtitle}>
            {campaigns.length} available {campaigns.length === 1 ? 'campaign' : 'campaigns'}
          </Text>
        </View>

        {isCampaignsLoading && !campaigns.length ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.loaderText}>Loading campaigns...</Text>
          </View>
        ) : campaigns.length === 0 ? (
          <View style={styles.emptyCard}>
            <Megaphone size={40} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No Active Campaigns Found</Text>
            <Text style={styles.emptyDesc}>
              No active campaigns are currently configured. Please check with your manager or admin to add campaigns.
            </Text>
          </View>
        ) : (
          campaigns.map((camp: any) => {
            // Count leads assigned to this agent for this specific campaign
            const campLeads = allLeads.filter((l) => {
              if (typeof l.campaign === 'object' && l.campaign) {
                return l.campaign._id === camp._id || l.campaign.name === camp.name;
              }
              return l.campaignId === camp._id;
            });

            const assignedCount = camp.totalLeads ?? campLeads.length;
            const newLeadsCount = camp.newLeads ?? campLeads.filter((l) => l.stage === 'New' || l.attemptCount === 0).length;
            const followUpCount = camp.followUpLeads ?? campLeads.filter((l) => l.stage === 'Follow Up' || l.stage === 'Follow-up').length;

            const priorityColor =
              camp.priority === 'HIGH' ? '#DC2626' : camp.priority === 'MEDIUM' ? '#D97706' : '#2563EB';
            const priorityBg =
              camp.priority === 'HIGH' ? '#FEE2E2' : camp.priority === 'MEDIUM' ? '#FEF3C7' : '#DBEAFE';

            return (
              <TouchableOpacity
                key={camp._id}
                style={styles.campaignCard}
                onPress={() => handleSelectCampaign(camp)}
                activeOpacity={0.88}
              >
                {/* Top Row: Icon, Title, Priority */}
                <View style={styles.campTopRow}>
                  <View style={styles.campIconWrap}>
                    <PhoneCall size={20} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.campName}>{camp.name}</Text>
                    <Text style={styles.campMeta}>
                      {camp.createdAt
                        ? `Created ${new Date(camp.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`
                        : 'Active Campaign'}
                    </Text>
                  </View>
                  <View style={[styles.priorityPill, { backgroundColor: priorityBg }]}>
                    <Text style={[styles.priorityText, { color: priorityColor }]}>
                      {camp.priority || 'NORMAL'}
                    </Text>
                  </View>
                </View>

                {/* Metrics Row */}
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statNumber}>{assignedCount}</Text>
                    <Text style={styles.statLabel}>Assigned Leads</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statBox}>
                    <Text style={[styles.statNumber, { color: '#059669' }]}>{newLeadsCount}</Text>
                    <Text style={styles.statLabel}>New Numbers</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statBox}>
                    <Text style={[styles.statNumber, { color: '#D97706' }]}>{followUpCount}</Text>
                    <Text style={styles.statLabel}>Follow-ups</Text>
                  </View>
                </View>

                {/* CTA Action Bar */}
                <View style={styles.campFooter}>
                  <TouchableOpacity
                    style={styles.viewAnalyticsMiniBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      navigation.navigate('CampaignDetail', {
                        campaignId: camp._id,
                        campaignName: camp.name,
                        campaign: camp,
                      });
                    }}
                    activeOpacity={0.8}
                  >
                    <BarChart2 size={13} color="#2563EB" />
                    <Text style={styles.viewAnalyticsMiniText}>View Analytics</Text>
                  </TouchableOpacity>

                  <View style={styles.enterQueueBtn}>
                    <Text style={styles.enterQueueBtnText}>Enter Calling Desk</Text>
                    <ArrowRight size={14} color="#FFFFFF" strokeWidth={2.5} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {/* Manager/Admin Direct Campaign Creator Link */}
        {(user?.role === 'ADMIN' || user?.role === 'MANAGER') && (
          <TouchableOpacity
            style={styles.createCampBtn}
            onPress={() => navigation.navigate('Campaigns')}
            activeOpacity={0.8}
          >
            <Plus size={18} color="#10B981" />
            <Text style={styles.createCampBtnText}>Manage & Create Campaigns</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerGreeting: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  roleBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  branchBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  branchBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  bannerCard: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  bannerIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#D1FAE5',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  monthPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  bannerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: 12.5,
    color: '#94A3B8',
    lineHeight: 17,
  },
  allLeadsCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    marginBottom: 20,
  },
  allLeadsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  allLeadsIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  allLeadsTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#1E40AF',
  },
  allLeadsSubtitle: {
    fontSize: 11.5,
    color: '#3B82F6',
    marginTop: 2,
  },
  allLeadsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  allLeadsBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E40AF',
  },
  sectionHeaderRow: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  loaderWrap: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loaderText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 12,
  },
  emptyDesc: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  campaignCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    marginBottom: 14,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  campTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  campIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#DBEAFE',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  campName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  campMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  priorityPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  priorityText: {
    fontSize: 10.5,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },
  statNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  campFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#DBEAFE',
  },
  campFooterHint: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  viewAnalyticsMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  viewAnalyticsMiniText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  enterQueueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 9,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  enterQueueBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  createCampBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 10,
  },
  createCampBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#10B981',
  },
});
