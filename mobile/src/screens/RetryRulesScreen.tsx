import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RotateCw,
  Save,
  ShieldAlert,
  Plus,
  Minus,
  Clock,
  CheckCircle2,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

import { useAuthStore } from '../store/authStore';
import { fetchRetryRules, updateRetryRule, updateRetryRulesBulk } from '../api/leadApi';
import { RetryRule } from '../types';
import { colors } from '../theme';
import { CrmShell } from '../components/CrmShell';

interface DisplayRetryItem {
  id: string;
  reasonKey: string;
  title: string;
  subtitle: string;
  firstRetryMin: string;
  secondRetryMin: string;
  enabled: boolean;
}

const DEFAULT_RULES: DisplayRetryItem[] = [
  {
    id: 'rule-1',
    reasonKey: 'BUSY',
    title: 'Customer Line Busy / Call Waiting',
    subtitle: 'Auto-redials after a short rest period',
    firstRetryMin: '15',
    secondRetryMin: '720',
    enabled: true,
  },
  {
    id: 'rule-2',
    reasonKey: 'CALL_NOT_COMPLETED',
    title: 'Call Dropped / Disconnected Midway',
    subtitle: 'Re-queues customer for an immediate agent callback',
    firstRetryMin: '15',
    secondRetryMin: '1440',
    enabled: true,
  },
  {
    id: 'rule-3',
    reasonKey: 'DID_NOT_PICK',
    title: 'Customer Rings Out / Did Not Pick Up',
    subtitle: 'Schedules automated follow-up attempts across shifts',
    firstRetryMin: '60',
    secondRetryMin: '1440',
    enabled: true,
  },
  {
    id: 'rule-4',
    reasonKey: 'INCOMING_NOT_AVAILABLE',
    title: 'Incoming Calls Barred / Switched Off',
    subtitle: 'Snoozes retries until customer phone re-connects',
    firstRetryMin: '120',
    secondRetryMin: '1440',
    enabled: false,
  },
  {
    id: 'rule-5',
    reasonKey: 'INVALID_NUMBER',
    title: 'Invalid Number / Disconnected Service',
    subtitle: 'Disabled: Automatically closes invalid leads',
    firstRetryMin: '60',
    secondRetryMin: '1440',
    enabled: false,
  },
];

const formatMinutesFriendly = (minsStr: string) => {
  const m = parseInt(minsStr, 10) || 0;
  if (m < 60) return `${m} mins`;
  if (m < 1440) {
    const h = (m / 60).toFixed(1).replace('.0', '');
    return `${h} hrs (${m}m)`;
  }
  const d = (m / 1440).toFixed(1).replace('.0', '');
  return `${d} days (${m}m)`;
};

const stepMinutes = (curStr: string, delta: number) => {
  const cur = parseInt(curStr, 10) || 15;
  let next = cur;
  if (delta > 0) {
    if (cur < 60) next = cur + 15;
    else if (cur < 1440) next = cur + 60;
    else next = cur + 1440;
  } else {
    if (cur <= 15) next = Math.max(5, cur - 5);
    else if (cur <= 60) next = cur - 15;
    else if (cur <= 1440) next = cur - 60;
    else next = Math.max(1440, cur - 1440);
  }
  return String(next);
};

export const RetryRulesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAgent = user?.role === 'AGENT';

  const { data: retryRulesData, isLoading } = useQuery({
    queryKey: ['adminRetryRules'],
    queryFn: fetchRetryRules,
    enabled: !isAgent,
  });
  const backendRules: RetryRule[] = retryRulesData?.retryRules || [];

  // Local state for interactive editing
  const [rules, setRules] = useState<DisplayRetryItem[]>(DEFAULT_RULES);

  // Sync from backend when loaded
  React.useEffect(() => {
    if (backendRules.length > 0) {
      setRules((prev) => {
        return prev.map((item) => {
          const matched = backendRules.find((r) => r.reason === item.reasonKey);
          if (matched) {
            const step1 = matched.steps?.[0]?.delayMinutes ? String(matched.steps[0].delayMinutes) : item.firstRetryMin;
            const step2 = matched.steps?.[1]?.delayMinutes ? String(matched.steps[1].delayMinutes) : item.secondRetryMin;
            return {
              ...item,
              id: matched._id,
              enabled: matched.enabled,
              firstRetryMin: step1,
              secondRetryMin: step2,
              subtitle: matched.enabled ? 'Automatic retry scheduled' : 'No retry configured',
            };
          }
          return item;
        });
      });
    }
  }, [backendRules]);

  // Mutation to update rules in bulk with strict range validation
  const updateMutation = useMutation({
    mutationFn: async (updatedList: DisplayRetryItem[]) => {
      const payload = updatedList.map((item) => {
        const step1 = parseInt(item.firstRetryMin, 10);
        const step2 = parseInt(item.secondRetryMin, 10);
        if (isNaN(step1) || step1 < 1 || step1 > 43200) {
          throw new Error(`Invalid first retry delay for "${item.title}". Must be between 1 and 43,200 minutes.`);
        }
        if (isNaN(step2) || step2 < 1 || step2 > 43200) {
          throw new Error(`Invalid second retry delay for "${item.title}". Must be between 1 and 43,200 minutes.`);
        }
        return {
          reason: item.reasonKey,
          enabled: item.enabled,
          steps: [
            { delayMinutes: step1 },
            { delayMinutes: step2 },
          ],
        };
      });

      return await updateRetryRulesBulk(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminRetryRules'] });
      Alert.alert('Saved', 'Retry rules schedule saved successfully to the database.');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Failed to save rules';
      Alert.alert('Save Failed', msg);
    },
  });

  const handleToggle = (index: number) => {
    setRules((prev) => {
      const next = [...prev];
      const cur = next[index];
      const newEnabled = !cur.enabled;
      next[index] = {
        ...cur,
        enabled: newEnabled,
        subtitle: newEnabled ? 'Automatic retry scheduled' : 'No retry configured',
      };
      return next;
    });
  };

  const handleUpdateStep = (index: number, field: 'first' | 'second', val: string) => {
    setRules((prev) => {
      const next = [...prev];
      if (field === 'first') {
        next[index].firstRetryMin = val;
      } else {
        next[index].secondRetryMin = val;
      }
      return next;
    });
  };

  if (isAgent) {
    return (
      <CrmShell
        title="Retry Rules"
        headerIcon={<RotateCw size={15} color={colors.textSecondary} />}
        breadcrumb="Workspace"
      >
        <View style={styles.restrictedContainer}>
          <View style={styles.restrictedIconBox}>
            <ShieldAlert size={40} color="#E11D48" />
          </View>
          <Text style={styles.restrictedTitle}>Calling Workspace Only</Text>
          <Text style={styles.restrictedSubtitle}>
            Cadence & retry intervals are configured centrally by Administrators. Agents are restricted from modifying retry policies.
          </Text>
          <TouchableOpacity
            style={styles.restrictedBackBtn}
            onPress={() => navigation.navigate('Home')}
            activeOpacity={0.8}
          >
            <Text style={styles.restrictedBackBtnText}>Return to Calling Queue</Text>
          </TouchableOpacity>
        </View>
      </CrmShell>
    );
  }

  return (
    <CrmShell
      title="Retry Rules"
      headerIcon={<RotateCw size={15} color={colors.textSecondary} />}
      breadcrumb="Workspace"
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner Section */}
        <View style={styles.bannerRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.bannerTitle}>A smarter next attempt</Text>
            <Text style={styles.bannerSubtitle}>
              Schedule another call when the first doesn't connect
            </Text>
            {backendRules.length === 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 4 }}>
                <Clock size={12} color="#D97706" />
                <Text style={{ fontSize: 11, color: '#D97706', fontWeight: '600' }}>
                  Default template loaded. Click 'Save rules' to sync with database.
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 4 }}>
                <CheckCircle2 size={12} color="#16A34A" />
                <Text style={{ fontSize: 11, color: '#16A34A', fontWeight: '600' }}>
                  Synced with server database (Calling hours 09:00 - 20:00 IST compliant)
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.saveRulesBtn}
            onPress={() => updateMutation.mutate(rules)}
            disabled={updateMutation.isPending}
            activeOpacity={0.8}
          >
            {updateMutation.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Save size={14} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.saveRulesText}>Save rules</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Plain Language Rule Cards List */}
        <View style={{ gap: 14 }}>
          {rules.map((item, index) => {
            return (
              <View
                key={item.id || item.reasonKey}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 14,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: item.enabled ? '#E2E8F0' : '#F1F5F9',
                  shadowColor: '#0F172A',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: item.enabled ? 0.05 : 0.02,
                  shadowRadius: 3,
                  elevation: item.enabled ? 2 : 1,
                  opacity: item.enabled ? 1 : 0.75,
                }}
              >
                {/* Header Row: Title, Subtitle & Switch */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 12 }}>
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        backgroundColor: item.enabled ? '#ECFDF5' : '#F1F5F9',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <RotateCw size={18} color={item.enabled ? '#10B981' : '#94A3B8'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A' }}>
                        {item.title}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                        {item.subtitle}
                      </Text>
                    </View>
                  </View>

                  <Switch
                    value={item.enabled}
                    onValueChange={() => handleToggle(index)}
                    trackColor={{ false: '#E2E8F0', true: '#10B981' }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {item.enabled ? (
                  <View
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: '#F1F5F9',
                      paddingTop: 14,
                      gap: 12,
                    }}
                  >
                    {/* Stepper 1: First Retry */}
                    <View
                      style={{
                        backgroundColor: '#F8FAFC',
                        borderRadius: 10,
                        padding: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                      }}
                    >
                      <View>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>
                          1st Retry Attempt
                        </Text>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 2 }}>
                          {formatMinutesFriendly(item.firstRetryMin)}
                        </Text>
                      </View>

                      {/* Stepper Controls */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TouchableOpacity
                          onPress={() => {
                            const nextVal = stepMinutes(item.firstRetryMin, -1);
                            handleUpdateStep(index, 'first', nextVal);
                          }}
                          activeOpacity={0.7}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            backgroundColor: '#FFFFFF',
                            borderWidth: 1,
                            borderColor: '#CBD5E1',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Minus size={16} color="#334155" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => {
                            const nextVal = stepMinutes(item.firstRetryMin, 1);
                            handleUpdateStep(index, 'first', nextVal);
                          }}
                          activeOpacity={0.7}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            backgroundColor: '#FFFFFF',
                            borderWidth: 1,
                            borderColor: '#CBD5E1',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Plus size={16} color="#334155" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Stepper 2: Second Retry */}
                    <View
                      style={{
                        backgroundColor: '#F8FAFC',
                        borderRadius: 10,
                        padding: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                      }}
                    >
                      <View>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>
                          2nd Retry Attempt
                        </Text>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#4F46E5', marginTop: 2 }}>
                          {formatMinutesFriendly(item.secondRetryMin)}
                        </Text>
                      </View>

                      {/* Stepper Controls */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TouchableOpacity
                          onPress={() => {
                            const nextVal = stepMinutes(item.secondRetryMin, -1);
                            handleUpdateStep(index, 'second', nextVal);
                          }}
                          activeOpacity={0.7}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            backgroundColor: '#FFFFFF',
                            borderWidth: 1,
                            borderColor: '#CBD5E1',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Minus size={16} color="#334155" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => {
                            const nextVal = stepMinutes(item.secondRetryMin, 1);
                            handleUpdateStep(index, 'second', nextVal);
                          }}
                          activeOpacity={0.7}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            backgroundColor: '#FFFFFF',
                            borderWidth: 1,
                            borderColor: '#CBD5E1',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Plus size={16} color="#334155" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: '#F1F5F9',
                      paddingTop: 10,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>
                      Automated retry cadence paused for this outcome. Leads will remain open in queue without auto-scheduling.
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Bottom Save Rules Button */}
        <View style={{ marginTop: 20 }}>
          <TouchableOpacity
            onPress={() => updateMutation.mutate(rules)}
            disabled={updateMutation.isPending}
            activeOpacity={0.8}
            style={{
              height: 52,
              backgroundColor: '#10B981',
              borderRadius: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              shadowColor: '#10B981',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 4,
              elevation: 3,
            }}
          >
            {updateMutation.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Save size={18} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>
                  Save Retry Rules Cadence
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    paddingBottom: 110,
  },
  bannerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 12,
  },
  bannerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  bannerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  saveRulesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 8,
    gap: 6,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  saveRulesText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  rulesCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  thCell: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  tableDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tdCell: {
    justifyContent: 'center',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  outcomeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  outcomeSubtitle: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  retryInputWrap: {
    gap: 4,
  },
  retryInputLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#94A3B8',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    height: 32,
    width: 82,
    justifyContent: 'space-between',
  },
  inputBoxDisabled: {
    backgroundColor: '#F8FAFC',
    borderColor: '#F1F5F9',
  },
  numericInput: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    padding: 0,
    flex: 1,
  },
  numericInputDisabled: {
    color: '#CBD5E1',
  },
  minLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '500',
    marginLeft: 4,
  },
  restrictedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
    backgroundColor: '#F8FAFC',
  },
  restrictedIconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#FFE4E6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  restrictedTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  restrictedSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    maxWidth: 320,
  },
  restrictedBackBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#4F46E5',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  restrictedBackBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
