import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  Platform,
  StatusBar as RNStatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import {
  Phone,
  PhoneCall,
  Megaphone,
  CalendarClock,
  BarChart2,
  Clock3,
  UserPlus,
  Building2,
  ShieldCheck,
  UserCheck,
  LogOut,
  RefreshCw,
} from 'lucide-react-native';

import { useAuthStore } from '../store/authStore';
import { useDialerStore } from '../store/dialerStore';
import { FloatingDialpadFab } from '../components/FloatingDialpadFab';
import { useSafeTopPadding } from '../utils/safeArea';
import { RootStackParamList } from '../types';
import { fetchMyLeads } from '../api/leadApi';
import { toast } from '../store/toastStore';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const LaunchpadScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { width } = useWindowDimensions();
  const isWide = width >= 860;
  const safeTopPadding = useSafeTopPadding(isWide);

  const { user, logout } = useAuthStore();
  const isManagerOrAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Quick summary for badge cues (request limit 1 to retrieve accurate total count efficiently)
  const {
    data: leadsData,
    isLoading: isLeadsLoading,
    isError: isLeadsError,
    refetch,
  } = useQuery({
    queryKey: ['myLeadsSummary', user?._id],
    queryFn: () => fetchMyLeads({ limit: 1 }),
    staleTime: 1000 * 30,
  });

  const totalAssignedLeads = leadsData?.total ?? (Array.isArray(leadsData?.leads) ? leadsData.leads.length : 0);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast.success('Workspace updated', 'Refreshed');
    } catch {
      toast.error('Could not refresh workspace data', 'Network Error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleStartCalling = () => {
    navigation.navigate('CallingDesk');
  };

  const displayName = user?.name || (isManagerOrAdmin ? 'System Admin' : 'Caller');

  return (
    <SafeAreaView
      style={[styles.safeArea, { paddingTop: safeTopPadding }]}
      edges={['left', 'right']}
    >
      <RNStatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Top App Header Bar */}
      <View style={styles.topHeader}>
        <View style={styles.brandGroup}>
          <View style={styles.logoBadge}>
            <Phone size={18} color="#FFFFFF" strokeWidth={2.5} />
          </View>
          <View>
            <Text style={styles.brandTitle}>Hi Talk</Text>
            <View style={styles.roleSubRow}>
              <Building2 size={11} color="#64748B" />
              <Text style={styles.branchSubText}>
                {user?.branch ? `${user.branch} Branch` : 'Main Office'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.headerRightActions}>
          <View style={styles.roleBadge}>
            {isManagerOrAdmin ? (
              <ShieldCheck size={12} color="#0F9D58" strokeWidth={2.5} />
            ) : (
              <UserCheck size={12} color="#2563EB" strokeWidth={2.5} />
            )}
            <Text
              style={[
                styles.roleBadgeText,
                { color: isManagerOrAdmin ? '#0F9D58' : '#2563EB' },
              ]}
            >
              {user?.role || 'AGENT'}
            </Text>
          </View>



          <TouchableOpacity
            style={styles.refreshIconBtn}
            onPress={handleManualRefresh}
            disabled={isRefreshing}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color="#475569" />
            ) : (
              <RefreshCw size={15} color="#475569" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          isWide && styles.scrollContentWide,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* =========================================================================
            NEODOVE AGENT LAUNCHPAD HUB (MATCHING IMAGE 1 EXACTLY)
           ========================================================================= */}
        <View style={[styles.launchpadBox, isWide && styles.launchpadBoxWide]}>
          {/* Welcome Title */}
          <Text style={styles.welcomeHeroText}>Welcome {displayName}</Text>

          {/* Prominent "Start Calling" Hero Pill Button */}
          <TouchableOpacity
            style={styles.heroStartCallingBtn}
            onPress={handleStartCalling}
            activeOpacity={0.88}
          >
            <Phone size={17} color="#FFFFFF" strokeWidth={2.5} style={{ marginRight: 8 }} />
            <Text style={styles.heroStartCallingText}>Start Calling</Text>
          </TouchableOpacity>

          {/* 6 Grid Action Cards (2 Columns x 3 Rows) */}
          <View style={styles.actionGridContainer}>
            {/* Row 1 */}
            <View style={styles.gridRow}>
              {/* Card 1: My Campaigns */}
              <TouchableOpacity
                style={[styles.gridActionCard, { backgroundColor: '#5D5FEF' }]}
                onPress={() => navigation.navigate('CampaignSelect')}
                activeOpacity={0.85}
              >
                <Megaphone size={40} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={styles.gridActionLabel}>My Campaigns</Text>
              </TouchableOpacity>

              {/* Card 2: My Leads */}
              <TouchableOpacity
                style={[styles.gridActionCard, { backgroundColor: '#EA580C' }]}
                onPress={() => navigation.navigate('MyLeads')}
                activeOpacity={0.85}
              >
                <PhoneCall size={40} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={styles.gridActionLabel}>My Leads</Text>
                {totalAssignedLeads > 0 && (
                  <View style={styles.cardMiniBadge}>
                    <Text style={styles.cardMiniBadgeText}>{totalAssignedLeads}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Row 2 */}
            <View style={styles.gridRow}>
              {/* Card 3: My Tasks */}
              <TouchableOpacity
                style={[styles.gridActionCard, { backgroundColor: '#EC4899' }]}
                onPress={() => navigation.navigate('FollowUps')}
                activeOpacity={0.85}
              >
                <CalendarClock size={40} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={styles.gridActionLabel}>My Tasks</Text>
              </TouchableOpacity>

              {/* Card 4: My Report */}
              <TouchableOpacity
                style={[styles.gridActionCard, { backgroundColor: '#84CC16' }]}
                onPress={() => navigation.navigate('AgentReports')}
                activeOpacity={0.85}
              >
                <BarChart2 size={40} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={styles.gridActionLabel}>My Report</Text>
              </TouchableOpacity>
            </View>

            {/* Row 3 */}
            <View style={styles.gridRow}>
              {/* Card 5: Call Logs */}
              <TouchableOpacity
                style={[styles.gridActionCard, { backgroundColor: '#8B5CF6' }]}
                onPress={() => navigation.navigate('CallHistory')}
                activeOpacity={0.85}
              >
                <Clock3 size={40} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={styles.gridActionLabel}>Call Logs</Text>
              </TouchableOpacity>

              {/* Card 6: Walk-in Leads */}
              <TouchableOpacity
                style={[styles.gridActionCard, { backgroundColor: '#0284C7' }]}
                onPress={() => navigation.navigate('AddWalkInLead')}
                activeOpacity={0.85}
              >
                <UserPlus size={40} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={styles.gridActionLabel}>Walk-in Leads</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* NeoDove Floating Action Button (+) */}
      <FloatingDialpadFab bottomOffset={78} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#0F9D58',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F9D58',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  brandTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  roleSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  branchSubText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 20,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  keypadTopBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  scrollContentWide: {
    paddingVertical: 36,
  },

  // =========================================================================
  // LAUNCHPAD BOX (IMAGE 1)
  // =========================================================================
  launchpadBox: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  launchpadBoxWide: {
    maxWidth: 540,
    paddingHorizontal: 26,
    paddingVertical: 30,
  },

  welcomeHeroText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.3,
  },

  // Start Calling Hero Button (Vibrant Emerald Green matching app branding)
  heroStartCallingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F9D58',
    paddingVertical: 11,
    paddingHorizontal: 32,
    borderRadius: 24,
    marginBottom: 24,
    shadowColor: '#0F9D58',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  heroStartCallingText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // 2x3 Action Grid
  actionGridContainer: {
    width: '100%',
    gap: 14,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 14,
    width: '100%',
  },
  gridActionCard: {
    flex: 1,
    height: 125,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    position: 'relative',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  gridActionLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 10,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  cardMiniBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  cardMiniBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
});
