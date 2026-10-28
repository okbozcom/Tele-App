import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  StyleSheet,
  Modal,
  Switch,
  useWindowDimensions,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Megaphone,
  Plus,
  Edit2,
  Trash2,
  X,
  Users,
  Check,
  HelpCircle,
  ShieldAlert,
  Play,
  Pause,
  MapPin,
  Building2,
  Globe,
  Shield,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

import { useAuthStore } from '../store/authStore';
import {
  fetchCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  fetchPipelines,
  fetchUsers,
  fetchBranches,
} from '../api/leadApi';
import {
  Campaign,
  Pipeline,
  User,
  Branch,
  CampaignPriority,
  DistributionMode,
  DuplicateMode,
  QuestionType,
  EngagementQuestion,
} from '../types';
import { colors } from '../theme';
import { CrmShell } from '../components/CrmShell';

interface DisplayCampaign {
  _id: string;
  name: string;
  branch?: string | null;
  priority: 'High priority' | 'Medium priority' | 'Low priority';
  rawPriority: CampaignPriority;
  isActive: boolean;
  totalLeads: number;
  assignedAgentsCount: number;
  assignedAgents: string[];
  distribution: string;
  questionCount: number;
  iconBg: string;
  iconColor: string;
}

export const CampaignsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAgent = user?.role === 'AGENT';
  const isManager = user?.role === 'MANAGER';
  const isAdmin = user?.role === 'ADMIN';
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [branch, setBranch] = useState<string | null>(isManager && user?.branch ? user.branch : null);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>(
    isManager && user?.branch ? user.branch : 'ALL',
  );
  const [pipelineId, setPipelineId] = useState('');
  const [priority, setPriority] = useState<CampaignPriority>('MEDIUM');
  const [distributionMode, setDistributionMode] = useState<DistributionMode>('EQUAL');
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>('SKIP');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [questions, setQuestions] = useState<EngagementQuestion[]>([]);

  // Queries
  const { data: campaignsData } = useQuery({
    queryKey: ['adminCampaigns'],
    queryFn: fetchCampaigns,
    enabled: !isAgent,
  });

  const { data: pipelinesData } = useQuery({
    queryKey: ['adminPipelines'],
    queryFn: fetchPipelines,
    enabled: !isAgent,
  });
  const pipelinesList: Pipeline[] = pipelinesData?.pipelines || [];

  const { data: usersData } = useQuery({
    queryKey: ['adminUsers'],
    queryFn: () => fetchUsers(),
    enabled: !isAgent,
  });
  const agentsList: User[] = (usersData?.users || []).filter(
    (u) => u.role === 'AGENT' && u.isActive,
  );

  const { data: branchesData } = useQuery({
    queryKey: ['adminBranches'],
    queryFn: fetchBranches,
    enabled: !isAgent,
  });
  const branchesList: Branch[] = branchesData?.branches || [];

  const availableBranches = useMemo(() => {
    const list = branchesList.map((b) => b.name);
    const fromUsers = (usersData?.users || []).map((u) => u.branch).filter(Boolean) as string[];
    const defaults = ['Coimbatore', 'Trichy', 'Pudukkottai', 'Chennai', 'Madurai'];
    return Array.from(new Set([...list, ...fromUsers, ...defaults])).filter(Boolean);
  }, [branchesList, usersData]);

  // Save Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Partial<Campaign> = {
        name: name.trim(),
        branch: isManager ? (user?.branch || null) : (branch ? branch : null),
        pipelineId: pipelineId || pipelinesList[0]?._id,
        priority,
        distributionMode,
        duplicateMode,
        agentIds: selectedAgentIds,
        engagementForm: questions,
      };

      if (editingId && !editingId.startsWith('camp-')) {
        return updateCampaign(editingId, payload);
      }
      return createCampaign(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminCampaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setShowModal(false);
      setEditingId(null);
      Alert.alert('Success', 'Campaign configuration saved.');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Failed to save campaign';
      Alert.alert('Error', msg);
    },
  });

  const [activeStatusOverrides, setActiveStatusOverrides] = useState<Record<string, boolean>>({});

  const toggleCampaignMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      if (!id.startsWith('camp-')) {
        return updateCampaign(id, { isActive });
      }
    },
    onSuccess: (_data, variables) => {
      if (variables?.id) {
        setActiveStatusOverrides((prev) => {
          const next = { ...prev };
          delete next[variables.id];
          return next;
        });
      }
      queryClient.invalidateQueries({ queryKey: ['adminCampaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: (err: any, variables) => {
      if (variables?.id) {
        setActiveStatusOverrides((prev) => {
          const next = { ...prev };
          delete next[variables.id];
          return next;
        });
      }
      const msg = err?.response?.data?.message || err?.message || 'Failed to update campaign status';
      Alert.alert('Status Update Failed', msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminCampaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setShowModal(false);
      setEditingId(null);
      Alert.alert('Campaign Deleted', 'The campaign and its leads have been deleted successfully.');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Failed to delete campaign';
      Alert.alert('Error', msg);
    },
  });

  const handleDeleteCampaign = (campaignId: string, campaignName: string) => {
    Alert.alert(
      'Delete Campaign',
      `Are you sure you want to delete "${campaignName}"?\n\nThis will permanently delete the campaign and all associated leads. This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(campaignId),
        },
      ],
    );
  };

  const handleToggleActive = (campId: string, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    setActiveStatusOverrides((prev) => ({ ...prev, [campId]: nextStatus }));
    toggleCampaignMutation.mutate({ id: campId, isActive: nextStatus });
  };

  // Map backend campaigns
  const displayList: DisplayCampaign[] = useMemo(() => {
    const realCamps = campaignsData?.campaigns || [];
    return realCamps.map((c: Campaign, idx: number) => {
      const pLabel =
        c.priority === 'HIGH'
          ? 'High priority'
          : c.priority === 'LOW'
          ? 'Low priority'
          : 'Medium priority';

      return {
        _id: c._id,
        name: c.name,
        branch: c.branch || null,
        priority: pLabel as any,
        rawPriority: c.priority,
        isActive: activeStatusOverrides[c._id] !== undefined ? activeStatusOverrides[c._id] : c.isActive !== false,
        totalLeads: (c as any).totalLeads ?? (c as any).leadCount ?? 0,
        assignedAgentsCount: c.agentIds?.length || 0,
        assignedAgents: (c.agentIds || []).map((id) => {
          const found = agentsList.find((a) => a._id === id);
          return found?.name || 'Agent';
        }),
        distribution: c.distributionMode === 'CONDITIONAL' ? 'Conditional rules' : 'Equal distribution',
        questionCount: c.engagementForm?.length || 0,
        iconBg: idx % 2 === 0 ? '#EFF6FF' : '#FFFBEB',
        iconColor: idx % 2 === 0 ? '#2563EB' : '#D97706',
      };
    });
  }, [campaignsData, agentsList, activeStatusOverrides]);

  // Filtered campaigns by branch
  const filteredDisplayList = useMemo(() => {
    if (selectedBranchFilter === 'ALL') return displayList;
    return displayList.filter(
      (c) =>
        c.branch &&
        c.branch.toLowerCase().trim() === selectedBranchFilter.toLowerCase().trim(),
    );
  }, [displayList, selectedBranchFilter]);

  // Overall statistics
  const totalCampaignsCount = filteredDisplayList.length;
  const totalLeadsSum = filteredDisplayList.reduce((acc, c) => acc + c.totalLeads, 0);

  const openNew = () => {
    setEditingId(null);
    setName('');
    setBranch(isManager && user?.branch ? user.branch : null);
    setPipelineId(pipelinesList[0]?._id || '');
    setPriority('MEDIUM');
    setDistributionMode('EQUAL');
    setDuplicateMode('SKIP');
    setSelectedAgentIds([]);
    setQuestions([]);
    setShowModal(true);
  };

  const openEdit = (c: DisplayCampaign) => {
    const original = (campaignsData?.campaigns || []).find((x) => x._id === c._id);
    setEditingId(c._id);
    setName(c.name);
    setBranch(original?.branch || null);
    setPriority(c.rawPriority);
    setDistributionMode(original?.distributionMode || 'EQUAL');
    setDuplicateMode(original?.duplicateMode || 'SKIP');
    setSelectedAgentIds(original?.agentIds || []);
    setQuestions(original?.engagementForm || []);
    setShowModal(true);
  };

  const addQuestion = (type: QuestionType) => {
    const newQ: EngagementQuestion = {
      id: `q-${Date.now()}`,
      type,
      label: type === 'TEXT' ? 'General Notes' : type === 'NUMBER' ? 'Budget / Investment' : 'Decision Status',
      options: type === 'MULTIPLE_CHOICE' ? ['Yes', 'No', 'Maybe'] : [],
      required: false,
    };
    setQuestions((prev) => [...prev, newQ]);
  };

  if (isAgent) {
    return (
      <CrmShell
        title="Campaigns"
        headerIcon={<Megaphone size={15} color={colors.textSecondary} />}
        breadcrumb="Workspace"
      >
        <View style={styles.restrictedContainer}>
          <View style={styles.restrictedIconBox}>
            <ShieldAlert size={40} color="#E11D48" />
          </View>
          <Text style={styles.restrictedTitle}>Calling Workspace Only</Text>
          <Text style={styles.restrictedSubtitle}>
            Campaign creation, prioritization, and lead assignment are managed centrally by Administrators and Branch Managers. Agents make calls directly from their queue.
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
      title="Campaigns"
      headerIcon={<Megaphone size={15} color={colors.textSecondary} />}
      breadcrumb="Workspace"
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner Section: Built for better conversations */}
        <View style={styles.bannerRow}>
          <View>
            <Text style={styles.bannerTitle}>Built for better conversations</Text>
            <Text style={styles.bannerSubtitle}>
              {totalCampaignsCount} campaigns · {totalLeadsSum.toLocaleString()} total leads
            </Text>
          </View>

          <TouchableOpacity
            style={styles.newCampaignBtn}
            onPress={openNew}
            activeOpacity={0.8}
          >
            <Plus size={14} color="#FFFFFF" strokeWidth={2.5} />
            <Text style={styles.newCampaignText}>New Campaign</Text>
          </TouchableOpacity>
        </View>

        {/* Branch Filter Tabs for Admin */}
        {isAdmin && (
          <View style={{ marginBottom: 14 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
            >
              <TouchableOpacity
                style={[
                  styles.filterTabChip,
                  selectedBranchFilter === 'ALL' && styles.filterTabChipActive,
                ]}
                onPress={() => setSelectedBranchFilter('ALL')}
              >
                <Building2 size={13} color={selectedBranchFilter === 'ALL' ? '#FFFFFF' : '#64748B'} />
                <Text
                  style={[
                    styles.filterTabChipText,
                    selectedBranchFilter === 'ALL' && styles.filterTabChipTextActive,
                  ]}
                >
                  All Branches ({displayList.length})
                </Text>
              </TouchableOpacity>

              {availableBranches.map((br) => {
                const count = displayList.filter(
                  (c) => c.branch && c.branch.toLowerCase().trim() === br.toLowerCase().trim(),
                ).length;
                const isSel = selectedBranchFilter.toLowerCase().trim() === br.toLowerCase().trim();
                return (
                  <TouchableOpacity
                    key={br}
                    style={[styles.filterTabChip, isSel && styles.filterTabChipActive]}
                    onPress={() => setSelectedBranchFilter(br)}
                  >
                    <MapPin size={13} color={isSel ? '#FFFFFF' : '#64748B'} />
                    <Text style={[styles.filterTabChipText, isSel && styles.filterTabChipTextActive]}>
                      {br} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Campaign Cards List */}
        <View style={{ gap: 14 }}>
          {filteredDisplayList.length === 0 ? (
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Megaphone size={36} color="#94A3B8" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#1E293B', marginTop: 12 }}>No Campaigns Found</Text>
              <Text style={{ fontSize: 12.5, color: '#64748B', textAlign: 'center', marginTop: 4, marginBottom: 16 }}>
                {selectedBranchFilter === 'ALL'
                  ? 'Create your first calling campaign to start distributing leads to your agents.'
                  : `No campaigns found for ${selectedBranchFilter} branch. Create one below.`}
              </Text>
              {!isAgent && (
                <TouchableOpacity
                  onPress={openNew}
                  style={{ backgroundColor: '#10B981', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>+ Create Campaign</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filteredDisplayList.map((camp) => {
              const isCampActive = activeStatusOverrides[camp._id] ?? camp.isActive;
              const dialedLeads = (camp as any).dialedLeads ?? 0;
              const totalLeads = camp.totalLeads;
              const progressPercent = totalLeads > 0 ? Math.min(100, Math.round((dialedLeads / totalLeads) * 100)) : 0;

            return (
              <View
                key={camp._id}
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
                {/* Top Row: Icon + Title & Badges */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                    <View
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 10,
                        backgroundColor: camp.iconBg,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Megaphone size={19} color={camp.iconColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }} numberOfLines={1}>
                        {camp.name}
                      </Text>
                      <Text style={{ fontSize: 11.5, color: '#64748B', marginTop: 1 }}>
                        {camp.distribution}
                      </Text>
                    </View>
                  </View>

                  {/* Running / Paused Pill & Branch & Priority */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {camp.branch ? (
                      <View style={styles.cardBranchBadge}>
                        <MapPin size={10} color="#2563EB" />
                        <Text style={styles.cardBranchBadgeText}>{camp.branch}</Text>
                      </View>
                    ) : (
                      <View style={[styles.cardBranchBadge, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}>
                        <Globe size={10} color="#64748B" />
                        <Text style={[styles.cardBranchBadgeText, { color: '#64748B' }]}>Global HQ</Text>
                      </View>
                    )}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 12,
                        backgroundColor: isCampActive ? '#ECFDF5' : '#F1F5F9',
                        borderWidth: 1,
                        borderColor: isCampActive ? '#A7F3D0' : '#E2E8F0',
                      }}
                    >
                      <View
                        style={{
                          width: 6.5,
                          height: 6.5,
                          borderRadius: 3.5,
                          backgroundColor: isCampActive ? '#10B981' : '#94A3B8',
                        }}
                      />
                      <Text
                        style={{
                          fontSize: 10.5,
                          fontWeight: '800',
                          color: isCampActive ? '#047857' : '#64748B',
                        }}
                      >
                        {isCampActive ? 'Running 🟢' : 'Paused ⏸️'}
                      </Text>
                    </View>

                    {camp.priority === 'High priority' ? (
                      <View style={{ backgroundColor: '#FEF2F2', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 }}>
                        <Text style={{ color: '#DC2626', fontSize: 10.5, fontWeight: '700' }}>🔥 High</Text>
                      </View>
                    ) : (
                      <View style={{ backgroundColor: '#FFFBEB', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 }}>
                        <Text style={{ color: '#D97706', fontSize: 10.5, fontWeight: '700' }}>☀️ Med</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Progress Bar Section */}
                <View
                  style={{
                    backgroundColor: '#F8FAFC',
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: '#F1F5F9',
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B' }}>
                      CALLING PROGRESS
                    </Text>
                    <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#0F172A' }}>
                      {progressPercent}% ({dialedLeads} / {camp.totalLeads})
                    </Text>
                  </View>
                  <View style={{ height: 7, backgroundColor: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
                    <View
                      style={{
                        width: `${progressPercent}%`,
                        height: '100%',
                        backgroundColor: '#10B981',
                        borderRadius: 4,
                      }}
                    />
                  </View>
                </View>

                {/* Metrics Row */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: '#FFFFFF',
                      borderRadius: 8,
                      padding: 8,
                      borderWidth: 1,
                      borderColor: '#E2E8F0',
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>
                      Total Leads
                    </Text>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A', marginTop: 2 }}>
                      {camp.totalLeads.toLocaleString()}
                    </Text>
                  </View>

                  <View
                    style={{
                      flex: 1,
                      backgroundColor: '#FFFFFF',
                      borderRadius: 8,
                      padding: 8,
                      borderWidth: 1,
                      borderColor: '#E2E8F0',
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>
                      Assigned Agents
                    </Text>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#4F46E5', marginTop: 2 }}>
                      {camp.assignedAgentsCount}
                    </Text>
                  </View>

                  <View
                    style={{
                      flex: 1,
                      backgroundColor: '#FFFFFF',
                      borderRadius: 8,
                      padding: 8,
                      borderWidth: 1,
                      borderColor: '#E2E8F0',
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>
                      Call Script
                    </Text>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#D97706', marginTop: 2 }}>
                      {camp.questionCount} Qs
                    </Text>
                  </View>
                </View>

                {/* Footer: Pause/Resume Switch + Action Buttons */}
                <View
                  style={{
                    paddingTop: 12,
                    borderTopWidth: 1,
                    borderTopColor: '#F1F5F9',
                    flexDirection: isWide ? 'row' : 'column',
                    alignItems: isWide ? 'center' : 'stretch',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Switch
                      value={isCampActive}
                      onValueChange={() => handleToggleActive(camp._id, isCampActive)}
                      trackColor={{ false: '#E2E8F0', true: '#10B981' }}
                      thumbColor="#FFFFFF"
                    />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: isCampActive ? '#047857' : '#64748B' }}>
                      {isCampActive ? 'Active Inbound & Queue' : 'Queue Paused'}
                    </Text>
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      justifyContent: isWide ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => openEdit(camp)}
                      activeOpacity={0.7}
                      style={{
                        flex: isWide ? undefined : 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5,
                        paddingHorizontal: 12,
                        height: 34,
                        borderRadius: 8,
                        backgroundColor: '#F8FAFC',
                        borderWidth: 1,
                        borderColor: '#CBD5E1',
                      }}
                    >
                      <Edit2 size={13} color="#334155" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155' }}>
                        Configure
                      </Text>
                    </TouchableOpacity>

                    {user?.role === 'ADMIN' && (
                      <TouchableOpacity
                        onPress={() => handleDeleteCampaign(camp._id, camp.name)}
                        disabled={deleteMutation.isPending}
                        activeOpacity={0.7}
                        style={{
                          flex: isWide ? undefined : 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 5,
                          paddingHorizontal: 12,
                          height: 34,
                          borderRadius: 8,
                          backgroundColor: '#FEF2F2',
                          borderWidth: 1,
                          borderColor: '#FECACA',
                        }}
                      >
                        <Trash2 size={13} color="#DC2626" />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#DC2626' }}>
                          Delete
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            );
          }))}
        </View>
      </ScrollView>

      {/* Campaign Create / Edit Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId ? 'Edit Campaign' : 'Create New Campaign'}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalInputLabel}>CAMPAIGN NAME</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Q4 Real Estate Outreach"
                placeholderTextColor="#94A3B8"
                value={name}
                onChangeText={setName}
              />

              {/* Branch Scope Section */}
              <Text style={[styles.inputLabel, { marginTop: 12 }]}>BRANCH SCOPE</Text>
              {isManager ? (
                <View style={styles.branchLockedBox}>
                  <Shield size={14} color="#6366F1" />
                  <Text style={styles.branchLockedText}>
                    📍 {user?.branch || 'My Branch'} (Branch Manager Locked)
                  </Text>
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                >
                  <TouchableOpacity
                    style={[styles.branchSelectChip, !branch && styles.branchSelectChipActive]}
                    onPress={() => setBranch(null)}
                  >
                    <Globe size={13} color={!branch ? '#FFFFFF' : '#64748B'} />
                    <Text style={[styles.branchSelectChipText, !branch && styles.branchSelectChipTextActive]}>
                      Global / HQ
                    </Text>
                  </TouchableOpacity>

                  {availableBranches.map((br) => {
                    const isSel = branch?.toLowerCase().trim() === br.toLowerCase().trim();
                    return (
                      <TouchableOpacity
                        key={br}
                        style={[styles.branchSelectChip, isSel && styles.branchSelectChipActive]}
                        onPress={() => setBranch(br)}
                      >
                        <MapPin size={13} color={isSel ? '#FFFFFF' : '#64748B'} />
                        <Text style={[styles.branchSelectChipText, isSel && styles.branchSelectChipTextActive]}>
                          {br}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {/* Assigned Branch Telecallers */}
              <Text style={[styles.inputLabel, { marginTop: 12 }]}>
                ASSIGNED TELECALLERS ({branch ? `${branch} Branch` : 'Global'})
              </Text>
              <ScrollView
                style={{
                  maxHeight: 120,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  borderRadius: 8,
                  padding: 6,
                  backgroundColor: '#F8FAFC',
                }}
                nestedScrollEnabled={true}
              >
                {agentsList
                  .filter((a) => !branch || (a.branch && a.branch.toLowerCase().trim() === branch.toLowerCase().trim()))
                  .map((agent) => {
                    const isSelected = selectedAgentIds.includes(agent._id);
                    return (
                      <TouchableOpacity
                        key={agent._id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingVertical: 7,
                          paddingHorizontal: 8,
                          borderRadius: 6,
                          backgroundColor: isSelected ? '#EFF6FF' : 'transparent',
                        }}
                        onPress={() => {
                          if (isSelected) {
                            setSelectedAgentIds(selectedAgentIds.filter((id) => id !== agent._id));
                          } else {
                            setSelectedAgentIds([...selectedAgentIds, agent._id]);
                          }
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                          <Users size={13} color={isSelected ? '#2563EB' : '#64748B'} />
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: isSelected ? '700' : '500',
                              color: isSelected ? '#1D4ED8' : '#334155',
                            }}
                            numberOfLines={1}
                          >
                            {agent.name} {agent.branch ? `(${agent.branch})` : ''}
                          </Text>
                        </View>
                        {isSelected && <Check size={14} color="#2563EB" strokeWidth={2.5} />}
                      </TouchableOpacity>
                    );
                  })}
                {agentsList.filter((a) => !branch || (a.branch && a.branch.toLowerCase().trim() === branch.toLowerCase().trim())).length === 0 && (
                  <View style={{ padding: 8 }}>
                    <Text style={{ fontSize: 11.5, color: '#64748B' }}>
                      No active agents in {branch || 'Global'}. Agents can also be auto-assigned via branch round robin.
                    </Text>
                  </View>
                )}
              </ScrollView>

              <Text style={[styles.inputLabel, { marginTop: 12 }]}>PRIORITY</Text>
              <View style={styles.prioritySelectorRow}>
                {(['HIGH', 'MEDIUM', 'LOW'] as CampaignPriority[]).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.pSelectBtn, priority === p && styles.pSelectBtnActive]}
                    onPress={() => setPriority(p)}
                  >
                    <Text style={[styles.pSelectText, priority === p && styles.pSelectTextActive]}>
                      {p}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.inputLabel, { marginTop: 12 }]}>LEAD DISTRIBUTION</Text>
              <View style={styles.prioritySelectorRow}>
                {(['EQUAL', 'CONDITIONAL'] as DistributionMode[]).map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.pSelectBtn, distributionMode === d && styles.pSelectBtnActive]}
                    onPress={() => setDistributionMode(d)}
                  >
                    <Text style={[styles.pSelectText, distributionMode === d && styles.pSelectTextActive]}>
                      {d}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Engagement Questionnaire Builder */}
              <View style={styles.questionsBuilder}>
                <View style={styles.questionsBuilderHeader}>
                  <Text style={styles.inputLabel}>CALL QUESTIONNAIRE ({questions.length})</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                      style={styles.addQBtn}
                      onPress={() => addQuestion('TEXT')}
                    >
                      <Text style={styles.addQText}>+ Text</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.addQBtn}
                      onPress={() => addQuestion('NUMBER')}
                    >
                      <Text style={styles.addQText}>+ Number</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.addQBtn}
                      onPress={() => addQuestion('MULTIPLE_CHOICE')}
                    >
                      <Text style={styles.addQText}>+ Choice</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {questions.map((q, idx) => (
                  <View key={q.id} style={styles.questionItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.qTypeBadge}>{q.type}</Text>
                      <TextInput
                        style={styles.qInput}
                        value={q.label}
                        onChangeText={(txt) => {
                          const updated = [...questions];
                          updated[idx].label = txt;
                          setQuestions(updated);
                        }}
                      />
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        setQuestions(questions.filter((_, i) => i !== idx));
                      }}
                    >
                      <X size={14} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.saveSubmitBtn}
              onPress={() => {
                const trimmedName = name.trim();
                if (!trimmedName || trimmedName.length < 2) {
                  Alert.alert('Validation Error', 'Campaign name must be at least 2 characters long.');
                  return;
                }
                saveMutation.mutate();
              }}
              disabled={saveMutation.isPending}
              activeOpacity={0.8}
            >
              {saveMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveSubmitText}>
                  {editingId ? 'Save Changes' : 'Create Campaign'}
                </Text>
              )}
            </TouchableOpacity>

            {editingId && user?.role === 'ADMIN' && (
              <TouchableOpacity
                style={{
                  marginTop: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 12,
                  borderRadius: 10,
                  backgroundColor: '#FEF2F2',
                  borderWidth: 1,
                  borderColor: '#FECACA',
                }}
                onPress={() => handleDeleteCampaign(editingId, name)}
                disabled={deleteMutation.isPending}
                activeOpacity={0.8}
              >
                <Trash2 size={16} color="#DC2626" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#DC2626' }}>
                  Delete Campaign
                </Text>
              </TouchableOpacity>
            )}
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
    marginBottom: 16,
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
  newCampaignBtn: {
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
  newCampaignText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  campaignCard: {
    flex: 1,
    minWidth: 280,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconSquare: {
    width: 38,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  priorityPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  priorityPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  campaignName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#047857',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  metricCol: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  distText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  questionsPill: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  questionsText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    gap: 5,
  },
  editText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0F172A',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
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
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
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
    fontSize: 13,
    color: '#0F172A',
    marginTop: 4,
  },
  prioritySelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  pSelectBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: 'center',
  },
  pSelectBtnActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  pSelectText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  pSelectTextActive: {
    color: '#2563EB',
    fontWeight: '700',
  },
  questionsBuilder: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  questionsBuilderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addQBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  addQText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB',
  },
  questionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    padding: 8,
    marginTop: 6,
    gap: 8,
  },
  qTypeBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
  },
  qInput: {
    fontSize: 12,
    color: '#0F172A',
    padding: 0,
    marginTop: 2,
  },
  modalInputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  filterTabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterTabChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  filterTabChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterTabChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  cardBranchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  cardBranchBadgeText: {
    color: '#1E40AF',
    fontSize: 10.5,
    fontWeight: '700',
  },
  branchLockedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 4,
  },
  branchLockedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  branchSelectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  branchSelectChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  branchSelectChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  branchSelectChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  saveSubmitBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 18,
  },
  saveSubmitText: {
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
