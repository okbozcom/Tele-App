import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Modal,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import {
  UploadCloud,
  ChevronDown,
  ShieldCheck,
  ShieldAlert,
  Check,
  Download,
  Users,
  FileSpreadsheet,
  CheckCircle2,
  X,
  Building2,
  MapPin,
  Shield,
  UserCheck,
  User as UserIcon,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

import { useAuthStore } from '../store/authStore';
import { fetchCampaigns, fetchUsers, fetchBranches, uploadLeadsCsv } from '../api/leadApi';
import { Campaign, User as UserType, Branch } from '../types';
import { colors } from '../theme';
import { CrmShell } from '../components/CrmShell';
import { toast } from '../store/toastStore';
import { storage } from '../utils/storage';
import { downloadOrShareCsv, SAMPLE_LEADS_TEMPLATE_CSV } from '../utils/csvDownloader';

export const UploadLeadsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAgent = user?.role === 'AGENT';
  const isManager = user?.role === 'MANAGER';
  const isAdmin = user?.role === 'ADMIN';

  // Branch Selection: Managers locked to their branch; Admin can select any branch or ALL
  const [selectedBranch, setSelectedBranch] = useState<string>(
    isManager && user?.branch ? user.branch : 'ALL',
  );

  const [selectedCampaignName, setSelectedCampaignName] = useState('');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [showCampaignDropdown, setShowCampaignDropdown] = useState(false);

  // NeoDove Distribution Strategy: ROUND_ROBIN | MANAGER | SPECIFIC_AGENT
  const [strategy, setStrategy] = useState<'ROUND_ROBIN' | 'MANAGER' | 'SPECIFIC_AGENT'>('ROUND_ROBIN');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);

  const [pickedFile, setPickedFile] = useState<{
    name: string;
    uri: string;
    size?: number;
    file?: File;
  } | null>(null);

  const [uploadResult, setUploadResult] = useState<{
    created: number;
    merged: number;
    skipped: number;
  } | null>(null);

  // Queries
  const { data: branchesData } = useQuery({
    queryKey: ['adminBranches'],
    queryFn: fetchBranches,
    enabled: !isAgent,
  });
  const branchesList: Branch[] = branchesData?.branches || [];

  const { data: usersData } = useQuery({
    queryKey: ['adminUsers'],
    queryFn: () => fetchUsers(),
    enabled: !isAgent,
  });
  const allUsers: UserType[] = usersData?.users || [];

  const availableBranches = React.useMemo(() => {
    const list = branchesList.map((b) => b.name);
    const fromUsers = allUsers.map((u) => u.branch).filter(Boolean) as string[];
    const defaults = ['Coimbatore', 'Trichy', 'Pudukkottai', 'Chennai', 'Madurai'];
    return Array.from(new Set([...list, ...fromUsers, ...defaults])).filter(Boolean);
  }, [branchesList, allUsers]);

  // Branch Manager for the currently selected branch
  const branchManager = React.useMemo(() => {
    if (selectedBranch === 'ALL') return null;
    const managers = allUsers.filter(
      (u) =>
        (u.role === 'MANAGER' || u.role === 'ADMIN') &&
        u.isActive &&
        u.branch &&
        u.branch.toLowerCase().trim() === selectedBranch.toLowerCase().trim(),
    );
    return managers.length > 0 ? managers[0] : null;
  }, [allUsers, selectedBranch]);

  // Telecallers in the currently selected branch
  const branchAgents = React.useMemo(() => {
    const all = allUsers.filter(
      (u) => u.role === 'AGENT' && u.isActive && u.canReceiveLeads !== false,
    );
    if (selectedBranch === 'ALL') return all;
    return all.filter(
      (u) => u.branch && u.branch.toLowerCase().trim() === selectedBranch.toLowerCase().trim(),
    );
  }, [allUsers, selectedBranch]);

  const selectedAgent = React.useMemo(() => {
    if (!selectedAgentId) return null;
    return branchAgents.find((u) => ((u as any).id || u._id) === selectedAgentId) || null;
  }, [branchAgents, selectedAgentId]);

  const { data: campaignsData } = useQuery({
    queryKey: ['adminCampaigns'],
    queryFn: fetchCampaigns,
    enabled: !isAgent,
  });
  const campaignsList: Campaign[] = campaignsData?.campaigns || [];

  const filteredCampaigns = React.useMemo(() => {
    if (selectedBranch === 'ALL') return campaignsList;
    return campaignsList.filter(
      (c) =>
        !c.branch ||
        c.branch.toLowerCase().trim() === selectedBranch.toLowerCase().trim(),
    );
  }, [campaignsList, selectedBranch]);

  const selectedCampaign = React.useMemo(() => {
    return campaignsList.find((c) => c._id === selectedCampaignId) || null;
  }, [campaignsList, selectedCampaignId]);

  const resolvedTargetName = React.useMemo(() => {
    if (strategy === 'SPECIFIC_AGENT') {
      return selectedAgent ? selectedAgent.name : 'Select Telecaller';
    }
    if (strategy === 'MANAGER') {
      return branchManager ? `${branchManager.name} (${selectedBranch} Manager)` : 'Branch Manager (Not assigned)';
    }
    return `Round Robin (${branchAgents.length} Agents)`;
  }, [strategy, selectedAgent, branchManager, branchAgents, selectedBranch]);

  React.useEffect(() => {
    if (filteredCampaigns.length > 0) {
      const match = filteredCampaigns.find((c) => c._id === selectedCampaignId);
      if (!match) {
        setSelectedCampaignId(filteredCampaigns[0]._id);
        setSelectedCampaignName(filteredCampaigns[0].name);
      }
    } else {
      setSelectedCampaignId('');
      setSelectedCampaignName('');
    }
  }, [filteredCampaigns, selectedCampaignId]);

  // Handle Document Picker
  const handlePickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        setPickedFile({
          name: asset.name,
          uri: asset.uri,
          size: asset.size,
          file: (asset as any).file,
        });
        setUploadResult(null);
      }
    } catch (err) {
      console.warn('Document picker error:', err);
    }
  };

  // Upload Mutation
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!pickedFile) throw new Error('Please pick a CSV file first');

      const formData = new FormData();
      let resolvedTargetId: string | null = null;

      if (strategy === 'SPECIFIC_AGENT') {
        if (!selectedAgentId) {
          throw new Error('Please select a specific telecaller from the list.');
        }
        resolvedTargetId = selectedAgentId;
      } else if (strategy === 'MANAGER') {
        const mgrId = branchManager?._id || (branchManager as any)?.id;
        if (!mgrId) {
          throw new Error(
            selectedBranch === 'ALL'
              ? 'Please select a specific branch first to assign to its Branch Manager.'
              : `No Branch Manager found for ${selectedBranch}. Please assign a manager or choose Round Robin.`,
          );
        }
        resolvedTargetId = mgrId;
      }

      if (resolvedTargetId) {
        formData.append('targetAgentId', resolvedTargetId);
      }

      if (Platform.OS === 'web') {
        if (pickedFile.file) {
          formData.append('file', pickedFile.file);
        } else {
          formData.append('file', new Blob(['name,phone\nRahul,9810000001'], { type: 'text/csv' }), pickedFile.name);
        }
      } else {
        formData.append('file', {
          uri: pickedFile.uri,
          name: pickedFile.name,
          type: 'text/csv',
        } as any);
      }

      const activeCampId = selectedCampaignId || filteredCampaigns[0]?._id;

      if (!activeCampId) {
        throw new Error('Please select an active campaign before uploading leads.');
      }

      return uploadLeadsCsv(activeCampId, formData);
    },
    onSuccess: async (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['myLeadsList'] });
      queryClient.invalidateQueries({ queryKey: ['homeDashboard'] });
      queryClient.invalidateQueries({ queryKey: ['homeUserCalls'] });
      const createdCount = data.created ?? 0;
      setUploadResult({
        created: createdCount,
        merged: data.merged ?? 0,
        skipped: data.skipped ?? 0,
      });

      // Show high-priority toast
      toast.success(
        `Successfully imported ${createdCount} leads into ${selectedCampaignName}!`,
        'CSV Uploaded',
        5000,
      );

      // Record agent assignment notification
      try {
        let notifTargetId: string | null = null;
        let notifTargetName = 'Round Robin';
        if (strategy === 'SPECIFIC_AGENT') {
          notifTargetId = selectedAgentId;
          notifTargetName = selectedAgent?.name || 'Selected Telecaller';
        } else if (strategy === 'MANAGER') {
          notifTargetId = branchManager?._id || (branchManager as any)?.id || null;
          notifTargetName = branchManager ? `${branchManager.name} (Manager)` : 'Branch Manager';
        } else {
          notifTargetName = `Round Robin (${branchAgents.length} Agents)`;
        }

        const notif = {
          id: 'assign-' + Date.now(),
          targetAgentId: notifTargetId,
          targetAgentName: notifTargetName,
          campaignName: selectedCampaignName,
          count: createdCount,
          assignedBy: user?.name || 'Admin',
          assignedRole: user?.role || 'ADMIN',
          timestamp: new Date().toISOString(),
          read: false,
        };
        const raw = await storage.getItem('tele_crm_assigned_lead_notifications');
        const list = raw ? JSON.parse(raw) : [];
        list.unshift(notif);
        await storage.setItem('tele_crm_assigned_lead_notifications', JSON.stringify(list.slice(0, 30)));
      } catch (err) {
        console.warn('Failed to save assignment notification', err);
      }

      if (Platform.OS !== 'web') {
        Alert.alert(
          'Upload Complete',
          `Successfully imported ${createdCount} leads into ${selectedCampaignName}!`,
        );
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Upload failed';
      toast.error(msg, 'Upload Failed', 5000);
      if (Platform.OS !== 'web') {
        Alert.alert('Upload Error', msg);
      }
    },
  });

  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      setIsDownloadingTemplate(true);
      const res = await downloadOrShareCsv('lead_upload_template.csv', SAMPLE_LEADS_TEMPLATE_CSV);
      if (res.success) {
        toast.success(res.message, 'Template Ready');
      } else {
        toast.error(res.message, 'Download Failed');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to download template', 'Error');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  if (isAgent) {
    return (
      <CrmShell
        title="Upload Leads"
        headerIcon={<UploadCloud size={15} color={colors.textSecondary} />}
        breadcrumb="Workspace"
      >
        <View style={styles.restrictedContainer}>
          <View style={styles.restrictedIconBox}>
            <ShieldAlert size={40} color="#E11D48" />
          </View>
          <Text style={styles.restrictedTitle}>Calling Workspace Only</Text>
          <Text style={styles.restrictedSubtitle}>
            Bulk lead ingestion and reassignment are restricted to Administrators and Managers. Agents receive leads automatically via round-robin allocation.
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
      title="Upload Leads"
      headerIcon={<UploadCloud size={15} color={colors.textSecondary} />}
      breadcrumb="Workspace"
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner Section */}
        <View style={styles.bannerRow}>
          <View>
            <Text style={styles.bannerTitle}>A fresh start for your pipeline</Text>
            <Text style={styles.bannerSubtitle}>
              Import and distribute leads to your team
            </Text>
          </View>

          <TouchableOpacity
            style={styles.templateBtn}
            onPress={handleDownloadTemplate}
            disabled={isDownloadingTemplate}
            activeOpacity={0.7}
          >
            {isDownloadingTemplate ? (
              <ActivityIndicator size="small" color="#0F172A" />
            ) : (
              <Download size={14} color="#0F172A" />
            )}
            <Text style={styles.templateBtnText}>
              {isDownloadingTemplate ? 'Downloading…' : 'CSV template'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Main Content Layout (Form on Left/Top, Summary Card on Right/Bottom) */}
        <View style={styles.contentLayout}>
          {/* Form Card */}
          <View style={styles.formCard}>
            {/* Step 1: Select Branch & Campaign */}
            <View style={styles.stepSection}>
              <View style={styles.stepHeaderRow}>
                <View style={styles.stepNumberBadge}>
                  <Text style={styles.stepNumberText}>1</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>Select Branch & Campaign</Text>
                  <Text style={styles.stepSubtitle}>Filter campaigns and leads by operational branch.</Text>
                </View>
              </View>

              {/* Branch Selector */}
              <View style={{ marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={styles.fieldLabel}>Branch Location</Text>
                  {isManager && (
                    <View style={styles.badgeLocked}>
                      <Shield size={11} color="#6366F1" />
                      <Text style={styles.badgeLockedText}>Manager Branch Locked</Text>
                    </View>
                  )}
                </View>

                {isAdmin ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                  >
                    <TouchableOpacity
                      style={[
                        styles.branchFilterChip,
                        selectedBranch === 'ALL' && styles.branchFilterChipActive,
                      ]}
                      onPress={() => setSelectedBranch('ALL')}
                    >
                      <Building2 size={13} color={selectedBranch === 'ALL' ? '#FFFFFF' : '#64748B'} />
                      <Text
                        style={[
                          styles.branchFilterChipText,
                          selectedBranch === 'ALL' && styles.branchFilterChipTextActive,
                        ]}
                      >
                        All Branches
                      </Text>
                    </TouchableOpacity>

                    {availableBranches.map((br) => {
                      const isSel = selectedBranch.toLowerCase().trim() === br.toLowerCase().trim();
                      return (
                        <TouchableOpacity
                          key={br}
                          style={[styles.branchFilterChip, isSel && styles.branchFilterChipActive]}
                          onPress={() => setSelectedBranch(br)}
                        >
                          <MapPin size={13} color={isSel ? '#FFFFFF' : '#64748B'} />
                          <Text style={[styles.branchFilterChipText, isSel && styles.branchFilterChipTextActive]}>
                            {br}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <View style={styles.managerBranchCard}>
                    <MapPin size={16} color="#4F46E5" />
                    <Text style={styles.managerBranchName}>{user?.branch || 'Headquarters'}</Text>
                    <Text style={styles.managerBranchRole}>({user?.role})</Text>
                  </View>
                )}
              </View>

              {/* Branch Info / Manager Card if specific branch is selected */}
              {selectedBranch !== 'ALL' && (
                <View style={styles.branchInfoCard}>
                  <View style={styles.branchInfoTopRow}>
                    <View style={styles.branchManagerAvatar}>
                      <UserCheck size={18} color="#047857" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.branchManagerLabel}>Branch Manager</Text>
                      <Text style={styles.branchManagerName}>
                        {branchManager ? branchManager.name : 'No Branch Manager Assigned'}
                      </Text>
                      {branchManager && (branchManager.phone || branchManager.email) ? (
                        <Text style={styles.branchManagerContact}>
                          {branchManager.phone || branchManager.email}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.branchAgentsBadge}>
                      <Users size={12} color="#2563EB" />
                      <Text style={styles.branchAgentsBadgeText}>
                        {branchAgents.length} {branchAgents.length === 1 ? 'Agent' : 'Agents'}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Campaign Picker */}
              <Text style={styles.fieldLabel}>Target Campaign</Text>
              <TouchableOpacity
                style={styles.dropdownTrigger}
                onPress={() => {
                  setShowCampaignDropdown(!showCampaignDropdown);
                  setShowAgentDropdown(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.dropdownValueText}>
                  {selectedCampaignName || (filteredCampaigns.length === 0 ? 'No campaigns available' : 'Select a campaign')}
                </Text>
                <ChevronDown size={16} color="#64748B" />
              </TouchableOpacity>

              {showCampaignDropdown && (
                <View style={styles.dropdownPopoverContained}>
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled={true}>
                    {filteredCampaigns.length === 0 ? (
                      <View style={{ padding: 14 }}>
                        <Text style={{ fontSize: 13, color: '#64748B', lineHeight: 18 }}>
                          No campaigns for {selectedBranch === 'ALL' ? 'this workspace' : selectedBranch}. Create a branch campaign in Campaigns first.
                        </Text>
                      </View>
                    ) : (
                      filteredCampaigns.map((c) => {
                        const isSel = selectedCampaignId === c._id;
                        return (
                          <TouchableOpacity
                            key={c._id}
                            style={styles.popoverItem}
                            onPress={() => {
                              setSelectedCampaignName(c.name);
                              setSelectedCampaignId(c._id);
                              setShowCampaignDropdown(false);
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[
                                  styles.popoverItemText,
                                  isSel && styles.popoverItemTextActive,
                                ]}
                              >
                                {c.name}
                              </Text>
                              <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                                {c.branch ? `📍 Branch: ${c.branch}` : '🌐 Global HQ'}
                              </Text>
                            </View>
                            {isSel && <Check size={14} color="#2563EB" strokeWidth={2.5} />}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Step 2: Distribution Strategy (NeoDove CRM Style) */}
            <View style={styles.stepSection}>
              <View style={styles.stepHeaderRow}>
                <View style={styles.stepNumberBadge}>
                  <Text style={styles.stepNumberText}>2</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>Assign Your Leads</Text>
                  <Text style={styles.stepSubtitle}>
                    Choose how leads are distributed (Auto Round-Robin, Manager Desk, or Single Agent).
                  </Text>
                </View>
              </View>

              <View style={{ gap: 10, marginTop: 4 }}>
                {/* Option 1: Round Robin */}
                <TouchableOpacity
                  style={[
                    styles.strategyCard,
                    strategy === 'ROUND_ROBIN' && styles.strategyCardActive,
                  ]}
                  onPress={() => {
                    setStrategy('ROUND_ROBIN');
                    setSelectedAgentId(null);
                    setShowAgentDropdown(false);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.strategyRadio}>
                    {strategy === 'ROUND_ROBIN' && <View style={styles.strategyRadioInner} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[styles.strategyTitle, strategy === 'ROUND_ROBIN' && styles.strategyTitleActive]}>
                        Auto Distribute (Round Robin)
                      </Text>
                      <View style={styles.strategyTag}>
                        <Text style={styles.strategyTagText}>{branchAgents.length} Active</Text>
                      </View>
                    </View>
                    <Text style={styles.strategyDesc}>
                      Divides leads equally across all active telecallers in {selectedBranch === 'ALL' ? 'the team' : selectedBranch}.
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Option 2: Assign to Branch Manager */}
                <TouchableOpacity
                  style={[
                    styles.strategyCard,
                    strategy === 'MANAGER' && styles.strategyCardActive,
                  ]}
                  onPress={() => {
                    setStrategy('MANAGER');
                    setSelectedAgentId(null);
                    setShowAgentDropdown(false);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.strategyRadio}>
                    {strategy === 'MANAGER' && <View style={styles.strategyRadioInner} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[styles.strategyTitle, strategy === 'MANAGER' && styles.strategyTitleActive]}>
                        Assign to Branch Manager Desk
                      </Text>
                      {branchManager && (
                        <View style={[styles.strategyTag, { backgroundColor: '#ECFDF5' }]}>
                          <Text style={[styles.strategyTagText, { color: '#047857' }]}>
                            {branchManager.name}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.strategyDesc}>
                      All leads go directly to {branchManager ? branchManager.name : 'the Branch Manager'}. The manager can review and reassign batches to agents later.
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Option 3: Specific Telecaller */}
                <TouchableOpacity
                  style={[
                    styles.strategyCard,
                    strategy === 'SPECIFIC_AGENT' && styles.strategyCardActive,
                  ]}
                  onPress={() => {
                    setStrategy('SPECIFIC_AGENT');
                    if (!selectedAgentId && branchAgents.length > 0) {
                      setSelectedAgentId((branchAgents[0] as any).id || branchAgents[0]._id);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.strategyRadio}>
                    {strategy === 'SPECIFIC_AGENT' && <View style={styles.strategyRadioInner} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[styles.strategyTitle, strategy === 'SPECIFIC_AGENT' && styles.strategyTitleActive]}>
                        Assign to Specific Telecaller
                      </Text>
                      {selectedAgent && (
                        <View style={[styles.strategyTag, { backgroundColor: '#EFF6FF' }]}>
                          <Text style={[styles.strategyTagText, { color: '#1E40AF' }]}>
                            {selectedAgent.name}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.strategyDesc}>
                      Direct 100% of uploaded numbers exclusively to one selected agent.
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Agent Dropdown if SPECIFIC_AGENT is selected */}
                {strategy === 'SPECIFIC_AGENT' && (
                  <View style={styles.specificAgentBox}>
                    <Text style={styles.fieldLabel}>Select Telecaller ({branchAgents.length} available)</Text>
                    <TouchableOpacity
                      style={styles.dropdownTrigger}
                      onPress={() => setShowAgentDropdown(!showAgentDropdown)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <Users size={16} color="#2563EB" />
                        <Text style={styles.dropdownValueText}>
                          {selectedAgent
                            ? `${selectedAgent.name} ${selectedAgent.phone ? `(${selectedAgent.phone})` : ''}`
                            : 'Choose an agent'}
                        </Text>
                      </View>
                      <ChevronDown size={16} color="#64748B" />
                    </TouchableOpacity>

                    {showAgentDropdown && (
                      <View style={styles.dropdownPopoverContained}>
                        <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled={true}>
                          {branchAgents.length === 0 ? (
                            <View style={{ padding: 12 }}>
                              <Text style={{ fontSize: 13, color: '#64748B' }}>
                                No active telecallers found in {selectedBranch === 'ALL' ? 'the workspace' : selectedBranch}.
                              </Text>
                            </View>
                          ) : (
                            branchAgents.map((ag) => {
                              const agId = (ag as any).id || ag._id;
                              const isSel = selectedAgentId === agId;
                              return (
                                <TouchableOpacity
                                  key={agId}
                                  style={styles.popoverItem}
                                  onPress={() => {
                                    setSelectedAgentId(agId);
                                    setShowAgentDropdown(false);
                                  }}
                                >
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                    <Users size={15} color={isSel ? '#2563EB' : '#64748B'} />
                                    <View>
                                      <Text
                                        style={[
                                          styles.popoverItemText,
                                          isSel && styles.popoverItemTextActive,
                                        ]}
                                      >
                                        {ag.name}
                                      </Text>
                                      <Text style={{ fontSize: 10.5, color: '#94A3B8' }}>
                                        {ag.branch ? `Branch: ${ag.branch}` : 'Unassigned Branch'} • {ag.phone || ag.email}
                                      </Text>
                                    </View>
                                  </View>
                                  {isSel && <Check size={14} color="#2563EB" strokeWidth={2.5} />}
                                </TouchableOpacity>
                              );
                            })
                          )}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </View>

            {/* Step 3: Upload your CSV */}
            <View style={[styles.stepSection, { borderBottomWidth: 0 }]}>
              <View style={styles.stepHeaderRow}>
                <View style={styles.stepNumberBadge}>
                  <Text style={styles.stepNumberText}>3</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>Upload CSV & Distribute</Text>
                  <Text style={styles.stepSubtitle}>CSV requires name and phone columns.</Text>
                </View>
              </View>

              {/* Assignment Summary Bar */}
              <View style={styles.assignmentSummaryBar}>
                <View style={styles.summaryBarPill}>
                  <MapPin size={12} color="#4F46E5" />
                  <Text style={styles.summaryBarPillText}>{selectedBranch === 'ALL' ? 'All Branches' : selectedBranch}</Text>
                </View>
                <View style={styles.summaryBarPill}>
                  <FileSpreadsheet size={12} color="#059669" />
                  <Text style={styles.summaryBarPillText}>{selectedCampaignName || 'Campaign'}</Text>
                </View>
                <View style={[styles.summaryBarPill, { flex: 1 }]}>
                  <UserIcon size={12} color="#D97706" />
                  <Text style={styles.summaryBarPillText} numberOfLines={1}>{resolvedTargetName}</Text>
                </View>
              </View>

              {/* Dotted Upload Dropzone Box */}
              <TouchableOpacity
                onPress={handlePickDocument}
                activeOpacity={0.7}
                style={[
                  styles.dottedDropzoneBox,
                  pickedFile && styles.dottedDropzoneBoxReady,
                ]}
              >
                <View
                  style={[
                    styles.dropzoneIconCircle,
                    pickedFile && styles.dropzoneIconCircleReady,
                  ]}
                >
                  <UploadCloud size={26} color={pickedFile ? '#10B981' : '#4F46E5'} />
                </View>
                <Text style={styles.dropzoneTitleText}>
                  {pickedFile ? pickedFile.name : 'Tap to Select CSV File'}
                </Text>
                <Text style={styles.dropzoneSubText}>
                  {pickedFile
                    ? `Ready for ingest (${pickedFile.size ? (pickedFile.size / 1024).toFixed(1) + ' KB' : 'Standard CSV'})`
                    : 'Standard CSV with columns: name, phone'}
                </Text>

                {pickedFile && (
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      setPickedFile(null);
                    }}
                    style={styles.clearFileBtn}
                  >
                    <X size={12} color="#EF4444" />
                    <Text style={styles.clearFileBtnText}>Clear File</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>

              {/* Action Button: Upload & distribute leads */}
              <TouchableOpacity
                onPress={() => uploadMutation.mutate()}
                disabled={uploadMutation.isPending || !pickedFile}
                activeOpacity={0.8}
                style={[
                  styles.primarySubmitBtn,
                  (!pickedFile || uploadMutation.isPending) && styles.primarySubmitBtnDisabled,
                ]}
              >
                {uploadMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <UploadCloud size={18} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.primarySubmitBtnText}>Upload & Distribute Leads</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Distribution Preview Card (Right Column) */}
          <View style={styles.previewCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Users size={18} color="#4F46E5" />
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }}>
                DISTRIBUTION PREVIEW
              </Text>
            </View>

            <View style={{ gap: 10, marginBottom: 16 }}>
              <View style={styles.previewMetaRow}>
                <Text style={styles.previewMetaLabel}>Target Branch</Text>
                <View style={styles.previewMetaValuePill}>
                  <MapPin size={11} color="#4F46E5" />
                  <Text style={styles.previewMetaValue}>{selectedBranch === 'ALL' ? 'All Branches' : selectedBranch}</Text>
                </View>
              </View>

              <View style={styles.previewMetaRow}>
                <Text style={styles.previewMetaLabel}>Campaign</Text>
                <Text style={[styles.previewMetaValue, { fontWeight: '700' }]}>{selectedCampaignName || 'None'}</Text>
              </View>

              <View style={styles.previewMetaRow}>
                <Text style={styles.previewMetaLabel}>Strategy</Text>
                <Text style={[styles.previewMetaValue, { color: '#2563EB', fontWeight: '700' }]}>
                  {strategy === 'ROUND_ROBIN'
                    ? 'Round Robin'
                    : strategy === 'MANAGER'
                    ? 'Branch Manager Desk'
                    : 'Specific Telecaller'}
                </Text>
              </View>

              <View style={styles.previewMetaRow}>
                <Text style={styles.previewMetaLabel}>Lead Receiver</Text>
                <Text style={[styles.previewMetaValue, { fontWeight: '800', color: '#059669' }]}>
                  {resolvedTargetName}
                </Text>
              </View>
            </View>

            {/* Agent Roster Preview */}
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: 8 }}>
              Eligible Branch Telecallers ({branchAgents.length})
            </Text>

            <View style={{ gap: 8, marginBottom: 16 }}>
              {strategy === 'SPECIFIC_AGENT' && selectedAgent ? (
                <View style={styles.rosterCardTargeted}>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#047857' }}>
                      {selectedAgent.name}
                    </Text>
                    <Text style={{ fontSize: 10.5, color: '#065F46' }}>
                      {selectedAgent.phone || selectedAgent.email}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#059669' }}>
                    100% Leads
                  </Text>
                </View>
              ) : strategy === 'MANAGER' && branchManager ? (
                <View style={styles.rosterCardTargeted}>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#047857' }}>
                      {branchManager.name} (Manager Desk)
                    </Text>
                    <Text style={{ fontSize: 10.5, color: '#065F46' }}>
                      Receives batch for subsequent agent assignment
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#059669' }}>
                    100% Leads
                  </Text>
                </View>
              ) : branchAgents.length === 0 ? (
                <View style={{ padding: 12, backgroundColor: '#FEF2F2', borderRadius: 8 }}>
                  <Text style={{ fontSize: 12, color: '#DC2626' }}>
                    No active agents in {selectedBranch === 'ALL' ? 'the workspace' : selectedBranch}.
                  </Text>
                </View>
              ) : (
                branchAgents.slice(0, 5).map((ag) => {
                  const pct = Math.round(100 / Math.min(branchAgents.length, 5));
                  const agId = (ag as any).id || ag._id;
                  return (
                    <View key={agId} style={styles.rosterAgentRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' }} />
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#0F172A' }} numberOfLines={1}>
                          {ag.name}
                        </Text>
                        {ag.branch && (
                          <Text style={{ fontSize: 10, color: '#64748B' }}>
                            ({ag.branch})
                          </Text>
                        )}
                      </View>
                      <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#4F46E5' }}>
                        ~{pct}% Share
                      </Text>
                    </View>
                  );
                })
              )}
            </View>

            {/* Hygiene Checks */}
            <View style={{ borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 12, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Check size={13} color="#10B981" />
                <Text style={{ fontSize: 11.5, color: '#64748B' }}>DND & duplicates automatically deduped</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Check size={13} color="#10B981" />
                <Text style={{ fontSize: 11.5, color: '#64748B' }}>Immediate push notification to callers</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Check size={13} color="#10B981" />
                <Text style={{ fontSize: 11.5, color: '#64748B' }}>Branch-level isolation strictly enforced</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Success Modal with Checkmark + Stats */}
      {uploadResult && (
        <Modal
          visible={Boolean(uploadResult)}
          transparent
          animationType="fade"
          onRequestClose={() => setUploadResult(null)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 20,
            }}
          >
            <View
              style={{
                width: '100%',
                maxWidth: 400,
                backgroundColor: '#FFFFFF',
                borderRadius: 20,
                padding: 24,
                alignItems: 'center',
                shadowColor: '#0F172A',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.15,
                shadowRadius: 16,
                elevation: 10,
              }}
            >
              {/* Green Checkmark Circle */}
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: '#ECFDF5',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: '#A7F3D0',
                  marginBottom: 16,
                }}
              >
                <CheckCircle2 size={36} color="#10B981" />
              </View>

              <Text style={{ fontSize: 19, fontWeight: '800', color: '#0F172A', textAlign: 'center' }}>
                Batch Ingest Complete!
              </Text>
              <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 4 }}>
                Leads successfully imported into{' '}
                <Text style={{ fontWeight: '700', color: '#0F172A' }}>{selectedCampaignName}</Text>
              </Text>

              {/* 3 Stats Badges */}
              <View style={{ flexDirection: 'row', gap: 8, marginVertical: 20, width: '100%' }}>
                <View
                  style={{
                    flex: 1,
                    backgroundColor: '#F0FDF4',
                    borderRadius: 10,
                    padding: 10,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: '#BBF7D0',
                  }}
                >
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#15803D' }}>
                    +{uploadResult.created}
                  </Text>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#166534', marginTop: 2 }}>
                    NEW LEADS
                  </Text>
                </View>

                <View
                  style={{
                    flex: 1,
                    backgroundColor: '#FFFBEB',
                    borderRadius: 10,
                    padding: 10,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: '#FDE68A',
                  }}
                >
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#B45309' }}>
                    {uploadResult.merged}
                  </Text>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#92400E', marginTop: 2 }}>
                    UPDATED
                  </Text>
                </View>

                <View
                  style={{
                    flex: 1,
                    backgroundColor: '#F8FAFC',
                    borderRadius: 10,
                    padding: 10,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                  }}
                >
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#64748B' }}>
                    {uploadResult.skipped}
                  </Text>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#475569', marginTop: 2 }}>
                    SKIPPED
                  </Text>
                </View>
              </View>

              {/* CTAs */}
              <TouchableOpacity
                onPress={() => {
                  setUploadResult(null);
                  setPickedFile(null);
                  navigation.navigate('Home');
                }}
                activeOpacity={0.8}
                style={{
                  width: '100%',
                  height: 50,
                  backgroundColor: '#10B981',
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 10,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>
                  📞 View Live Calling Queue
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setUploadResult(null);
                  setPickedFile(null);
                }}
                activeOpacity={0.7}
                style={{
                  width: '100%',
                  height: 44,
                  backgroundColor: '#F8FAFC',
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748B' }}>
                  Upload Another CSV File
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
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
  templateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  templateBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  contentLayout: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    alignItems: 'flex-start',
  },
  formCard: {
    flex: 2,
    minWidth: 300,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  stepSection: {
    paddingBottom: 20,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  stepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  stepNumberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  stepNumberText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2563EB',
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  stepSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 14,
    height: 42,
    backgroundColor: '#FFFFFF',
  },
  dropdownValueText: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  badgeLocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeLockedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4F46E5',
  },
  branchFilterChip: {
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
  branchFilterChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  branchFilterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  branchFilterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  managerBranchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  managerBranchName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3730A3',
  },
  managerBranchRole: {
    fontSize: 11,
    color: '#6366F1',
    fontWeight: '600',
  },
  branchInfoCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  branchInfoTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  branchManagerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  branchManagerLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#15803D',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  branchManagerName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  branchManagerContact: {
    fontSize: 11,
    color: '#64748B',
  },
  branchAgentsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  branchAgentsBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E40AF',
  },
  dropdownPopoverContained: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    marginTop: 4,
    overflow: 'hidden',
    zIndex: 100,
    elevation: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  strategyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  strategyCardActive: {
    borderColor: '#3B82F6',
    backgroundColor: '#F8FAFC',
  },
  strategyRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  strategyRadioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#2563EB',
  },
  strategyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  strategyTitleActive: {
    color: '#1D4ED8',
    fontWeight: '800',
  },
  strategyDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 3,
    lineHeight: 16,
  },
  strategyTag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  strategyTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  specificAgentBox: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  assignmentSummaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 8,
    flexWrap: 'wrap',
  },
  summaryBarPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  summaryBarPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  dottedDropzoneBox: {
    borderWidth: 2,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    marginBottom: 16,
  },
  dottedDropzoneBoxReady: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  dropzoneIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  dropzoneIconCircleReady: {
    backgroundColor: '#DCFCE7',
  },
  dropzoneTitleText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  dropzoneSubText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
  },
  clearFileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: '#FEE2E2',
  },
  clearFileBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  primarySubmitBtn: {
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
  },
  primarySubmitBtnDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
    elevation: 0,
  },
  primarySubmitBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  previewCard: {
    flex: 1.2,
    minWidth: 280,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  previewMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  previewMetaLabel: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  previewMetaValue: {
    fontSize: 12.5,
    color: '#0F172A',
    fontWeight: '600',
  },
  previewMetaValuePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  rosterCardTargeted: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  rosterAgentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dropdownPopover: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    marginTop: 4,
    paddingVertical: 4,
    maxHeight: 220,
    zIndex: 100,
    elevation: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  popoverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  popoverItemText: {
    fontSize: 12,
    color: '#475569',
  },
  popoverItemTextActive: {
    fontWeight: '700',
    color: '#2563EB',
  },
  agentPillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  agentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  agentPillActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  agentPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  agentPillTextActive: {
    color: '#2563EB',
    fontWeight: '700',
  },
  dottedDropzone: {
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    borderStyle: 'dashed',
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
    gap: 4,
    marginBottom: 16,
  },
  dropzoneIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  dropzoneTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  dropzoneSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
  },
  uploadSubmitBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 12,
    gap: 8,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  uploadSubmitText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  infoCard: {
    flex: 1,
    minWidth: 260,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  infoShieldBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 14,
  },
  checklist: {
    gap: 10,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
  },
  infoDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 18,
  },
  summaryRow: {
    gap: 4,
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
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
