import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Dimensions,
  Platform,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  LayoutGrid,
  Users,
  CalendarCheck2,
  Megaphone,
  Upload,
  Settings2,
  RotateCw,
  User as UserIcon,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  X,
  History,
  PhoneCall,
  BarChart2,
  MapPin,
  Globe,
  Bell,
  Info,
  MessageSquare,
  UserCheck,
  ChartPie,
} from 'lucide-react-native';

import { useSafeTopPadding } from '../utils/safeArea';
import { setAppLanguage } from '../i18n';
import { useSidebarStore } from '../store/sidebarStore';
import { useAuthStore } from '../store/authStore';
import { useNotificationStore } from '../store/notificationStore';
import { useDialerStore } from '../store/dialerStore';
import { CrmAvatar } from './CrmAvatar';
import { storage } from '../utils/storage';
import { toast } from '../store/toastStore';
import { colors, borderRadius, shadows } from '../theme';

interface NavItemConfig {
  name: string;
  route: string;
  label: string;
  icon: any;
  badge?: string | number;
  action?: () => void;
}

export const CrmSidebarContent: React.FC<{
  collapsed?: boolean;
  onNavigate?: () => void;
  showCloseButton?: boolean;
}> = ({ collapsed = false, onNavigate, showCloseButton = false }) => {
  const navigation = useNavigation<any>();
  const { currentRoute, setCurrentRoute, toggleCollapse } = useSidebarStore();
  const { user } = useAuthStore();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const isManagerOrAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const handleNav = (route: string, action?: () => void) => {
    useSidebarStore.getState().closeDrawer();
    if (action) {
      onNavigate?.();
      setTimeout(() => {
        action();
      }, 100);
      return;
    }

    setCurrentRoute(route);
    onNavigate?.();

    setTimeout(() => {
      try {
        const TAB_ROUTES = ['Home', 'MyLeads', 'FollowUps', 'CampaignsHub', 'Profile'];

        if (TAB_ROUTES.includes(route)) {
          navigation.navigate('Main', { screen: route });
        } else {
          navigation.navigate(route);
        }
      } catch (err) {
        console.warn('Sidebar navigation warning:', err);
        try {
          navigation.navigate(route);
        } catch (innerErr) {
          console.error('Sidebar navigation error:', innerErr);
        }
      }
    }, 80);
  };

  const roleLabel = user?.branch
    ? `📍 ${user.branch} · ${user.role}`
    : user?.role === 'ADMIN'
    ? '🛡️ Admin (All Branches)'
    : user?.role === 'MANAGER'
    ? '🏢 Manager Role'
    : 'Agent Role';

  const WORKSPACE_ITEMS: NavItemConfig[] = [
    { name: 'Dashboard', route: 'Home', label: 'Dashboard', icon: LayoutGrid },
    { name: 'MyLeads', route: 'MyLeads', label: 'My Leads', icon: Users },
    { name: 'CallHistory', route: 'CallHistory', label: 'Call History', icon: History },
    { name: 'MyTasks', route: 'Tasks', label: 'My Tasks', icon: CalendarCheck2 },
    {
      name: 'CampaignAnalytics',
      route: 'CampaignDetail',
      label: 'Campaign Analytics',
      icon: ChartPie,
    },
    {
      name: 'MyReport',
      route: 'AgentReports',
      label: 'My Report',
      icon: BarChart2,
    },
    {
      name: 'GeoTagging',
      route: 'GeoTagging',
      label: 'Geo Tagging',
      icon: MapPin,
      action: () => Alert.alert('Geo Tagging', 'GPS location tracking active for field visits and call verification.'),
    },
  ];

  const MANAGEMENT_ITEMS: NavItemConfig[] = [
    {
      name: 'AgentReports',
      route: 'AgentReports',
      label: isManagerOrAdmin ? 'Agent Report' : 'My Call Report',
      icon: UserCheck,
    },
    ...(isManagerOrAdmin
      ? [
          { name: 'Settings', route: 'Settings', label: 'Settings', icon: Settings2 },
          { name: 'Campaigns', route: 'Campaigns', label: 'Campaigns', icon: Megaphone },
          { name: 'Team', route: 'Team', label: 'Team Members', icon: Users },
          { name: 'UploadLeads', route: 'UploadLeads', label: 'Upload Leads CSV', icon: Upload },
          { name: 'RetryRules', route: 'RetryRules', label: 'Retry Rules', icon: RotateCw },
        ]
      : [
          { name: 'CampaignSelect', route: 'CampaignSelect', label: 'Campaign Selector', icon: Megaphone },
        ]),
  ];

  const SECONDARY_ITEMS: NavItemConfig[] = [
    { name: 'Profile', route: 'Profile', label: 'Profile', icon: UserIcon },
    {
      name: 'Language',
      route: 'Language',
      label: 'Change Language',
      icon: Globe,
      action: () =>
        Alert.alert('Language Settings', 'Select your preferred application language:', [
          {
            text: 'English',
            style: 'default',
            onPress: () => {
              setAppLanguage('en');
              toast.success('Language set to English');
            },
          },
          {
            text: 'தமிழ் (Tamil)',
            style: 'default',
            onPress: () => {
              setAppLanguage('ta');
              toast.success('Language set to தமிழ் (Tamil)');
            },
          },
          {
            text: 'हिन्दी (Hindi)',
            style: 'default',
            onPress: () => {
              setAppLanguage('hi');
              toast.success('Language set to हिन्दी (Hindi)');
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]),
    },
    {
      name: 'Notifications',
      route: 'Notifications',
      label: 'Notifications',
      icon: Bell,
      badge: unreadCount > 0 ? unreadCount : undefined,
      action: () => handleNav('FollowUps'),
    },
  ];

  const SUPPORT_ITEMS: NavItemConfig[] = [
    {
      name: 'AboutUs',
      route: 'About',
      label: 'About Us',
      icon: Info,
      action: () =>
        Alert.alert(
          'Hi Talk Tele Calling CRM',
          'Version 2.4.1\n\nHigh Performance Cloud Telephony & Automated Lead Management CRM.',
        ),
    },
    {
      name: 'Feedback',
      route: 'Feedback',
      label: 'Feedback',
      icon: MessageSquare,
      action: () =>
        Alert.alert(
          'Send Feedback',
          'Have a suggestion or encounter an issue? Your feedback helps us improve Hi Talk.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Submit Feedback', onPress: () => Alert.alert('Thank You!', 'Your feedback has been logged.') },
          ],
        ),
    },
  ];

  return (
    <View style={[styles.sidebarContainer, collapsed ? styles.sidebarCollapsed : styles.sidebarExpanded]}>
      {/* Brand Header */}
      <View style={[styles.brandWrap, collapsed && styles.brandWrapCollapsed]}>
        <TouchableOpacity
          style={styles.brandLeft}
          onPress={() => handleNav('Home')}
          activeOpacity={0.8}
        >
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>HT</Text>
          </View>
          {!collapsed && (
            <View style={styles.brandTextWrap}>
              <Text style={styles.brandTitle}>
                <Text style={{ fontWeight: '900', color: '#0F9D58', fontSize: 18, letterSpacing: 0.5 }}>Hi </Text>
                <Text style={{ fontWeight: '900', color: '#1F2937', fontSize: 18, letterSpacing: 0.5 }}>Talk</Text>
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {showCloseButton ? (
          <TouchableOpacity
            style={styles.iconToggleBtn}
            onPress={onNavigate}
            activeOpacity={0.7}
          >
            <X size={18} color="#64748B" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.iconToggleBtn}
            onPress={toggleCollapse}
            activeOpacity={0.7}
            accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} color="#64748B" />
            ) : (
              <PanelLeftClose size={18} color="#64748B" />
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Nav List */}
      <ScrollView
        style={styles.navScroll}
        contentContainerStyle={styles.navScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Section 1: Workspace */}
        {!collapsed && <Text style={styles.sectionHeading}>WORKSPACE</Text>}
        {WORKSPACE_ITEMS.map((item) => {
          const isActive = currentRoute === item.route;
          const Icon = item.icon;
          const badgeCount = item.route === 'FollowUps' ? (unreadCount > 0 ? unreadCount : undefined) : item.badge;

          return (
            <TouchableOpacity
              key={item.route}
              style={[
                styles.navBtn,
                collapsed && styles.navBtnCollapsed,
                isActive && styles.navBtnActive,
              ]}
              onPress={() => handleNav(item.route, item.action)}
              activeOpacity={0.75}
            >
              <Icon
                size={18}
                color={isActive ? '#0F9D58' : '#64748B'}
                strokeWidth={isActive ? 2.5 : 2}
              />
              {!collapsed && (
                <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                  {item.label}
                </Text>
              )}
              {!collapsed && badgeCount ? (
                <View style={[styles.navBadge, item.route === 'FollowUps' && styles.navBadgeAlert]}>
                  <Text style={[styles.navBadgeText, item.route === 'FollowUps' && styles.navBadgeAlertText]}>
                    {badgeCount}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}

        {/* Section 2: Management & Configuration */}
        <View style={styles.divider} />
        {!collapsed && <Text style={styles.sectionHeading}>MANAGEMENT</Text>}
        {MANAGEMENT_ITEMS.map((item) => {
          const isActive = currentRoute === item.route;
          const Icon = item.icon;

          return (
            <TouchableOpacity
              key={item.name}
              style={[
                styles.navBtn,
                collapsed && styles.navBtnCollapsed,
                isActive && styles.navBtnActive,
              ]}
              onPress={() => handleNav(item.route, item.action)}
              activeOpacity={0.75}
            >
              <Icon
                size={18}
                color={isActive ? '#0F9D58' : '#64748B'}
                strokeWidth={isActive ? 2.5 : 2}
              />
              {!collapsed && (
                <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                  {item.label}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Section 3: Account & Settings */}
        <View style={styles.divider} />
        {!collapsed && <Text style={styles.sectionHeading}>PREFERENCES</Text>}
        {SECONDARY_ITEMS.map((item) => {
          const isActive = currentRoute === item.route;
          const Icon = item.icon;

          return (
            <TouchableOpacity
              key={item.name}
              style={[
                styles.navBtn,
                collapsed && styles.navBtnCollapsed,
                isActive && styles.navBtnActive,
              ]}
              onPress={() => handleNav(item.route, item.action)}
              activeOpacity={0.75}
            >
              <Icon
                size={18}
                color={isActive ? '#0F9D58' : '#64748B'}
                strokeWidth={isActive ? 2.5 : 2}
              />
              {!collapsed && (
                <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                  {item.label}
                </Text>
              )}
              {!collapsed && item.badge ? (
                <View style={[styles.navBadge, styles.navBadgeAlert]}>
                  <Text style={[styles.navBadgeText, styles.navBadgeAlertText]}>
                    {item.badge}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}

        {/* Section 3: App Info & Feedback */}
        <View style={styles.divider} />
        {SUPPORT_ITEMS.map((item) => {
          const Icon = item.icon;

          return (
            <TouchableOpacity
              key={item.name}
              style={[
                styles.navBtn,
                collapsed && styles.navBtnCollapsed,
              ]}
              onPress={() => handleNav(item.route, item.action)}
              activeOpacity={0.75}
            >
              <Icon
                size={18}
                color="#64748B"
                strokeWidth={2}
              />
              {!collapsed && (
                <Text style={styles.navLabel}>
                  {item.label}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Sidebar Bottom: Account Card */}
      <View style={[styles.sidebarBottom, collapsed && styles.sidebarBottomCollapsed]}>
        <TouchableOpacity
          style={[styles.accountBtn, collapsed && styles.accountBtnCollapsed]}
          onPress={() => handleNav('Profile')}
          activeOpacity={0.8}
        >
          <View style={styles.avatarWrap}>
            <CrmAvatar name={user?.name || 'Agent'} size={collapsed ? 32 : 36} />
            <View style={styles.statusDot} />
          </View>
          {!collapsed && (
            <View style={styles.accountTextWrap}>
              <Text style={styles.accountName} numberOfLines={1}>
                {user?.name || 'Agent User'}
              </Text>
              <Text style={styles.accountRole} numberOfLines={1}>
                {roleLabel}
              </Text>
            </View>
          )}
          {!collapsed && <ChevronRight size={16} color={colors.textQuiet} />}
        </TouchableOpacity>
      </View>
    </View>
  );
};

export const CrmSidebarModalDrawer: React.FC = () => {
  const { isOpenMobileDrawer, closeDrawer } = useSidebarStore();
  const { width } = useWindowDimensions();
  const isWide = width >= 860;
  const safeTopPadding = useSafeTopPadding(false);

  // On wide screens (desktop web, tablets >= 860px), the sidebar is ALWAYS
  // rendered persistently on the left. The mobile modal drawer must NEVER open or dim the desktop screen.
  if (isWide || !isOpenMobileDrawer) {
    return null;
  }

  return (
    <Modal
      visible={isOpenMobileDrawer}
      transparent
      animationType="fade"
      onRequestClose={closeDrawer}
    >
      <View style={styles.drawerOverlay}>
        <TouchableOpacity
          style={styles.drawerBackdrop}
          activeOpacity={1}
          onPress={closeDrawer}
        />
        <View style={[styles.drawerSheet, { paddingTop: safeTopPadding }]}>
          <CrmSidebarContent collapsed={false} onNavigate={closeDrawer} showCloseButton />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sidebarContainer: {
    backgroundColor: '#FFFFFF',
    borderRightWidth: 0,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    shadowColor: '#0F172A',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  sidebarExpanded: {
    width: 250,
  },
  sidebarCollapsed: {
    width: 68,
  },
  brandWrap: {
    height: 64,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  brandWrapCollapsed: {
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  brandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  brandMarkText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  brandTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandTitle: {
    fontSize: 16,
    letterSpacing: -0.3,
  },
  iconToggleBtn: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navScroll: {
    flex: 1,
  },
  navScrollContent: {
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  sectionHeading: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.8,
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 10,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
    marginHorizontal: 8,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9.5,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 3,
    gap: 10,
  },
  navBtnCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
    gap: 0,
  },
  navBtnActive: {
    backgroundColor: '#ECFDF5',
  },
  navLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    flex: 1,
  },
  navLabelActive: {
    color: '#059669',
    fontWeight: '700',
  },
  navBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: borderRadius.full,
  },
  navBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  navBadgeAlert: {
    backgroundColor: '#FEE2E2',
  },
  navBadgeAlertText: {
    color: '#DC2626',
    fontWeight: '800',
  },
  sidebarBottom: {
    padding: 12,
    backgroundColor: '#FFFFFF',
  },
  sidebarBottomCollapsed: {
    padding: 8,
    alignItems: 'center',
  },
  accountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  accountBtnCollapsed: {
    justifyContent: 'center',
    gap: 0,
    padding: 4,
  },
  avatarWrap: {
    position: 'relative',
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: borderRadius.full,
    backgroundColor: '#10B981',
    position: 'absolute',
    bottom: -1,
    right: -1,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  accountTextWrap: {
    flex: 1,
  },
  accountName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  accountRole: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  drawerBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  drawerSheet: {
    width: 270,
    height: '100%',
    backgroundColor: '#FFFFFF',
    ...shadows.elevated,
  },
});
