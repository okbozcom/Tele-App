import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import {
  Bell,
  X,
  Phone,
  MessageCircle,
  Calendar,
  Clock,
  Flame,
  Sun,
  Snowflake,
  Search,
  ExternalLink,
  CheckCircle2,
  CheckCheck,
  Sparkles,
  BookmarkCheck,
} from 'lucide-react-native';

import { fetchMyLeads, fetchTaggedLeads, dismissTaggedLead } from '../api/leadApi';
import { callService } from '../services/call.service';
import { useAuthStore } from '../store/authStore';
import { useLeadHistoryStore } from '../store/leadHistoryStore';
import { useNotificationStore } from '../store/notificationStore';
import { Lead, Activity } from '../types';
import { WhatsAppTemplateModal } from './WhatsAppTemplateModal';
import { LeadQuickModal } from './LeadQuickModal';
import { TaggedLeadRecord } from './TagManagerModal';
import { toast } from '../store/toastStore';
import { storage } from '../utils/storage';
import { formatDisplayPhone } from '../utils/phoneUtils';
import { colors, borderRadius, shadows } from '../theme';

interface NotificationFollowUp {
  _id: string;
  name: string;
  phone: string;
  stage: string;
  tag?: string;
  temperature: 'HOT' | 'WARM' | 'COLD';
  timeLabel: string;
  isToday: boolean;
  isOverdue: boolean;
  isWithin24Hours: boolean;
  branch?: string;
  agentName?: string;
  attempts: number;
}

interface FollowUpNotificationsModalProps {
  visible: boolean;
  onClose: () => void;
}

export const FollowUpNotificationsModal: React.FC<FollowUpNotificationsModalProps> = ({
  visible,
  onClose,
}) => {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { markAsRead, markAllAsRead, isRead, unreadCount, setTotalRemindersCount } = useNotificationStore();
  const [activeFilter, setActiveFilter] = useState<'ALL' | '24H' | 'TODAY' | 'UPCOMING'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected lead for LeadQuickModal or WhatsAppTemplateModal
  const [quickLead, setQuickLead] = useState<Lead | null>(null);
  const [whatsAppTarget, setWhatsAppTarget] = useState<{ name: string; phone: string } | null>(null);

  const [assignedNotif, setAssignedNotif] = useState<{
    id: string;
    count: number;
    assignedBy: string;
    campaignName: string;
    timestamp: string;
  } | null>(null);

  const [taggedList, setTaggedList] = useState<TaggedLeadRecord[]>([]);

  useEffect(() => {
    if (!visible) return;
    const loadNotifications = async () => {
      try {
        const raw = await storage.getItem('tele_crm_assigned_lead_notifications');
        if (raw) {
          const list = JSON.parse(raw);
          const relevant = list.find((item: any) => {
            if (!item.targetAgentId || item.targetAgentId === 'null') return true;
            return (
              item.targetAgentId === user?._id ||
              item.targetAgentName?.toLowerCase() === user?.name?.toLowerCase() ||
              item.targetAgentId === user?.email
            );
          });
          setAssignedNotif(relevant || null);
        }
      } catch {}

      try {
        const serverTags = await fetchTaggedLeads();
        if (serverTags && serverTags.length > 0) {
          const mapped: TaggedLeadRecord[] = serverTags.map((st) => ({
            id: st._id,
            type: 'MANAGER_TAG',
            leadId: st.leadId,
            customerName: st.customerName,
            customerPhone: st.customerPhone,
            agentName: st.agentName,
            agentId: st.agentId,
            branch: st.branch || '',
            targetRole: st.targetRole,
            reason: st.reason,
            note: st.note,
            createdAt: st.createdAt,
          }));
          setTaggedList(mapped);
          await storage.setItem('tele_crm_tagged_lead_notifications', JSON.stringify(mapped));
        } else {
          const tagRaw = await storage.getItem('tele_crm_tagged_lead_notifications');
          if (tagRaw) {
            const list: TaggedLeadRecord[] = JSON.parse(tagRaw);
            const relevant = list.filter((item) => {
              if (!user?.role || user.role === 'ADMIN') return true;
              if (user.role === 'MANAGER') {
                if (item.targetRole === 'ADMIN') return false;
                if (item.branch && user.branch && item.branch.toLowerCase() !== user.branch.toLowerCase()) return false;
                return true;
              }
              return true;
            });
            setTaggedList(relevant);
          }
        }
      } catch {
        const tagRaw = await storage.getItem('tele_crm_tagged_lead_notifications');
        if (tagRaw) {
          const list: TaggedLeadRecord[] = JSON.parse(tagRaw);
          setTaggedList(list);
        }
      }
    };
    loadNotifications();
  }, [visible, user]);

  const handleDismissTag = async (id: string) => {
    try {
      const updated = taggedList.filter((item) => item.id !== id);
      setTaggedList(updated);
      try {
        await dismissTaggedLead(id);
      } catch {}
      const raw = await storage.getItem('tele_crm_tagged_lead_notifications');
      if (raw) {
        const full: TaggedLeadRecord[] = JSON.parse(raw);
        await storage.setItem(
          'tele_crm_tagged_lead_notifications',
          JSON.stringify(full.filter((item) => item.id !== id)),
        );
      }
    } catch {}
  };

  const handleCallTagged = async (item: TaggedLeadRecord) => {
    toast.info(`Dialing ${item.customerName}...`);
    try {
      await callService.startCall({ phone: item.customerPhone, name: item.customerName } as any);
    } catch {}
    const syntheticLead: Lead = {
      _id: item.leadId || `tagged-${item.id}`,
      campaignId: 'default-camp',
      name: item.customerName,
      phone: item.customerPhone,
      source: 'DIRECT_CALL',
      stage: 'Follow Up',
      tag: 'HOT',
      temperature: 'HOT',
      status: 'OPEN',
      attemptCount: 1,
      customProperties: {},
      createdAt: item.createdAt,
      updatedAt: new Date().toISOString(),
    };
    setQuickLead(syntheticLead);
  };

  const handleViewTagged = (item: TaggedLeadRecord) => {
    const syntheticLead: Lead = {
      _id: item.leadId || `tagged-${item.id}`,
      campaignId: 'default-camp',
      name: item.customerName,
      phone: item.customerPhone,
      source: 'DIRECT_CALL',
      stage: 'Follow Up',
      tag: 'HOT',
      temperature: 'HOT',
      status: 'OPEN',
      attemptCount: 1,
      customProperties: {},
      createdAt: item.createdAt,
      updatedAt: new Date().toISOString(),
    };
    setQuickLead(syntheticLead);
  };

  // Fetch real follow-ups from backend if available
  const { data: myLeadsData, refetch } = useQuery({
    queryKey: ['notificationsFollowUps'],
    queryFn: () => fetchMyLeads({ type: 'FOLLOW_UP', limit: 50 }),
    enabled: visible,
  });

  // Transform backend leads & local follow-up activities into Notification items
  const allReminders = useMemo<NotificationFollowUp[]>(() => {
    const list: NotificationFollowUp[] = [];
    const seenIds = new Set<string>();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000 - 1;

    // 1. From backend leads
    const realLeads = myLeadsData?.leads || [];
    for (const l of realLeads) {
      if (!l._id || seenIds.has(l._id)) continue;
      seenIds.add(l._id);

      let timeLabel = 'Callback scheduled';
      let isToday = false;
      let isOverdue = false;
      let isWithin24Hours = false;

      if (l.nextFollowUpAt) {
        const d = new Date(l.nextFollowUpAt);
        if (!isNaN(d.getTime())) {
          isToday = d.getTime() >= startOfToday && d.getTime() <= endOfToday;
          isOverdue = d.getTime() < now.getTime();
          isWithin24Hours = Math.abs(d.getTime() - now.getTime()) <= 24 * 60 * 60 * 1000;
          timeLabel = `${isToday ? 'Today' : d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
      }

      const temp = (l.temperature || (l.tag?.toUpperCase() === 'HOT' ? 'HOT' : l.tag?.toUpperCase() === 'COLD' ? 'COLD' : 'WARM')) as 'HOT' | 'WARM' | 'COLD';

      list.push({
        _id: l._id,
        name: l.name,
        phone: l.phone,
        stage: l.stage || 'Follow Up',
        tag: l.tag || undefined,
        temperature: temp,
        timeLabel,
        isToday,
        isOverdue,
        isWithin24Hours,
        branch: l.branch || user?.branch || undefined,
        agentName: typeof l.assignedTo === 'object' && l.assignedTo ? (l.assignedTo as any).name : user?.name,
        attempts: l.attemptCount || 1,
      });
    }

    // 2. From local activities that have followUpAt set
    const userActivities = useLeadHistoryStore.getState().getAllActivities(user?._id || user?.name);
    for (const act of userActivities) {
      if (act.followUpAt && act.leadId && !seenIds.has(act.leadId)) {
        seenIds.add(act.leadId);
        const d = new Date(act.followUpAt);
        if (!isNaN(d.getTime())) {
          const isToday = d.getTime() >= startOfToday && d.getTime() <= endOfToday;
          const isOverdue = d.getTime() < now.getTime();
          const isWithin24Hours = Math.abs(d.getTime() - now.getTime()) <= 24 * 60 * 60 * 1000;
          const timeLabel = `${isToday ? 'Today' : d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

          list.push({
            _id: act.leadId,
            name: act.customerName || 'Lead Contact',
            phone: act.phone || '',
            stage: act.stage || 'Follow Up',
            temperature: (act.temperature || 'WARM') as any,
            timeLabel,
            isToday,
            isOverdue,
            isWithin24Hours,
            branch: act.branch || user?.branch || undefined,
            agentName: user?.name,
            attempts: 1,
          });
        }
      }
    }

    return list;
  }, [myLeadsData, user]);

  // Sync reminder items with notification store
  useEffect(() => {
    if (visible) {
      setTotalRemindersCount(allReminders.length, allReminders.map((r) => r._id));
    }
  }, [visible, allReminders, setTotalRemindersCount]);

  // Filtered Reminders
  const filteredList = useMemo(() => {
    return allReminders.filter((item) => {
      if (activeFilter === '24H' && !item.isWithin24Hours) return false;
      if (activeFilter === 'TODAY' && !item.isToday) return false;
      if (activeFilter === 'UPCOMING' && item.isToday) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          item.name.toLowerCase().includes(q) ||
          item.phone.toLowerCase().includes(q) ||
          item.stage.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allReminders, activeFilter, searchQuery]);

  const handleCall = async (item: NotificationFollowUp) => {
    markAsRead(item._id);
    toast.info(`Initiating call to ${item.name}...`);
    try {
      await callService.startCall({ phone: item.phone, name: item.name } as any);
    } catch {
      // Fallback
    }

    // Open Quick Modal to record outcome
    openQuickModal(item);
  };

  const handleWhatsApp = (item: NotificationFollowUp) => {
    markAsRead(item._id);
    setWhatsAppTarget({ name: item.name, phone: item.phone });
  };

  const openQuickModal = (item: NotificationFollowUp) => {
    markAsRead(item._id);
    const syntheticLead: Lead = {
      _id: item._id,
      campaignId: 'default-camp',
      name: item.name,
      phone: item.phone,
      source: 'FOLLOW_UP',
      stage: item.stage,
      tag: item.temperature,
      temperature: item.temperature,
      status: 'OPEN',
      attemptCount: item.attempts,
      customProperties: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setQuickLead(syntheticLead);
  };

  const handleNavigateToAllFollowUps = () => {
    onClose();
    navigation.navigate('FollowUps');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Top Grab Bar / Handle */}
          <View style={styles.grabBar} />

          {/* Modal Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={styles.bellIconBox}>
                <Bell size={18} color="#2563EB" />
                {unreadCount > 0 && (
                  <View style={styles.headerBadge}>
                    <Text style={styles.headerBadgeText}>{unreadCount}</Text>
                  </View>
                )}
              </View>
              <View>
                <Text style={styles.headerTitle}>Reminders & Callbacks</Text>
                <Text style={styles.headerSubtitle}>
                  {unreadCount > 0
                    ? `${unreadCount} callback${unreadCount > 1 ? 's' : ''} require attention`
                    : 'All callbacks up to date'}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {unreadCount > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    markAllAsRead(allReminders.map((r) => r._id));
                    toast.success('All reminders marked as read', 'Badge Reset');
                  }}
                  style={styles.markAllBtn}
                  activeOpacity={0.7}
                >
                  <CheckCheck size={14} color="#2563EB" />
                  <Text style={styles.markAllBtnText}>Clear ({unreadCount})</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Search Bar */}
          <View style={styles.searchRow}>
            <Search size={14} color="#94A3B8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search reminder or phone..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={14} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter Pills: All | 24 Hours | Due Today | Upcoming */}
          <View style={styles.filterPillsRow}>
            <TouchableOpacity
              style={[styles.pillBtn, activeFilter === 'ALL' && styles.pillBtnActive]}
              onPress={() => setActiveFilter('ALL')}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.pillText, activeFilter === 'ALL' && styles.pillTextActive]}
              >
                All ({allReminders.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pillBtn, activeFilter === '24H' && styles.pillBtnActive]}
              onPress={() => setActiveFilter('24H')}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.pillText, activeFilter === '24H' && styles.pillTextActive]}
              >
                24h ({allReminders.filter((r) => r.isWithin24Hours).length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pillBtn, activeFilter === 'TODAY' && styles.pillBtnActive]}
              onPress={() => setActiveFilter('TODAY')}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.pillText, activeFilter === 'TODAY' && styles.pillTextActive]}
              >
                Due Today ({allReminders.filter((r) => r.isToday).length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pillBtn, activeFilter === 'UPCOMING' && styles.pillBtnActive]}
              onPress={() => setActiveFilter('UPCOMING')}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.pillText, activeFilter === 'UPCOMING' && styles.pillTextActive]}
              >
                Upcoming ({allReminders.filter((r) => !r.isToday).length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Notifications Scroll Area */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.scrollArea}
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {/* Tagged Leads Alert Cards (Management Escalations) */}
            {taggedList.length > 0 && (
              <View style={styles.taggedSection}>
                <View style={styles.taggedSectionHeader}>
                  <View style={styles.taggedSectionHeaderLeft}>
                    <BookmarkCheck size={16} color="#D97706" />
                    <Text style={styles.taggedSectionTitle}>
                      Tagged Leads ({taggedList.length})
                    </Text>
                  </View>
                  <Text style={styles.taggedSectionSubtitle}>
                    Priority management alerts
                  </Text>
                </View>

                {taggedList.map((tag) => (
                  <View key={tag.id} style={styles.taggedCard}>
                    <View style={styles.taggedCardHeader}>
                      <View style={styles.taggedReasonBadge}>
                        <Text style={styles.taggedReasonText}>🏷️ {tag.reason}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleDismissTag(tag.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <X size={15} color="#94A3B8" />
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.taggedCustomerName}>{tag.customerName}</Text>
                    <Text style={styles.taggedCustomerPhone}>
                      📞 {formatDisplayPhone(tag.customerPhone)}
                    </Text>

                    <View style={styles.taggedAgentRow}>
                      <Text style={styles.taggedAgentText}>
                        Tagged by <Text style={{ fontWeight: '700', color: '#1E293B' }}>{tag.agentName}</Text> • {tag.branch}
                      </Text>
                    </View>

                    {tag.note ? (
                      <View style={styles.taggedNoteBox}>
                        <Text style={styles.taggedNoteText}>"{tag.note}"</Text>
                      </View>
                    ) : null}

                    {/* Actions: Call Now & View Details */}
                    <View style={styles.taggedActionsRow}>
                      <TouchableOpacity
                        style={styles.taggedCallBtn}
                        onPress={() => handleCallTagged(tag)}
                        activeOpacity={0.8}
                      >
                        <Phone size={13} color="#FFFFFF" strokeWidth={2.5} />
                        <Text style={styles.taggedCallBtnText}>Call Customer Now</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.taggedViewBtn}
                        onPress={() => handleViewTagged(tag)}
                        activeOpacity={0.8}
                      >
                        <ExternalLink size={13} color="#0284C7" />
                        <Text style={styles.taggedViewBtnText}>View Lead</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* New Leads Notification Box */}
            {assignedNotif && (
              <View style={styles.assignedLeadsBox}>
                <View style={styles.assignedLeadsIconBox}>
                  <Sparkles size={18} color="#2563EB" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.assignedLeadsTitle}>New Leads Assigned!</Text>
                  <Text style={styles.assignedLeadsSubtitle}>
                    {assignedNotif.assignedBy || 'Admin'} assigned {assignedNotif.count} new leads in {assignedNotif.campaignName || 'Campaign'}.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.assignedLeadsActionBtn}
                  onPress={() => {
                    onClose();
                    navigation.navigate('MyLeads');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.assignedLeadsActionBtnText}>View Leads</Text>
                </TouchableOpacity>
              </View>
            )}

            {filteredList.length === 0 ? (
              <View style={styles.emptyState}>
                <CheckCircle2 size={36} color="#10B981" />
                <Text style={styles.emptyTitle}>You're All Caught Up!</Text>
                <Text style={styles.emptySubtitle}>
                  No follow-up callbacks pending in this section right now.
                </Text>
              </View>
            ) : (
              filteredList.map((item) => {
                const isHot = item.temperature === 'HOT';
                const isCold = item.temperature === 'COLD';
                const itemIsRead = isRead(item._id);

                return (
                  <TouchableOpacity
                    key={item._id}
                    activeOpacity={0.9}
                    onPress={() => markAsRead(item._id)}
                    style={[
                      styles.reminderCard,
                      item.isOverdue && !itemIsRead && styles.reminderCardOverdue,
                      itemIsRead && styles.reminderCardRead,
                    ]}
                  >
                    {/* Top Row: Customer Info & Temperature */}
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.customerName}>{item.name}</Text>
                          {/* Temperature Badge */}
                          <View
                            style={[
                              styles.tempBadge,
                              isHot
                                ? styles.tempHot
                                : isCold
                                ? styles.tempCold
                                : styles.tempWarm,
                            ]}
                          >
                            {isHot ? (
                              <Flame size={9} color="#DC2626" />
                            ) : isCold ? (
                              <Snowflake size={9} color="#2563EB" />
                            ) : (
                              <Sun size={9} color="#D97706" />
                            )}
                            <Text
                              style={[
                                styles.tempText,
                                {
                                  color: isHot
                                    ? '#DC2626'
                                    : isCold
                                    ? '#2563EB'
                                    : '#D97706',
                                },
                              ]}
                            >
                              {item.tag || item.temperature}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.customerPhone}>{item.phone}</Text>
                      </View>

                      {/* Scheduled Time Pill */}
                      <View
                        style={[
                          styles.timePill,
                          item.isOverdue && !itemIsRead ? styles.timePillOverdue : null,
                        ]}
                      >
                        <Clock
                          size={11}
                          color={item.isOverdue && !itemIsRead ? '#DC2626' : '#2563EB'}
                        />
                        <Text
                          style={[
                            styles.timePillText,
                            item.isOverdue && !itemIsRead ? styles.timePillTextOverdue : null,
                          ]}
                        >
                          {item.timeLabel}
                        </Text>
                      </View>
                    </View>

                    {/* Metadata: Stage & Branch */}
                    <View style={styles.metaRow}>
                      <Text style={styles.stageTag}>Stage: {item.stage}</Text>
                      {item.branch ? (
                        <Text style={styles.branchText}>· {item.branch}</Text>
                      ) : null}
                      {itemIsRead && (
                        <Text style={[styles.branchText, { color: '#059669', fontWeight: '700' }]}>
                          · Handled
                        </Text>
                      )}
                    </View>

                    {/* Direct Action Buttons */}
                    <View style={styles.actionsRow}>
                      {/* Call Now Button */}
                      <TouchableOpacity
                        style={styles.callActionBtn}
                        onPress={() => handleCall(item)}
                        activeOpacity={0.7}
                      >
                        <Phone size={13} color="#FFFFFF" strokeWidth={2.5} />
                        <Text style={styles.callActionBtnText}>Call Now</Text>
                      </TouchableOpacity>

                      {/* WhatsApp Button */}
                      <TouchableOpacity
                        style={styles.whatsAppActionBtn}
                        onPress={() => handleWhatsApp(item)}
                        activeOpacity={0.7}
                      >
                        <MessageCircle size={13} color="#16A34A" strokeWidth={2.5} />
                        <Text style={styles.whatsAppActionBtnText}>WhatsApp</Text>
                      </TouchableOpacity>

                      {/* Quick Update Button */}
                      <TouchableOpacity
                        style={styles.updateActionBtn}
                        onPress={() => openQuickModal(item)}
                        activeOpacity={0.7}
                      >
                        <Calendar size={13} color="#2563EB" />
                        <Text style={styles.updateActionBtnText}>Reschedule</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          {/* Bottom Footer Action */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.viewAllBtn}
              onPress={handleNavigateToAllFollowUps}
              activeOpacity={0.8}
            >
              <Text style={styles.viewAllBtnText}>
                Open Full Follow-ups Screen
              </Text>
              <ExternalLink size={14} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Embedded WhatsApp Template Modal */}
      {whatsAppTarget && (
        <WhatsAppTemplateModal
          visible={Boolean(whatsAppTarget)}
          onClose={() => setWhatsAppTarget(null)}
          recipientName={whatsAppTarget.name}
          recipientPhone={whatsAppTarget.phone}
        />
      )}

      {/* Embedded Lead Quick Modal */}
      {quickLead && (
        <LeadQuickModal
          lead={quickLead}
          visible={Boolean(quickLead)}
          onClose={() => setQuickLead(null)}
          onOpenFullDispose={(leadToDispose) => {
            onClose();
            navigation.navigate('Dispose', { lead: leadToDispose });
          }}
        />
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: 620,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    maxHeight: '85%',
    ...shadows.elevated,
  },
  grabBar: {
    width: 44,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bellIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    position: 'relative',
  },
  headerBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  headerBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  markAllBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    padding: 0,
  },
  filterPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 12,
  },
  pillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: '#F1F5F9',
  },
  pillBtnActive: {
    backgroundColor: '#2563EB',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  pillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  scrollArea: {
    maxHeight: 380,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 240,
  },
  reminderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
    ...shadows.soft,
  },
  reminderCardOverdue: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  reminderCardRead: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    opacity: 0.85,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  customerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  customerPhone: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  tempBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
  },
  tempHot: {
    backgroundColor: '#FEE2E2',
  },
  tempWarm: {
    backgroundColor: '#FEF3C7',
  },
  tempCold: {
    backgroundColor: '#DBEAFE',
  },
  tempText: {
    fontSize: 9,
    fontWeight: '800',
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  timePillOverdue: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  timePillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  timePillTextOverdue: {
    color: '#DC2626',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    marginBottom: 10,
  },
  stageTag: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  branchText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  callActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#10B981',
    paddingVertical: 7,
    borderRadius: 8,
  },
  callActionBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  whatsAppActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingVertical: 7,
    borderRadius: 8,
  },
  whatsAppActionBtnText: {
    color: '#047857',
    fontSize: 11.5,
    fontWeight: '700',
  },
  updateActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 7,
    borderRadius: 8,
  },
  updateActionBtnText: {
    color: '#1D4ED8',
    fontSize: 11.5,
    fontWeight: '700',
  },
  modalFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    borderRadius: 10,
  },
  viewAllBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  assignedLeadsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  assignedLeadsIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  assignedLeadsTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E40AF',
  },
  assignedLeadsSubtitle: {
    fontSize: 11,
    color: '#3B82F6',
    marginTop: 1,
  },
  assignedLeadsActionBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  assignedLeadsActionBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  // Tagged Section Styles
  taggedSection: {
    marginBottom: 16,
  },
  taggedSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  taggedSectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  taggedSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#D97706',
  },
  taggedSectionSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
  },
  taggedCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  taggedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  taggedReasonBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  taggedReasonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  taggedCustomerName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
  },
  taggedCustomerPhone: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
    marginTop: 2,
  },
  taggedAgentRow: {
    marginTop: 4,
  },
  taggedAgentText: {
    fontSize: 11,
    color: '#64748B',
  },
  taggedNoteBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FEF3C7',
    padding: 8,
    marginTop: 8,
  },
  taggedNoteText: {
    fontSize: 12,
    color: '#334155',
    fontStyle: 'italic',
  },
  taggedActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  taggedCallBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0F9D58',
    paddingVertical: 8,
    borderRadius: 8,
  },
  taggedCallBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  taggedViewBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 8,
    borderRadius: 8,
  },
  taggedViewBtnText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '700',
  },
});
