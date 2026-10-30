import React, { useEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  History,
  MessageCircle,
  Phone,
  X,
  Edit2,
  Check,
  Calendar,
  Flame,
} from 'lucide-react-native';

import { fetchLeadHistory, updateLeadDetails } from '../api/leadApi';
import { Activity, Lead, RootStackParamList } from '../types';
import { useAuthStore } from '../store/authStore';
import { useLeadHistoryStore } from '../store/leadHistoryStore';
import { formatDisplayPhone, getDialerTelUrl, isLeadLostOrSuppressed } from '../utils/phoneUtils';
import { LeadTimeline, deduplicateActivities } from './LeadTimeline';
import { WhatsAppTemplateModal } from './WhatsAppTemplateModal';
import { toast } from '../store/toastStore';

interface LeadSummaryModalProps {
  lead: Lead | null;
  visible: boolean;
  onClose: () => void;
  onOpenDisposition?: (lead: Lead) => void;
  onOpenFullDispose?: (lead: Lead) => void;
}

type ModalTab = 'SUMMARY' | 'HISTORY';

export const LeadSummaryModal: React.FC<LeadSummaryModalProps> = ({
  lead,
  visible,
  onClose,
  onOpenDisposition,
  onOpenFullDispose,
}) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const { getHistoryForLead, loadHistory } = useLeadHistoryStore();

  const [activeTab, setActiveTab] = useState<ModalTab>('SUMMARY');
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);

  // Customer Contact Editing State
  const [currentName, setCurrentName] = useState(lead?.name || '');
  const [currentPhone, setCurrentPhone] = useState(lead?.phone || '');
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [nameInput, setNameInput] = useState(lead?.name || '');
  const [phoneInput, setPhoneInput] = useState(lead?.phone || '');
  const [isSavingContact, setIsSavingContact] = useState(false);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (lead) {
      setActiveTab('SUMMARY');
      setCurrentName(lead.name);
      setCurrentPhone(lead.phone);
      setNameInput(lead.name);
      setPhoneInput(lead.phone);
      setIsEditingContact(false);
    }
  }, [lead?._id, lead?.name, lead?.phone]);

  const { data: backendHistoryData, isLoading: isHistoryLoading } = useQuery({
    queryKey: ['leadHistory', lead?._id],
    queryFn: () => (lead ? fetchLeadHistory(lead._id) : Promise.resolve({ activities: [] })),
    enabled: visible && Boolean(lead?._id),
  });

  const activities: Activity[] = useMemo(() => {
    if (!lead) return [];
    const backendActivities = backendHistoryData?.activities || [];
    const localActivities = getHistoryForLead(lead._id, lead.phone);
    const backendIds = new Set(backendActivities.map((activity) => activity._id));
    return deduplicateActivities(
      [...backendActivities, ...localActivities.filter((activity) => !backendIds.has(activity._id))]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    );
  }, [backendHistoryData, getHistoryForLead, lead]);

  if (!lead || !visible) return null;

  const campaignName =
    typeof lead.campaign === 'object' && lead.campaign
      ? lead.campaign.name
      : typeof lead.campaign === 'string' && lead.campaign
      ? lead.campaign
      : 'General';

  const handleCall = () => {
    const isSuppressed = isLeadLostOrSuppressed(lead);
    const dial = () => {
      Linking.openURL(getDialerTelUrl(lead.phone)).catch(() => {
        Alert.alert('Error', 'Unable to initiate phone call on this device.');
      });
    };

    if (!isSuppressed) {
      dial();
      return;
    }

    if (user?.role === 'AGENT') {
      Alert.alert(
        'Customer Suppressed',
        'This customer is marked as not interested and cannot be called from the agent queue.',
      );
      return;
    }

    Alert.alert(
      'Customer Not Interested',
      'This customer was marked as not interested. Calling again may cause customer irritation.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Call Anyway', style: 'destructive', onPress: dial },
      ],
    );
  };

  const handleSaveContact = async () => {
    const trimmedName = nameInput.trim();
    const trimmedPhone = phoneInput.trim();
    if (!trimmedName) {
      Alert.alert('Required', 'Customer name cannot be empty.');
      return;
    }
    if (!trimmedPhone) {
      Alert.alert('Required', 'Customer phone cannot be empty.');
      return;
    }
    if (trimmedName === currentName && trimmedPhone === currentPhone) {
      setIsEditingContact(false);
      return;
    }

    setIsSavingContact(true);
    setCurrentName(trimmedName);
    setCurrentPhone(trimmedPhone);
    if (lead) {
      lead.name = trimmedName;
      lead.phone = trimmedPhone;
    }
    setIsEditingContact(false);

    try {
      if (lead?._id) {
        await updateLeadDetails(lead._id, { name: trimmedName, phone: trimmedPhone });
        useLeadHistoryStore.getState().updateLeadName(lead._id, trimmedName);
        queryClient.invalidateQueries({ queryKey: ['myLeadsList'] });
        queryClient.invalidateQueries({ queryKey: ['leadHistory', lead._id] });
      }
      toast.success('Contact info updated successfully!', 'Saved');
    } catch {
      useLeadHistoryStore.getState().updateLeadName(lead?._id || '', trimmedName);
      toast.info('Contact info updated locally', 'Saved');
    } finally {
      setIsSavingContact(false);
    }
  };

  const openDisposition = () => {
    onClose();
    if (onOpenDisposition) {
      onOpenDisposition(lead);
    } else if (onOpenFullDispose) {
      onOpenFullDispose(lead);
    } else {
      navigation.navigate('Dispose', { lead, initialTab: 'DISPOSE LEAD' });
    }
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.handle} />

            {/* Header: Normal Mode vs Dedicated Name & Phone Edit Bar */}
            {isEditingContact ? (
              <View style={styles.editNameHeaderBox}>
                <View style={styles.editNameInputWrap}>
                  <Text style={styles.editNameHeaderLabel}>EDIT CUSTOMER NAME</Text>
                  <TextInput
                    style={styles.editNameInputFull}
                    value={nameInput}
                    onChangeText={setNameInput}
                    placeholder="Enter customer name..."
                    placeholderTextColor="#94A3B8"
                    returnKeyType="next"
                  />
                </View>
                <View style={styles.editNameInputWrap}>
                  <Text style={styles.editNameHeaderLabel}>EDIT CONTACT NUMBER</Text>
                  <TextInput
                    style={styles.editNameInputFull}
                    value={phoneInput}
                    onChangeText={setPhoneInput}
                    placeholder="Enter customer phone..."
                    placeholderTextColor="#94A3B8"
                    keyboardType="phone-pad"
                    returnKeyType="done"
                    onSubmitEditing={handleSaveContact}
                  />
                </View>
                <View style={styles.editNameActionsRow}>
                  <TouchableOpacity
                    style={styles.saveNameActionBtn}
                    onPress={handleSaveContact}
                    disabled={isSavingContact}
                    activeOpacity={0.8}
                  >
                    <Check size={15} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.saveNameActionBtnText}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelNameActionBtn}
                    onPress={() => {
                      setNameInput(currentName);
                      setPhoneInput(currentPhone);
                      setIsEditingContact(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <X size={15} color="#64748B" />
                    <Text style={styles.cancelNameActionBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.header}>
                <View style={styles.leadInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.name} numberOfLines={1}>{currentName}</Text>
                    <TouchableOpacity
                      style={styles.editNameBtn}
                      onPress={() => {
                        setNameInput(currentName);
                        setPhoneInput(currentPhone || lead.phone);
                        setIsEditingContact(true);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="Edit customer details"
                    >
                      <Edit2 size={13} color="#059669" />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setNameInput(currentName);
                      setPhoneInput(currentPhone || lead.phone);
                      setIsEditingContact(true);
                    }}
                    activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  >
                    <Text style={styles.phone}>{formatDisplayPhone(currentPhone || lead.phone)} · {campaignName}</Text>
                    <Edit2 size={11} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.iconButton, styles.callButton]}
                  onPress={handleCall}
                  accessibilityLabel="Call Customer"
                >
                  <Phone size={16} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconButton, styles.whatsAppButton]}
                  onPress={() => setShowWhatsAppModal(true)}
                  accessibilityLabel="WhatsApp Message"
                >
                  <MessageCircle size={16} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconButton, styles.closeButton]}
                  onPress={onClose}
                  accessibilityLabel="Close"
                >
                  <X size={17} color="#64748B" />
                </TouchableOpacity>
              </View>
            )}

            {/* Tabs: Lead | Timeline */}
            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'SUMMARY' && styles.activeTab]}
                onPress={() => setActiveTab('SUMMARY')}
              >
                <Text style={[styles.tabText, activeTab === 'SUMMARY' && styles.activeTabText]}>
                  Lead
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'HISTORY' && styles.activeTab]}
                onPress={() => setActiveTab('HISTORY')}
              >
                <History size={14} color={activeTab === 'HISTORY' ? '#059669' : '#64748B'} />
                <Text style={[styles.tabText, activeTab === 'HISTORY' && styles.activeTabText]}>
                  Timeline ({activities.length})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Body */}
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
            >
              {activeTab === 'SUMMARY' ? (
                <View style={styles.summaryCard}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.eyebrow}>LEAD DETAILS</Text>
                    {Boolean(lead.tag || lead.temperature) && (
                      <View
                        style={[
                          styles.tempBadge,
                          (lead.tag?.toUpperCase() === 'HOT' || lead.temperature === 'HOT')
                            ? styles.tempHot
                            : (lead.tag?.toUpperCase() === 'COLD' || lead.temperature === 'COLD')
                            ? styles.tempCold
                            : styles.tempWarm,
                        ]}
                      >
                        <Text
                          style={[
                            styles.tempBadgeText,
                            (lead.tag?.toUpperCase() === 'HOT' || lead.temperature === 'HOT')
                              ? styles.tempHotText
                              : (lead.tag?.toUpperCase() === 'COLD' || lead.temperature === 'COLD')
                              ? styles.tempColdText
                              : styles.tempWarmText,
                          ]}
                        >
                          {lead.tag || lead.temperature}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.infoGrid}>
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Status / Stage</Text>
                      <Text style={styles.infoValue}>{lead.stage || 'Open / Pending'}</Text>
                    </View>
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Campaign</Text>
                      <Text style={styles.infoValue} numberOfLines={1}>{campaignName}</Text>
                    </View>
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Contact Number</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.infoValue}>{formatDisplayPhone(currentPhone || lead.phone)}</Text>
                        <TouchableOpacity
                          onPress={() => {
                            setNameInput(currentName);
                            setPhoneInput(currentPhone || lead.phone);
                            setIsEditingContact(true);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Edit2 size={12} color="#059669" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Call Attempts</Text>
                      <Text style={styles.infoValue}>{lead.attemptCount ?? 0} time(s)</Text>
                    </View>
                  </View>

                  {lead.nextFollowUpAt ? (
                    <View style={styles.followUpBox}>
                      <Text style={styles.followUpLabel}>SCHEDULED CALLBACK</Text>
                      <Text style={styles.followUpValue}>
                        📅 {new Date(lead.nextFollowUpAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                <LeadTimeline activities={activities} isLoading={isHistoryLoading} />
              )}
            </ScrollView>

            {/* Single Prominent Action Button */}
            {activeTab === 'SUMMARY' ? (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={openDisposition}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryButtonText}>Update Lead Outcome / Disposition</Text>
                <ArrowRight size={17} color="#FFFFFF" strokeWidth={2.5} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={onClose}
                activeOpacity={0.75}
              >
                <Text style={styles.secondaryButtonText}>Close History</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <WhatsAppTemplateModal
        visible={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        customerName={currentName}
        customerPhone={lead.phone}
      />
    </>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  handle: {
    width: 38,
    height: 4,
    marginBottom: 14,
    borderRadius: 2,
    alignSelf: 'center',
    backgroundColor: '#CBD5E1',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  leadInfo: {
    flex: 1,
  },
  name: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '800',
  },
  editNameBtn: {
    padding: 3,
    backgroundColor: '#ECFDF5',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  editNameHeaderBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#059669',
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  editNameInputWrap: {
    gap: 4,
  },
  editNameHeaderLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.8,
  },
  editNameInputFull: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  editNameActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  saveNameActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  saveNameActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  cancelNameActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  cancelNameActionBtnText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  editNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editNameInput: {
    flex: 1,
    height: 32,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#059669',
    borderRadius: 6,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '700',
  },
  saveNameBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelNameBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phone: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 3,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callButton: {
    backgroundColor: '#10B981',
  },
  whatsAppButton: {
    backgroundColor: '#16A34A',
  },
  closeButton: {
    backgroundColor: '#F1F5F9',
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
  },
  activeTab: {
    backgroundColor: '#ECFDF5',
  },
  tabText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  activeTabText: {
    color: '#059669',
  },
  body: {
    maxHeight: 380,
  },
  bodyContent: {
    paddingVertical: 14,
  },
  summaryCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  eyebrow: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  tempBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tempBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  tempHot: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  tempHotText: {
    color: '#DC2626',
    fontSize: 10,
    fontWeight: '800',
  },
  tempCold: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  tempColdText: {
    color: '#0284C7',
    fontSize: 10,
    fontWeight: '800',
  },
  tempWarm: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  tempWarmText: {
    color: '#D97706',
    fontSize: 10,
    fontWeight: '800',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  infoItem: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  followUpBox: {
    marginTop: 12,
    backgroundColor: '#ECFDF5',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  followUpLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  followUpValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#065F46',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0F9D58',
    shadowColor: '#0F9D58',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
});
