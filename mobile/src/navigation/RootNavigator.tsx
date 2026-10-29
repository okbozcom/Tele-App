import React, { useEffect } from 'react';
import { View, Platform, useWindowDimensions } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LayoutGrid,
  Users,
  CalendarClock,
  SlidersHorizontal,
  User as UserIcon,
  Megaphone,
} from 'lucide-react-native';

import { useAuthStore } from '../store/authStore';
import { useCampaignStore } from '../store/campaignStore';
import { useSidebarStore } from '../store/sidebarStore';
import { SplashScreen } from '../screens/SplashScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MyLeadsScreen } from '../screens/MyLeadsScreen';
import { FollowUpsScreen } from '../screens/FollowUpsScreen';
import { DashboardScreen } from '../screens/DashboardScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { TeamScreen } from '../screens/TeamScreen';
import { CampaignsScreen } from '../screens/CampaignsScreen';
import { CampaignSelectScreen } from '../screens/CampaignSelectScreen';
import { UploadLeadsScreen } from '../screens/UploadLeadsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { DiagnosticsScreen } from '../screens/DiagnosticsScreen';
import { RetryRulesScreen } from '../screens/RetryRulesScreen';
import { LeadDetailScreen } from '../screens/LeadDetailScreen';
import { DisposeScreen } from '../screens/DisposeScreen';
import { AddWalkInLeadScreen } from '../screens/AddWalkInLeadScreen';
import { CallHistoryScreen } from '../screens/CallHistoryScreen';
import { AgentReportScreen } from '../screens/AgentReportScreen';
import { CampaignDetailScreen } from '../screens/CampaignDetailScreen';
import { LaunchpadScreen } from '../screens/LaunchpadScreen';
import { RootStackParamList } from '../types';
import { notificationService } from '../services/notification.service';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { DirectDialpadModal } from '../components/DirectDialpadModal';
import { callSession } from '../services/callSession';
import { incomingCallSyncService } from '../services/incomingCallSync.service';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

const MainTabs: React.FC = () => {
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 860;
  const isManagerOrAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  // Compute safe bottom padding for Android navigation gestures & iOS home bar
  const isAndroid = Platform.OS === 'android';
  const bottomPadding = Math.max(insets.bottom, isAndroid ? 12 : 8);
  const tabHeight = (isAndroid ? 54 : 50) + bottomPadding;

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: isWide
          ? { display: 'none', height: 0 }
          : {
              backgroundColor: '#FFFFFF',
              borderTopColor: '#E5E7EB',
              borderTopWidth: 1,
              height: tabHeight,
              paddingTop: 8,
              paddingBottom: bottomPadding,
              elevation: 2,
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: -1 },
              shadowOpacity: 0.04,
              shadowRadius: 3,
            },
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
        },
        tabBarActiveTintColor: '#0F9D58',
        tabBarInactiveTintColor: '#9CA3AF',
      }}
    >
      <Tab.Screen
        name="Home"
        component={LaunchpadScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <LayoutGrid size={24} color={color} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="CampaignsHub"
        component={CampaignSelectScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Megaphone size={24} color={color} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="MyLeads"
        component={MyLeadsScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Users size={24} color={color} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="FollowUps"
        component={FollowUpsScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <CalendarClock size={24} color={color} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />

      {isManagerOrAdmin ? (
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <SlidersHorizontal size={24} color={color} strokeWidth={focused ? 2.5 : 2} />
            ),
          }}
        />
      ) : null}

      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <UserIcon size={24} color={color} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const linking = {
  prefixes: [
    'https://hitalk.in',
    'http://hitalk.in',
    'https://www.hitalk.in',
    'http://www.hitalk.in',
    'https://call.okboz.co.in',
    'http://call.okboz.co.in',
    'http://localhost:8081',
    'http://localhost:19006',
    'hitalk://',
    '/',
  ],
  config: {
    screens: {
      Login: 'login',
      CallingDesk: 'calling-desk',
      CampaignSelect: 'campaign-select',
      MyLeads: 'leads',
      FollowUps: 'follow-ups',
      CallHistory: 'call-history',
      AgentReports: 'reports',
      Team: 'team',
      Campaigns: 'campaigns',
      CampaignDetail: 'campaigns-detail',
      UploadLeads: 'upload-leads',
      Settings: 'settings',
      Diagnostics: 'diagnostics',
      RetryRules: 'retry-rules',
      AddWalkInLead: 'add-walk-in',
      LeadDetail: 'lead-detail',
      Dispose: 'dispose',
      Dashboard: 'dashboard',
      Launchpad: 'launchpad',
      Main: {
        screens: {
          Home: 'home',
          CampaignsHub: 'campaigns-hub',
          MyLeads: 'queue-leads',
          FollowUps: 'my-follow-ups',
          Dashboard: 'team-dashboard',
          Profile: 'my-profile',
        },
      },
    },
  },
};

export const RootNavigator: React.FC = () => {
  const { token, isLoading, restoreSession } = useAuthStore();

  useEffect(() => {
    restoreSession();
    useCampaignStore.getState().restoreCampaignSelection();
    notificationService.requestPermissions();
    callSession.init();
    incomingCallSyncService.syncIncomingCalls().catch(() => {});
  }, [restoreSession]);

  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <ErrorBoundary fallbackMessage="The app encountered an unexpected error. Please tap Retry to reload.">
      <NavigationContainer
        ref={navigationRef}
        linking={linking}
        onStateChange={() => {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            const route = navigationRef.getCurrentRoute();
            if (route?.name && route.name !== 'Login') {
              useSidebarStore.getState().setCurrentRoute(route.name);
              try {
                window.localStorage.setItem('hi_talk_last_screen', route.name);
                if (route.params) {
                  window.localStorage.setItem('hi_talk_last_params', JSON.stringify(route.params));
                } else {
                  window.localStorage.removeItem('hi_talk_last_params');
                }
              } catch {}
            }
          }
        }}
        onReady={() => {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            const pathname = window.location.pathname.replace(/\/$/, '');
            const isRoot = !pathname || pathname === '' || pathname === '/index.html';
            if (isRoot) {
              const savedScreen = window.localStorage.getItem('hi_talk_last_screen');
              const savedParamsStr = window.localStorage.getItem('hi_talk_last_params');
              if (savedScreen && savedScreen !== 'Home' && savedScreen !== 'Login' && savedScreen !== 'Launchpad') {
                let savedParams = undefined;
                try {
                  if (savedParamsStr) savedParams = JSON.parse(savedParamsStr);
                } catch {}
                setTimeout(() => {
                  try {
                    navigationRef.navigate(savedScreen as any, savedParams);
                  } catch (e) {
                    console.warn('Failed restoring web screen:', e);
                  }
                }, 50);
              }
            }
          }
        }}
      >
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!token ? (
            <Stack.Screen name="Login" component={LoginScreen} />
          ) : (
            <>
              <Stack.Screen name="Main" component={MainTabs} />
              <Stack.Screen name="Launchpad" component={LaunchpadScreen} />
              <Stack.Screen name="CallingDesk" component={HomeScreen} />
              <Stack.Screen name="CampaignSelect" component={CampaignSelectScreen} />
              <Stack.Screen name="Home" component={LaunchpadScreen} />
              <Stack.Screen name="MyLeads" component={MyLeadsScreen} />
              <Stack.Screen name="FollowUps" component={FollowUpsScreen} />
              <Stack.Screen name="CallHistory" component={CallHistoryScreen} />
              <Stack.Screen name="AgentReports" component={AgentReportScreen} />
              <Stack.Screen name="Team" component={TeamScreen} />
              <Stack.Screen name="Campaigns" component={CampaignsScreen} />
              <Stack.Screen name="CampaignDetail" component={CampaignDetailScreen} />
              <Stack.Screen name="UploadLeads" component={UploadLeadsScreen} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="Tasks" component={TasksScreen} />
              <Stack.Screen name="Diagnostics" component={DiagnosticsScreen} />
              <Stack.Screen name="RetryRules" component={RetryRulesScreen} />
              <Stack.Screen name="Profile" component={ProfileScreen} />
              <Stack.Screen name="LeadDetail" component={LeadDetailScreen} />
              <Stack.Screen name="Dispose" component={DisposeScreen} />
              <Stack.Screen name="Dashboard" component={DashboardScreen} />
              <Stack.Screen name="AddWalkInLead" component={AddWalkInLeadScreen} />
            </>
          )}
        </Stack.Navigator>
        {token ? <DirectDialpadModal /> : null}
      </NavigationContainer>
    </ErrorBoundary>
  );
};
