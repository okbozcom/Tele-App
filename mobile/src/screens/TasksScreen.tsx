import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Circle,
  Calendar,
  Search,
  X,
  Phone,
  MessageCircle,
  Clock,
  UserCheck,
  Send,
  Plus,
} from 'lucide-react-native';

import { CrmShell } from '../components/CrmShell';
import { fetchTasks, updateTaskStatus } from '../api/taskApi';
import { Task } from '../types';
import { colors, shadows, borderRadius, spacing } from '../theme';
import { formatDisplayPhone, getDialerTelUrl, getWhatsAppUrl } from '../utils/phoneUtils';
import { Linking } from 'react-native';
import { toast } from '../store/toastStore';

export const TasksScreen: React.FC = () => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'assigned' | 'reported'>('assigned');
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'COMPLETED' | 'ALL'>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: tasks = [], isLoading, isRefetching, refetch } = useQuery<Task[]>({
    queryKey: ['tasks', tab, statusFilter],
    queryFn: () => fetchTasks(tab, statusFilter === 'ALL' ? undefined : statusFilter),
    refetchOnWindowFocus: true,
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ taskId, newStatus }: { taskId: string; newStatus: 'PENDING' | 'COMPLETED' }) => {
      return updateTaskStatus(taskId, newStatus);
    },
    onSuccess: (_, { newStatus }) => {
      toast.success(newStatus === 'COMPLETED' ? 'Task marked complete' : 'Task marked pending');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err: any) => {
      Alert.alert('Error', err?.response?.data?.message || 'Could not update task status');
    },
  });

  const handleToggleComplete = (task: Task) => {
    const newStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    toggleStatusMutation.mutate({ taskId: task._id, newStatus });
  };

  const handleCallLead = (phone?: string) => {
    if (!phone) return;
    Linking.openURL(getDialerTelUrl(phone)).catch(() => {
      Alert.alert('Error', 'Unable to initiate call on this device');
    });
  };

  const handleWhatsAppLead = (phone?: string) => {
    if (!phone) return;
    Linking.openURL(getWhatsAppUrl(phone)).catch(() => {
      Alert.alert('Error', 'Unable to open WhatsApp on this device');
    });
  };

  const filteredTasks = tasks.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      t.title.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q)) ||
      (t.leadName && t.leadName.toLowerCase().includes(q)) ||
      (t.leadPhone && t.leadPhone.includes(q))
    );
  });

  const renderTaskItem = ({ item }: { item: Task }) => {
    const isCompleted = item.status === 'COMPLETED';
    const isHigh = item.priority === 'HIGH';
    const isMedium = item.priority === 'MEDIUM';

    const dueDateObj = new Date(item.dueDate);
    const isValidDate = !isNaN(dueDateObj.getTime());
    const dueDateStr = isValidDate
      ? `${dueDateObj.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${dueDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : 'No due date';

    return (
      <View style={[styles.card, isCompleted && styles.cardCompleted]}>
        <View style={styles.cardHeader}>
          <TouchableOpacity
            style={styles.checkBtn}
            onPress={() => handleToggleComplete(item)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isCompleted ? (
              <CheckCircle2 size={22} color={colors.primary} />
            ) : (
              <Circle size={22} color="#94A3B8" />
            )}
          </TouchableOpacity>

          <View style={styles.cardHeaderContent}>
            <Text style={[styles.taskTitle, isCompleted && styles.taskTitleCompleted]}>
              {item.title}
            </Text>

            {item.description ? (
              <Text style={styles.taskDescription} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
          </View>

          {/* Priority Pill */}
          <View
            style={[
              styles.priorityBadge,
              isHigh
                ? styles.priorityHigh
                : isMedium
                ? styles.priorityMedium
                : styles.priorityLow,
            ]}
          >
            <Text
              style={[
                styles.priorityText,
                isHigh
                  ? styles.priorityTextHigh
                  : isMedium
                  ? styles.priorityTextMedium
                  : styles.priorityTextLow,
              ]}
            >
              {item.priority}
            </Text>
          </View>
        </View>

        {/* Lead Connection Row */}
        {item.leadName ? (
          <View style={styles.leadRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.leadNameText}>
                👤 {item.leadName} {item.leadPhone ? `· ${formatDisplayPhone(item.leadPhone)}` : ''}
              </Text>
            </View>

            {item.leadPhone ? (
              <View style={styles.actionIcons}>
                <TouchableOpacity
                  style={[styles.smallIconBtn, { backgroundColor: '#ECFDF5' }]}
                  onPress={() => handleCallLead(item.leadPhone)}
                  activeOpacity={0.7}
                >
                  <Phone size={13} color="#059669" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.smallIconBtn, { backgroundColor: '#F0FDF4' }]}
                  onPress={() => handleWhatsAppLead(item.leadPhone)}
                  activeOpacity={0.7}
                >
                  <MessageCircle size={13} color="#15803D" />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Footer Meta Row */}
        <View style={styles.cardFooter}>
          <View style={styles.dueDateBadge}>
            <Clock size={12} color="#64748B" />
            <Text style={styles.dueDateText}>{dueDateStr}</Text>
          </View>

          <Text style={styles.authorText}>
            {tab === 'assigned'
              ? `Reported by ${item.reportedByName || 'Manager'}`
              : `Assigned to ${item.assignedToName || 'Agent'}`}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <CrmShell title="Tasks">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.screenTitle}>Tasks & Reminders</Text>
          <Text style={styles.screenSubtitle}>
            Coordinate customer follow-ups and deliverable deadlines
          </Text>
        </View>

        {/* Primary Tabs: Assigned to me vs Reported by me */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'assigned' && styles.tabBtnActive]}
            onPress={() => setTab('assigned')}
            activeOpacity={0.8}
          >
            <UserCheck size={16} color={tab === 'assigned' ? colors.primary : '#64748B'} />
            <Text style={[styles.tabText, tab === 'assigned' && styles.tabTextActive]}>
              Assigned to me
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, tab === 'reported' && styles.tabBtnActive]}
            onPress={() => setTab('reported')}
            activeOpacity={0.8}
          >
            <Send size={15} color={tab === 'reported' ? colors.primary : '#64748B'} />
            <Text style={[styles.tabText, tab === 'reported' && styles.tabTextActive]}>
              Reported by me
            </Text>
          </TouchableOpacity>
        </View>

        {/* Filter Pills & Search */}
        <View style={styles.filterSection}>
          <View style={styles.statusPills}>
            {(['PENDING', 'COMPLETED', 'ALL'] as const).map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.statusPill, statusFilter === s && styles.statusPillActive]}
                onPress={() => setStatusFilter(s)}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.statusPillText, statusFilter === s && styles.statusPillTextActive]}
                >
                  {s === 'ALL' ? 'All' : s === 'PENDING' ? 'Pending' : 'Completed'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.searchWrap}>
            <Search size={14} color="#94A3B8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search task or lead..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={14} color="#94A3B8" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* List View */}
        {isLoading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading tasks...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredTasks}
            keyExtractor={(item) => item._id}
            renderItem={renderTaskItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                tintColor={colors.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <CheckCircle2 size={44} color="#10B981" />
                <Text style={styles.emptyTitle}>You're All Caught Up!</Text>
                <Text style={styles.emptySubtitle}>
                  {statusFilter === 'COMPLETED'
                    ? 'No completed tasks found.'
                    : 'No pending tasks in this view right now.'}
                </Text>
              </View>
            }
          />
        )}
      </View>
    </CrmShell>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: '#F8FAFC',
  },
  header: {
    marginBottom: 14,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  screenSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: borderRadius.md,
    padding: 3,
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: borderRadius.sm,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    ...shadows.soft,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  tabTextActive: {
    color: colors.primary,
  },
  filterSection: {
    flexDirection: 'column',
    gap: 8,
    marginBottom: 12,
  },
  statusPills: {
    flexDirection: 'row',
    gap: 6,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: '#F1F5F9',
  },
  statusPillActive: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  statusPillTextActive: {
    color: '#059669',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: borderRadius.md,
    paddingHorizontal: 10,
    height: 38,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    padding: 0,
  },
  listContent: {
    paddingBottom: 24,
    gap: 10,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: borderRadius.md,
    padding: 14,
    ...shadows.soft,
  },
  cardCompleted: {
    backgroundColor: '#FAFAFA',
    opacity: 0.8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkBtn: {
    marginTop: 2,
  },
  cardHeaderContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 18,
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#94A3B8',
  },
  taskDescription: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 15,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  priorityHigh: {
    backgroundColor: '#FEE2E2',
  },
  priorityMedium: {
    backgroundColor: '#FEF3C7',
  },
  priorityLow: {
    backgroundColor: '#EFF6FF',
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '800',
  },
  priorityTextHigh: {
    color: '#DC2626',
  },
  priorityTextMedium: {
    color: '#D97706',
  },
  priorityTextLow: {
    color: '#2563EB',
  },
  leadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 10,
  },
  leadNameText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  actionIcons: {
    flexDirection: 'row',
    gap: 6,
  },
  smallIconBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  dueDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dueDateText: {
    fontSize: 11,
    color: '#64748B',
  },
  authorText: {
    fontSize: 10,
    color: '#94A3B8',
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
});
