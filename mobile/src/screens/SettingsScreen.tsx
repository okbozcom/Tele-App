import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Modal,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings2,
  RotateCw,
  ShieldCheck,
  ShieldAlert,
  Save,
  MessageSquare,
  Plus,
  Edit2,
  Trash2,
  X,
  FileText,
  Sparkles,
  CheckCheck,
  Volume2,
  Bell,
  Clock,
  Building2,
  MapPin,
  ChevronRight,
  Cpu,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

import { useAuthStore } from '../store/authStore';
import {
  fetchAdminSettings,
  updateAdminSettings,
  fetchBranches,
  createBranch,
  deleteBranch,
  fetchUsers,
} from '../api/leadApi';
import { Branch } from '../types';
import { useTemplateStore, WhatsAppTemplate } from '../store/templateStore';
import { colors } from '../theme';
import { CrmShell } from '../components/CrmShell';
import { storage } from '../utils/storage';

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAgent = user?.role === 'AGENT';
  const isAdmin = user?.role === 'ADMIN';

  const { data: settingsData } = useQuery({
    queryKey: ['adminSettings'],
    queryFn: fetchAdminSettings,
    enabled: !isAgent,
  });

  const backendSettings = settingsData?.settings;

  // Local state for immediate reactive UI
  const [allowDisposeWithoutFollowUp, setAllowDisposeWithoutFollowUp] = useState(false);
  const [followUpMandatoryForNotConnected, setFollowUpMandatoryForNotConnected] = useState(true);
  const [autoLeadDistribution, setAutoLeadDistribution] = useState(true);
  const [callDelaySeconds, setCallDelaySeconds] = useState<number>(3);
  const [dialSoundEnabled, setDialSoundEnabled] = useState<boolean>(true);

  // Load and persist local agent calling preferences
  useEffect(() => {
    const loadLocalPreferences = async () => {
      try {
        const savedDelay = await storage.getItem('tele_settings_call_delay');
        if (savedDelay) {
          const parsed = parseInt(savedDelay, 10);
          if (!isNaN(parsed)) setCallDelaySeconds(parsed);
        }
        const savedSound = await storage.getItem('tele_settings_dial_sound');
        if (savedSound !== null) {
          setDialSoundEnabled(savedSound === 'true');
        }
      } catch {}
    };
    loadLocalPreferences();
  }, []);

  const handleSetCallDelay = (seconds: number) => {
    setCallDelaySeconds(seconds);
    storage.setItem('tele_settings_call_delay', seconds.toString()).catch(() => {});
  };

  const handleSetDialSound = (enabled: boolean) => {
    setDialSoundEnabled(enabled);
    storage.setItem('tele_settings_dial_sound', enabled ? 'true' : 'false').catch(() => {});
  };

  // Template Store
  const { templates, loadTemplates, addTemplate, updateTemplate, deleteTemplate, resetToDefaults } =
    useTemplateStore();

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateCategory, setTemplateCategory] = useState('Services');
  const [templateContent, setTemplateContent] = useState('');

  // Branch Management State (Admin Only)
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchCode, setNewBranchCode] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');

  const { data: branchesData } = useQuery({
    queryKey: ['adminBranches'],
    queryFn: fetchBranches,
    enabled: isAdmin,
  });
  const branchesList: Branch[] = branchesData?.branches || [];

  const { data: usersData } = useQuery({
    queryKey: ['adminUsers'],
    queryFn: () => fetchUsers(),
    enabled: isAdmin,
  });

  const createBranchMutation = useMutation({
    mutationFn: () =>
      createBranch({
        name: newBranchName.trim(),
        code: newBranchCode.trim(),
        address: newBranchAddress.trim(),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['adminBranches'] });
      setShowBranchModal(false);
      setNewBranchName('');
      setNewBranchCode('');
      setNewBranchAddress('');
      Alert.alert(
        'Branch Created',
        `Branch "${res.branch?.name || newBranchName}" created successfully!`,
      );
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Failed to create branch';
      Alert.alert('Error', msg);
    },
  });

  const deleteBranchMutation = useMutation({
    mutationFn: (id: string) => deleteBranch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminBranches'] });
      Alert.alert('Branch Removed', 'Branch has been deleted successfully.');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Failed to delete branch';
      Alert.alert('Error', msg);
    },
  });

  const handleDeleteBranch = (id: string, name: string, memberCount: number) => {
    if (memberCount > 0) {
      Alert.alert(
        'Cannot Delete Branch',
        `There are ${memberCount} team member(s) assigned to ${name} Branch. Please reassign them in the Team screen before deleting this branch.`,
      );
      return;
    }
    Alert.alert(
      'Delete Branch',
      `Are you sure you want to permanently delete the ${name} Branch? All team assignments and branch filters will be updated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: () => deleteBranchMutation.mutate(id),
        },
      ],
    );
  };

  const handleInsertVariable = (token: string) => {
    setTemplateContent((prev) => `${prev} ${token}`);
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  // Sync from backend when loaded
  useEffect(() => {
    if (backendSettings) {
      if (backendSettings.allowDisposeWithoutFollowUp !== undefined) {
        setAllowDisposeWithoutFollowUp(backendSettings.allowDisposeWithoutFollowUp);
      }
      if (backendSettings.followUpMandatoryForNotConnected !== undefined) {
        setFollowUpMandatoryForNotConnected(backendSettings.followUpMandatoryForNotConnected);
      }
      if (backendSettings.autoLeadDistribution !== undefined) {
        setAutoLeadDistribution(backendSettings.autoLeadDistribution);
      }
    }
  }, [backendSettings]);

  // Mutation to persist
  const saveMutation = useMutation({
    mutationFn: async () => {
      return updateAdminSettings({
        allowDisposeWithoutFollowUp,
        followUpMandatoryForNotConnected,
        autoLeadDistribution,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminSettings'] });
      queryClient.invalidateQueries({ queryKey: ['publicSettings'] });
      Alert.alert('Saved', 'Organization policies have been saved successfully.');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Failed to save settings';
      Alert.alert('Error', msg);
      if (backendSettings) {
        if (backendSettings.allowDisposeWithoutFollowUp !== undefined) {
          setAllowDisposeWithoutFollowUp(backendSettings.allowDisposeWithoutFollowUp);
        }
        if (backendSettings.followUpMandatoryForNotConnected !== undefined) {
          setFollowUpMandatoryForNotConnected(backendSettings.followUpMandatoryForNotConnected);
        }
        if (backendSettings.autoLeadDistribution !== undefined) {
          setAutoLeadDistribution(backendSettings.autoLeadDistribution);
        }
      }
    },
  });

  const handleResetTemplates = () => {
    Alert.alert(
      'Reset WhatsApp Templates',
      'Are you sure you want to restore the default company templates? All custom templates will be reset to company standards.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset to Defaults',
          style: 'destructive',
          onPress: async () => {
            await resetToDefaults();
            Alert.alert('Templates Restored', 'Default WhatsApp templates have been restored.');
          },
        },
      ],
    );
  };

  const handleOpenAddTemplate = () => {
    setEditingTemplateId(null);
    setTemplateTitle('');
    setTemplateCategory('Services');
    setTemplateContent(
      'Hello {name},\n\nHere are our service details:\n✨ Service 1\n✨ Service 2\n\nFeel free to reply if you have questions!',
    );
    setShowTemplateModal(true);
  };

  const handleOpenEditTemplate = (tmpl: WhatsAppTemplate) => {
    setEditingTemplateId(tmpl.id);
    setTemplateTitle(tmpl.title);
    setTemplateCategory(tmpl.category || 'Services');
    setTemplateContent(tmpl.content);
    setShowTemplateModal(true);
  };

  const handleSaveTemplate = async () => {
    if (!templateTitle.trim() || !templateContent.trim()) {
      Alert.alert('Required Fields', 'Please enter a template title and message content.');
      return;
    }

    if (editingTemplateId) {
      await updateTemplate(editingTemplateId, templateTitle, templateContent, templateCategory);
    } else {
      await addTemplate(templateTitle, templateContent, templateCategory);
    }

    setShowTemplateModal(false);
    Alert.alert('Success', 'WhatsApp template saved successfully.');
  };

  const handleDeleteTemplate = (id: string, title: string) => {
    Alert.alert('Delete Template', `Are you sure you want to delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteTemplate(id),
      },
    ]);
  };

  if (isAgent) {
    return (
      <CrmShell
        title="Access Restricted"
        headerIcon={<ShieldAlert size={15} color="#DC2626" />}
        breadcrumb="Settings"
      >
        <View style={styles.restrictedContainer}>
          <View style={styles.restrictedIconBox}>
            <ShieldAlert size={36} color="#DC2626" />
          </View>
          <Text style={styles.restrictedTitle}>Admin Access Only</Text>
          <Text style={styles.restrictedSubtitle}>
            Settings, organization calling policies, and system configuration are restricted to Administrators. Agents do not have permission to access or modify these controls.
          </Text>
          <TouchableOpacity
            style={styles.restrictedBackBtn}
            onPress={() => navigation.navigate('Home')}
            activeOpacity={0.8}
          >
            <Text style={styles.restrictedBackBtnText}>Return to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </CrmShell>
    );
  }

  return (
    <CrmShell
      title="Organization Settings"
      headerIcon={<Settings2 size={15} color={colors.textSecondary} />}
      breadcrumb="Management"
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner Section */}
        <View style={styles.bannerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>
              {isAgent ? 'Calling & Message Preferences' : 'Organization policies'}
            </Text>
            <Text style={styles.bannerSubtitle}>
              {isAgent
                ? 'Customize your dialing audio and WhatsApp quick response templates'
                : 'Keep follow-ups and calling workflows consistent across your team'}
            </Text>
          </View>

          {!isAgent && (
            <TouchableOpacity
              style={styles.saveChangesBtn}
              onPress={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              activeOpacity={0.8}
            >
              {saveMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Save size={14} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.saveChangesText}>Save changes</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Section 1 Heading: Follow-up & Calling Pacing policies */}
        <View style={styles.sectionHeaderRow}>
          <RotateCw size={15} color="#4F46E5" />
          <Text style={styles.sectionHeaderTitle}>Follow-up & Calling Policies</Text>
        </View>

        {/* Settings Card */}
        <View style={styles.settingsCard}>
          {/* Policy 0: Call Delay Pacing */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Auto-dialer lead pacing delay</Text>
              <Text style={styles.settingSubtitle}>
                Countdown gap before next lead is queued for dialing.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[3, 5, 10].map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => handleSetCallDelay(s)}
                  activeOpacity={0.7}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 8,
                    backgroundColor: callDelaySeconds === s ? '#10B981' : '#F1F5F9',
                    borderWidth: 1,
                    borderColor: callDelaySeconds === s ? '#10B981' : '#E2E8F0',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '800',
                      color: callDelaySeconds === s ? '#FFFFFF' : '#64748B',
                    }}
                  >
                    {s}s
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Policy 0.5: Dial Sound / Chimes */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Dialing chimes & connection vibration</Text>
              <Text style={styles.settingSubtitle}>
                Play subtle audio cue when phone call is answered.
              </Text>
            </View>
            <Switch
              value={dialSoundEnabled}
              onValueChange={handleSetDialSound}
              trackColor={{ false: '#E2E8F0', true: '#10B981' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Policy 1: Allow disposing without follow-up */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Allow disposing without follow-up</Text>
              <Text style={styles.settingSubtitle}>
                Agents can complete calls without scheduling a callback.
              </Text>
            </View>
            <Switch
              value={allowDisposeWithoutFollowUp}
              onValueChange={setAllowDisposeWithoutFollowUp}
              disabled={isAgent}
              trackColor={{ false: '#E2E8F0', true: '#10B981' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Policy 2: Follow-up mandatory for not connected */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Follow-up mandatory for not connected</Text>
              <Text style={styles.settingSubtitle}>
                Require a scheduled follow-up when a call does not connect.
              </Text>
            </View>
            <Switch
              value={followUpMandatoryForNotConnected}
              onValueChange={setFollowUpMandatoryForNotConnected}
              disabled={isAgent}
              trackColor={{ false: '#E2E8F0', true: '#10B981' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Policy 3: Automatic lead distribution */}
          <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Automatic lead distribution</Text>
              <Text style={styles.settingSubtitle}>
                Distribute new leads equally among enabled agents.
              </Text>
            </View>
            <Switch
              value={autoLeadDistribution}
              onValueChange={setAutoLeadDistribution}
              disabled={isAgent}
              trackColor={{ false: '#E2E8F0', true: '#10B981' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Organization Scope Callout */}
        <View style={styles.calloutCard}>
          <ShieldCheck size={18} color="#10B981" />
          <View style={styles.calloutTextWrap}>
            <Text style={styles.calloutTitle}>Applies to your entire organization</Text>
            <Text style={styles.calloutSubtitle}>
              These preferences are shared by all agents across active branches.
            </Text>
          </View>
        </View>

        {/* Section 2: WhatsApp Service Templates Management */}
        <View style={[styles.sectionHeaderRow, { marginTop: 28, justifyContent: 'space-between' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MessageSquare size={16} color="#15803D" />
            <Text style={styles.sectionHeaderTitle}>WhatsApp Service Templates</Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#F1F5F9',
                paddingVertical: 7,
                paddingHorizontal: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: '#E2E8F0',
                gap: 5,
              }}
              onPress={handleResetTemplates}
              activeOpacity={0.8}
            >
              <RotateCw size={12} color="#64748B" />
              <Text style={{ color: '#475569', fontSize: 11.5, fontWeight: '700' }}>Reset Defaults</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#10B981',
                paddingVertical: 7,
                paddingHorizontal: 12,
                borderRadius: 8,
                gap: 6,
              }}
              onPress={handleOpenAddTemplate}
              activeOpacity={0.8}
            >
              <Plus size={13} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Add Template</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.templatesSubtitle}>
          Message templates automatically formatted with client variables for 1-tap customer outreach.
        </Text>

        {/* Templates List with WhatsApp Bubble Previews */}
        <View style={{ gap: 14 }}>
          {templates.map((tmpl) => (
            <View
              key={tmpl.id}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 14,
                padding: 16,
                borderWidth: 1,
                borderColor: '#E2E8F0',
                shadowColor: '#0F172A',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 3,
                elevation: 2,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A' }} numberOfLines={1}>
                    {tmpl.title}
                  </Text>
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      backgroundColor: '#F0FDF4',
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: '#BBF7D0',
                      marginTop: 4,
                    }}
                  >
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#15803D' }}>
                      {tmpl.category || 'General'}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TouchableOpacity
                    style={styles.iconActionBtn}
                    onPress={() => handleOpenEditTemplate(tmpl)}
                    activeOpacity={0.7}
                  >
                    <Edit2 size={13} color="#4F46E5" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.iconActionBtn}
                    onPress={() => handleDeleteTemplate(tmpl.id, tmpl.title)}
                    activeOpacity={0.7}
                  >
                    <Trash2 size={13} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Realistic WhatsApp Chat Bubble Preview */}
              <View
                style={{
                  backgroundColor: '#ECE5DD',
                  borderRadius: 12,
                  padding: 10,
                  marginTop: 12,
                }}
              >
                <View
                  style={{
                    backgroundColor: '#DCF8C6',
                    borderRadius: 10,
                    padding: 10,
                    maxWidth: '92%',
                    alignSelf: 'flex-start',
                    shadowColor: '#000000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.08,
                    shadowRadius: 2,
                    elevation: 1,
                  }}
                >
                  <Text style={{ fontSize: 13, color: '#111B21', lineHeight: 18 }}>
                    {tmpl.content}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}>
                    <Text style={{ fontSize: 10, color: '#667781' }}>11:45 AM</Text>
                    <CheckCheck size={13} color="#34B7F1" />
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Section 3: Branch Management (Admin Only) */}
        {isAdmin && (
          <>
            <View
              style={[
                styles.sectionHeaderRow,
                { marginTop: 28, justifyContent: 'space-between' },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Building2 size={16} color="#0D9488" />
                <Text style={styles.sectionHeaderTitle}>Branch Management</Text>
              </View>

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#0D9488',
                  paddingVertical: 7,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  gap: 6,
                }}
                onPress={() => setShowBranchModal(true)}
                activeOpacity={0.8}
              >
                <Plus size={13} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                  Add Branch
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.templatesSubtitle}>
              Create and manage company branches. Calling agents, managers, and leads are assigned to branches.
            </Text>

            <View style={{ gap: 10 }}>
              {branchesList.map((br) => {
                const memberCount = (usersData?.users || []).filter(
                  (u: any) => (u.branch || '').toLowerCase() === br.name.toLowerCase(),
                ).length;
                return (
                  <View
                    key={br._id || br.name}
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: 12,
                      padding: 14,
                      borderWidth: 1,
                      borderColor: '#E2E8F0',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 14.5, fontWeight: '800', color: '#0F172A' }}>
                          {br.name} Branch
                        </Text>
                        {br.code ? (
                          <View
                            style={{
                              backgroundColor: '#F0FDFA',
                              borderColor: '#99F6E4',
                              borderWidth: 1,
                              borderRadius: 5,
                              paddingHorizontal: 6,
                              paddingVertical: 1,
                            }}
                          >
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#0F766E' }}>
                              {br.code}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <Text style={{ fontSize: 11.5, color: '#64748B' }}>
                          👥 {memberCount} member{memberCount === 1 ? '' : 's'} assigned
                        </Text>
                        {br.address ? (
                          <Text style={{ fontSize: 11.5, color: '#94A3B8' }}>
                            · {br.address}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.iconActionBtn}
                      onPress={() => handleDeleteBranch(br._id, br.name, memberCount)}
                      activeOpacity={0.7}
                    >
                      <Trash2 size={14} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* System & Hardware Diagnostics (P14.2) */}
        <View style={[styles.sectionHeaderRow, { marginTop: 28 }]}>
          <Cpu size={15} color="#2563EB" />
          <Text style={styles.sectionHeaderTitle}>Device & Network Diagnostics</Text>
        </View>

        <TouchableOpacity
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: '#E2E8F0',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 40,
          }}
          onPress={() => navigation.navigate('Diagnostics' as never)}
          activeOpacity={0.8}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>
              Run Live Diagnostics
            </Text>
            <Text style={{ fontSize: 12.5, color: '#64748B', marginTop: 4 }}>
              Inspect Android permissions, API latency, outbox sync queue & battery guide.
            </Text>
          </View>
          <ChevronRight size={18} color="#64748B" />
        </TouchableOpacity>
      </ScrollView>

      {/* Add / Edit Template Modal with Tappable Variable Chips */}
      <Modal
        visible={showTemplateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTemplateModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MessageSquare size={18} color="#15803D" />
                <Text style={styles.modalTitle}>
                  {editingTemplateId ? 'Edit WhatsApp Template' : 'New Service Template'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowTemplateModal(false)}>
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalBody}>
                <Text style={styles.inputLabel}>TEMPLATE TITLE</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Service Introduction & Pricing"
                  placeholderTextColor="#94A3B8"
                  value={templateTitle}
                  onChangeText={setTemplateTitle}
                />

                <Text style={[styles.inputLabel, { marginTop: 12 }]}>CATEGORY</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Services / Quotation / Follow-up"
                  placeholderTextColor="#94A3B8"
                  value={templateCategory}
                  onChangeText={setTemplateCategory}
                />

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.inputLabel}>INSERT DYNAMIC VARIABLES</Text>
                  {/* Tappable Variable Chips */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {[
                      { label: '+ {name}', token: '{name}' },
                      { label: '+ {phone}', token: '{phone}' },
                      { label: '+ {agent}', token: '{agent}' },
                      { label: '+ {branch}', token: '{branch}' },
                      { label: '+ {company}', token: '{company}' },
                    ].map((chip) => (
                      <TouchableOpacity
                        key={chip.token}
                        onPress={() => handleInsertVariable(chip.token)}
                        activeOpacity={0.7}
                        style={{
                          backgroundColor: '#F0FDF4',
                          borderWidth: 1,
                          borderColor: '#BBF7D0',
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 6,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#15803D' }}>
                          {chip.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <Text style={[styles.inputLabel, { marginTop: 12 }]}>MESSAGE CONTENT</Text>
                <TextInput
                  style={[styles.modalTextarea, { minHeight: 90 }]}
                  placeholder="Write your WhatsApp message here..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  value={templateContent}
                  onChangeText={setTemplateContent}
                  textAlignVertical="top"
                />

                {/* Live Bubble Preview */}
                <Text style={[styles.inputLabel, { marginTop: 10 }]}>LIVE PREVIEW</Text>
                <View
                  style={{
                    backgroundColor: '#ECE5DD',
                    borderRadius: 10,
                    padding: 8,
                    marginTop: 4,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: '#DCF8C6',
                      borderRadius: 8,
                      padding: 8,
                      maxWidth: '94%',
                      alignSelf: 'flex-start',
                    }}
                  >
                    <Text style={{ fontSize: 12.5, color: '#111B21' }}>
                      {templateContent || 'Type message above to preview bubble...'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 3 }}>
                      <Text style={{ fontSize: 9.5, color: '#667781' }}>Now</Text>
                      <CheckCheck size={12} color="#34B7F1" />
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleSaveTemplate}
                  activeOpacity={0.8}
                  style={{
                    height: 50,
                    backgroundColor: '#10B981',
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 16,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>
                    Save WhatsApp Template
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add Branch Modal (Admin Only) */}
      <Modal
        visible={showBranchModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBranchModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Building2 size={18} color="#0D9488" />
                <Text style={styles.modalTitle}>Create New Branch</Text>
              </View>
              <TouchableOpacity onPress={() => setShowBranchModal(false)}>
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>BRANCH NAME *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Coimbatore, Salem, Madurai North"
                placeholderTextColor="#94A3B8"
                value={newBranchName}
                onChangeText={setNewBranchName}
              />

              <Text style={[styles.inputLabel, { marginTop: 12 }]}>BRANCH CODE (OPTIONAL)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. CBE, SLM"
                placeholderTextColor="#94A3B8"
                value={newBranchCode}
                onChangeText={setNewBranchCode}
                autoCapitalize="characters"
              />

              <Text style={[styles.inputLabel, { marginTop: 12 }]}>OFFICE LOCATION / ADDRESS (OPTIONAL)</Text>
              <TextInput
                style={[styles.modalTextarea, { minHeight: 65 }]}
                placeholder="e.g. 124 Cross Cut Road, Gandhipuram"
                placeholderTextColor="#94A3B8"
                value={newBranchAddress}
                onChangeText={setNewBranchAddress}
                multiline
                textAlignVertical="top"
              />
            </ScrollView>

            <TouchableOpacity
              style={{
                height: 48,
                backgroundColor: '#0D9488',
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 16,
              }}
              onPress={() => {
                const trimmedName = newBranchName.trim();
                if (!trimmedName || trimmedName.length < 2) {
                  Alert.alert('Validation Error', 'Branch name must be at least 2 characters long.');
                  return;
                }
                createBranchMutation.mutate();
              }}
              disabled={createBranchMutation.isPending}
              activeOpacity={0.8}
            >
              {createBranchMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>
                  Create Branch
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  saveChangesBtn: {
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
  saveChangesText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  addTemplateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16A34A',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    gap: 5,
  },
  addTemplateText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  templatesSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 14,
    marginTop: -4,
  },
  settingsCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
    marginBottom: 18,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 16,
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  settingSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 3,
    lineHeight: 16,
  },
  calloutCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 14,
    gap: 10,
  },
  calloutTextWrap: {
    flex: 1,
  },
  calloutTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  calloutSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  templatesGrid: {
    gap: 10,
  },
  templateCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  templateCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  templateCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  templateCategoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  templateCategoryText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  templateCardActions: {
    flexDirection: 'row',
    gap: 6,
  },
  iconActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  templateSnippet: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalBody: {
    marginTop: 14,
    gap: 4,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.4,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: '#0F172A',
    marginTop: 4,
  },
  modalTextarea: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
    fontSize: 12,
    color: '#0F172A',
    minHeight: 120,
    marginTop: 4,
    lineHeight: 18,
  },
  submitTemplateBtn: {
    backgroundColor: '#16A34A',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 18,
  },
  submitTemplateText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
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
    backgroundColor: '#0F9D58',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#0F9D58',
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
