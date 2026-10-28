import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  TextInput,
  StyleSheet,
  Modal,
  Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Search,
  Plus,
  X,
  Edit2,
  Trash2,
  MapPin,
  Shield,
  ShieldAlert,
  Building2,
  Phone,
  Mail,
  UserCheck,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

import {
  fetchUsers,
  createUser,
  updateUser,
  deleteUser,
  fetchBranches,
  createBranch,
  deleteBranch,
} from '../api/leadApi';
import { User, UserRole, Branch } from '../types';
import { colors } from '../theme';
import { CrmShell } from '../components/CrmShell';
import { useAuthStore } from '../store/authStore';

interface DisplayMember {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  branch?: string | null;
  isActive: boolean;
  canReceiveLeads: boolean;
}

export const TeamScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const isAgent = currentUser?.role === 'AGENT';
  const isManager = currentUser?.role === 'MANAGER';
  const isAdmin = currentUser?.role === 'ADMIN';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>(
    isManager && currentUser?.branch ? currentUser.branch : 'ALL',
  );
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddBranchModal, setShowAddBranchModal] = useState(false);
  const [editingMember, setEditingMember] = useState<DisplayMember | null>(null);

  // New Branch Form
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchCode, setNewBranchCode] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');

  // New Agent Form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(
    currentUser?.role === 'MANAGER' ? 'AGENT' : 'AGENT',
  );
  const [branch, setBranch] = useState<string>(
    currentUser?.branch || 'Trichy',
  );

  // Dynamic Branches Query
  const { data: branchesData } = useQuery({
    queryKey: ['adminBranches'],
    queryFn: fetchBranches,
    enabled: !isAgent,
  });
  const branchesList: Branch[] = branchesData?.branches || [];

  const availableBranchNames = useMemo(() => {
    const fromApi = branchesList.map((b) => b.name);
    const defaults = ['Trichy', 'Pudukkottai', 'Chennai', 'Madurai'];
    return Array.from(new Set([...defaults, ...fromApi])).filter(Boolean);
  }, [branchesList]);

  // Queries
  const { data: usersData, refetch } = useQuery({
    queryKey: ['adminUsers'],
    queryFn: () => fetchUsers(),
    enabled: !isAgent,
  });

  // Local switch overrides so the UI responds instantaneously
  const [receiveLeadsOverrides, setReceiveLeadsOverrides] = useState<Record<string, boolean>>({});

  // Mutations
  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      setShowAddModal(false);
      setName('');
      setEmail('');
      setPhone('');
      setPassword('');
      Alert.alert(
        'Member Created',
        `New member has been created and assigned to ${
          currentUser?.role === 'MANAGER' ? currentUser.branch || 'your branch' : branch
        }.`,
      );
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Failed to create member';
      Alert.alert('Error', msg);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<User> }) => updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      setEditingMember(null);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Failed to update member';
      Alert.alert('Update Failed', msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: (res, deletedId) => {
      // Optimistically remove from React Query cache immediately
      queryClient.setQueryData(['adminUsers'], (oldData: any) => {
        if (!oldData || !Array.isArray(oldData.users)) return oldData;
        return {
          ...oldData,
          users: oldData.users.filter((u: User) => u._id !== deletedId),
        };
      });
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      Alert.alert('Member Deleted', res.message || 'Team member has been removed.');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Failed to delete member';
      Alert.alert('Delete Failed', msg);
    },
  });

  const handleDeleteMember = (member: DisplayMember) => {
    if (member._id === currentUser?._id) {
      Alert.alert('Action Denied', 'You cannot delete your own account.');
      return;
    }

    const confirmAction = () => {
      deleteMutation.mutate(member._id);
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `Are you sure you want to delete ${member.name} (${member.role})?\n\nTheir active leads will be automatically preserved and reassigned to active team members in ${member.branch || 'their branch'}.`,
      );
      if (confirmed) {
        confirmAction();
      }
    } else {
      Alert.alert(
        'Delete Member',
        `Are you sure you want to delete ${member.name}? Their active leads will be automatically preserved and reassigned.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: confirmAction },
        ],
      );
    }
  };

  const createBranchMutation = useMutation({
    mutationFn: () =>
      createBranch({
        name: newBranchName.trim(),
        code: newBranchCode.trim(),
        address: newBranchAddress.trim(),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['adminBranches'] });
      setShowAddBranchModal(false);
      setNewBranchName('');
      setNewBranchCode('');
      setNewBranchAddress('');
      Alert.alert(
        'Branch Created',
        `Branch "${res.branch?.name || newBranchName}" has been created successfully.`,
      );
      if (res.branch?.name) {
        setSelectedBranch(res.branch.name);
        setBranch(res.branch.name);
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Failed to create branch';
      Alert.alert('Error', msg);
    },
  });

  // Combined list
  const combinedMembers: DisplayMember[] = useMemo(() => {
    const realUsers = usersData?.users || [];
    return realUsers.map((u: User) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      phone: u.phone || '',
      role: u.role,
      branch: u.branch || null,
      isActive: u.isActive,
      canReceiveLeads:
        receiveLeadsOverrides[u._id] !== undefined
          ? receiveLeadsOverrides[u._id]
          : u.canReceiveLeads ?? true,
    }));
  }, [usersData, receiveLeadsOverrides]);

  // Filtered members by search query AND branch (strict isolation for managers)
  const filteredMembers = useMemo(() => {
    let list = combinedMembers;

    if (isManager && currentUser?.branch) {
      // MANAGER: strictly scoped to own branch and AGENT role only
      list = list.filter((m) => m.branch === currentUser.branch && m.role === 'AGENT');
    } else if (selectedBranch !== 'ALL') {
      list = list.filter((m) => (m.branch || '').toLowerCase() === selectedBranch.toLowerCase());
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          m.phone.includes(q) ||
          (m.branch && m.branch.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [combinedMembers, searchQuery, selectedBranch, isManager, currentUser]);

  // Counts
  const totalCount = combinedMembers.length;
  const agentCount = combinedMembers.filter((m) => m.role === 'AGENT').length;

  const handleToggleReceiveLeads = (member: DisplayMember) => {
    const newValue = !member.canReceiveLeads;
    setReceiveLeadsOverrides((prev) => ({ ...prev, [member._id]: newValue }));
    if (!member._id.startsWith('user-')) {
      updateMutation.mutate({
        id: member._id,
        data: { canReceiveLeads: newValue },
      });
    }
  };

  const handleOpenAddModal = () => {
    setName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setRole('AGENT');
    setBranch(
      currentUser?.role === 'MANAGER'
        ? currentUser.branch || 'Trichy'
        : availableBranchNames[0] || 'Trichy',
    );
    setShowAddModal(true);
  };

  if (isAgent) {
    return (
      <CrmShell
        title="Team Members"
        headerIcon={<Users size={15} color={colors.textSecondary} />}
        breadcrumb="Workspace"
      >
        <View style={styles.restrictedContainer}>
          <View style={styles.restrictedIconBox}>
            <ShieldAlert size={40} color="#E11D48" />
          </View>
          <Text style={styles.restrictedTitle}>Calling Workspace Only</Text>
          <Text style={styles.restrictedSubtitle}>
            Team member roster and privilege controls are managed by Administrators and Branch Managers. Agents make calls directly from their queue.
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
      title="Team Members"
      headerIcon={<Users size={15} color={colors.textSecondary} />}
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
            <Text style={styles.bannerTitle}>
              {isManager
                ? `${currentUser?.branch || ''} Branch Team`
                : 'Your team, connected'}
            </Text>
            <Text style={styles.bannerSubtitle}>
              {isManager
                ? `${filteredMembers.length} active agents in ${currentUser?.branch || 'your'} branch`
                : `${totalCount} team members across branches · ${agentCount} active agents`}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {isAdmin && (
              <TouchableOpacity
                style={[styles.addAgentBtn, { backgroundColor: '#0D9488' }]}
                onPress={() => setShowAddBranchModal(true)}
                activeOpacity={0.8}
              >
                <Building2 size={14} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.addAgentText}>+ Branch</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.addAgentBtn}
              onPress={handleOpenAddModal}
              activeOpacity={0.8}
            >
              <Plus size={14} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.addAgentText}>
                {isManager ? `Add ${currentUser?.branch || ''} Agent` : 'Add Member'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Branch Filter Tabs Bar (Admin only - Managers are locked to their branch) */}
        {isAdmin && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.branchTabsRow}
          >
            <TouchableOpacity
              style={[styles.branchTab, selectedBranch === 'ALL' && styles.branchTabActive]}
              onPress={() => setSelectedBranch('ALL')}
              activeOpacity={0.8}
            >
              <Text
                style={[styles.branchTabText, selectedBranch === 'ALL' && styles.branchTabTextActive]}
              >
                All Branches ({totalCount})
              </Text>
            </TouchableOpacity>

            {availableBranchNames.map((bName) => {
              const count = combinedMembers.filter(
                (m) => (m.branch || '').toLowerCase() === bName.toLowerCase(),
              ).length;
              const isSelected = selectedBranch.toLowerCase() === bName.toLowerCase();
              return (
                <TouchableOpacity
                  key={bName}
                  style={[styles.branchTab, isSelected && styles.branchTabActive]}
                  onPress={() => setSelectedBranch(bName)}
                  activeOpacity={0.8}
                >
                  <MapPin size={12} color={isSelected ? '#0F766E' : '#64748B'} />
                  <Text
                    style={[
                      styles.branchTabText,
                      isSelected && styles.branchTabTextActive,
                    ]}
                  >
                    {bName} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.branchTab, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
              onPress={() => setShowAddBranchModal(true)}
              activeOpacity={0.8}
            >
              <Plus size={12} color="#16A34A" strokeWidth={2.5} />
              <Text style={[styles.branchTabText, { color: '#16A34A', fontWeight: '700' }]}>
                Add Branch
              </Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* Search & Active Status Bar */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <Search size={15} color="#94A3B8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, email or branch..."
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

          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.statusBadgeText}>
              {isManager
                ? `${currentUser?.branch || ''} branch active`
                : selectedBranch === 'ALL'
                ? 'All branches active'
                : `${selectedBranch} branch active`}
            </Text>
          </View>
        </View>

        {/* Roster Cards List */}
        <View style={{ gap: 12 }}>
          {filteredMembers.length === 0 ? (
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 14,
                padding: 32,
                borderWidth: 1,
                borderColor: '#E2E8F0',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={40} color="#94A3B8" />
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2937', marginTop: 12 }}>
                No Team Members Found
              </Text>
              <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 6 }}>
                {searchQuery ? 'No members match your search criteria.' : 'No members registered yet in this branch.'}
              </Text>
            </View>
          ) : (
            filteredMembers.map((item) => {
            const nameParts = typeof item.name === 'string' ? item.name.trim().split(/\s+/).filter(Boolean) : [];
            const initials =
              nameParts.length >= 2
                ? (nameParts[0][0] + nameParts[1][0]).toUpperCase()
                : nameParts.length === 1
                ? nameParts[0].substring(0, 2).toUpperCase()
                : 'MB';

            return (
              <View
                key={item._id}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 12,
                  padding: 10,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  shadowColor: '#0F172A',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.04,
                  shadowRadius: 3,
                  elevation: 1,
                }}
              >
                {/* Card Top: Avatar, Name, Role & Edit */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: item.role === 'ADMIN' ? '#EFF6FF' : item.role === 'MANAGER' ? '#F5F3FF' : '#ECFDF5',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: item.role === 'ADMIN' ? '#BFDBFE' : item.role === 'MANAGER' ? '#DDD6FE' : '#A7F3D0',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '800',
                          color: item.role === 'ADMIN' ? '#1D4ED8' : item.role === 'MANAGER' ? '#6D28D9' : '#047857',
                        }}
                      >
                        {initials}
                      </Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2, flexWrap: 'wrap' }}>
                        {/* Role Pill */}
                        <View
                          style={{
                            paddingHorizontal: 6,
                            paddingVertical: 1,
                            borderRadius: 4,
                            backgroundColor: item.role === 'ADMIN' ? '#EFF6FF' : item.role === 'MANAGER' ? '#F5F3FF' : '#F1F5F9',
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '700',
                              color: item.role === 'ADMIN' ? '#2563EB' : item.role === 'MANAGER' ? '#7C3AED' : '#475569',
                            }}
                          >
                            {item.role}
                          </Text>
                        </View>

                        {/* Branch Pill */}
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 3,
                            paddingHorizontal: 6,
                            paddingVertical: 1,
                            borderRadius: 4,
                            backgroundColor: '#F0FDFA',
                            borderWidth: 1,
                            borderColor: '#CCFBF1',
                          }}
                        >
                          <MapPin size={9} color="#0F766E" />
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#0F766E' }}>
                            {item.branch ? `${item.branch}` : 'HQ / All'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Action Buttons: Edit & Delete */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity
                      onPress={() => setEditingMember(item)}
                      activeOpacity={0.7}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        backgroundColor: '#F8FAFC',
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Edit2 size={13} color="#475569" />
                    </TouchableOpacity>

                    {(isAdmin || (isManager && item.role === 'AGENT')) && item._id !== currentUser?._id && (
                      <TouchableOpacity
                        onPress={() => handleDeleteMember(item)}
                        activeOpacity={0.7}
                        disabled={deleteMutation.isPending}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 15,
                          backgroundColor: '#FEF2F2',
                          borderWidth: 1,
                          borderColor: '#FECACA',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Trash2 size={13} color="#DC2626" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Contact Meta Details */}
                <View
                  style={{
                    backgroundColor: '#F8FAFC',
                    borderRadius: 8,
                    paddingVertical: 5,
                    paddingHorizontal: 8,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: '#F1F5F9',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Phone size={12} color="#0F9D58" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>
                      {item.phone}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '58%' }}>
                    <Mail size={12} color="#64748B" />
                    <Text style={{ fontSize: 11.5, color: '#64748B' }} numberOfLines={1}>
                      {item.email}
                    </Text>
                  </View>
                </View>

                {/* Status & Inbound Distribution Toggle */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: 6,
                    borderTopWidth: 1,
                    borderTopColor: '#F1F5F9',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 3.5,
                        backgroundColor: item.canReceiveLeads ? '#10B981' : '#94A3B8',
                      }}
                    />
                    <Text style={{ fontSize: 11.5, fontWeight: '700', color: item.canReceiveLeads ? '#047857' : '#64748B' }}>
                      {item.canReceiveLeads ? 'Inbound Calling Active' : 'Queue Paused'}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 10.5, color: '#94A3B8', fontWeight: '600' }}>
                      {item.canReceiveLeads ? 'Accepting' : 'Off'}
                    </Text>
                    <Switch
                      value={item.canReceiveLeads}
                      onValueChange={() => handleToggleReceiveLeads(item)}
                      trackColor={{ false: '#E2E8F0', true: '#10B981' }}
                      thumbColor="#FFFFFF"
                      style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                    />
                  </View>
                </View>
              </View>
            );
          })
        )}
        </View>

        {/* Footer Summary */}
        <View style={{ marginTop: 16, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '600' }}>
            Showing {filteredMembers.length} team members · Real-time round-robin queue distribution
          </Text>
        </View>
      </ScrollView>

      {/* Add Team Member Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {currentUser?.role === 'MANAGER'
                    ? `Add Agent (${currentUser.branch || 'Branch'})`
                    : 'Add Team Member'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {currentUser?.role === 'MANAGER'
                    ? `Create an agent under your ${currentUser.branch || 'Trichy'} branch`
                    : 'Create agent or branch manager with branch assignment'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>FULL NAME</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. Kavin Kumar"
                placeholderTextColor="#94A3B8"
                value={name}
                onChangeText={setName}
              />

              <Text style={[styles.inputLabel, { marginTop: 10 }]}>EMAIL ADDRESS</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. kavin@company.com"
                placeholderTextColor="#94A3B8"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />

              <Text style={[styles.inputLabel, { marginTop: 10 }]}>PHONE NUMBER</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. 9876543220"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />

              <Text style={[styles.inputLabel, { marginTop: 10 }]}>PASSWORD</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Minimum 6 characters"
                placeholderTextColor="#94A3B8"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              {/* Branch Assignment */}
              <Text style={[styles.inputLabel, { marginTop: 10 }]}>ASSIGN BRANCH</Text>
              {currentUser?.role === 'MANAGER' ? (
                <View style={styles.managerBranchLockedBox}>
                  <MapPin size={12} color="#0F766E" />
                  <Text style={styles.managerBranchLockedText}>
                    {currentUser.branch || 'Trichy'} Branch (Locked to your branch)
                  </Text>
                </View>
              ) : (
                <View style={styles.branchPickerRow}>
                  {availableBranchNames.map((b) => (
                    <TouchableOpacity
                      key={b}
                      style={[styles.branchPickBtn, branch === b && styles.branchPickBtnActive]}
                      onPress={() => setBranch(b)}
                    >
                      <Text
                        style={[
                          styles.branchPickText,
                          branch === b && styles.branchPickTextActive,
                        ]}
                      >
                        📍 {b}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Role Assignment (Admin can choose AGENT or MANAGER, Manager locked to AGENT) */}
              <Text style={[styles.inputLabel, { marginTop: 10 }]}>ROLE</Text>
              {currentUser?.role === 'MANAGER' ? (
                <View style={styles.managerRoleLockedBox}>
                  <Text style={styles.managerRoleLockedText}>
                    AGENT (Branch managers can only create Agents)
                  </Text>
                </View>
              ) : (
                <View style={styles.rolePickerRow}>
                  {(['AGENT', 'MANAGER', 'ADMIN'] as UserRole[]).map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.rolePickBtn, role === r && styles.rolePickBtnActive]}
                      onPress={() => setRole(r)}
                    >
                      <Text style={[styles.rolePickText, role === r && styles.rolePickTextActive]}>
                        {r}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={() => {
                  if (!name.trim() || !email.trim() || !password.trim()) {
                    Alert.alert('Required Fields', 'Please fill name, email, and password.');
                    return;
                  }
                  const finalBranch =
                    currentUser?.role === 'MANAGER'
                      ? currentUser.branch || 'Trichy'
                      : branch;

                  createMutation.mutate({
                    name: name.trim(),
                    email: email.trim(),
                    phone: phone.trim() || '9876543210',
                    password: password.trim(),
                    role,
                    branch: finalBranch,
                    canReceiveLeads: true,
                  });
                }}
                disabled={createMutation.isPending}
                activeOpacity={0.8}
              >
                {createMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Create Member</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Member Modal */}
      {editingMember && (
        <Modal
          visible={Boolean(editingMember)}
          transparent
          animationType="fade"
          onRequestClose={() => setEditingMember(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Member</Text>
                <TouchableOpacity onPress={() => setEditingMember(null)}>
                  <X size={18} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <Text style={styles.inputLabel}>NAME</Text>
                <Text style={styles.staticFieldText}>{editingMember.name}</Text>

                <Text style={[styles.inputLabel, { marginTop: 10 }]}>EMAIL</Text>
                <Text style={styles.staticFieldText}>{editingMember.email}</Text>

                <Text style={[styles.inputLabel, { marginTop: 10 }]}>BRANCH</Text>
                <Text style={styles.staticFieldText}>
                  {editingMember.branch ? `📍 ${editingMember.branch} Branch` : 'Headquarters / All'}
                </Text>

                <Text style={[styles.inputLabel, { marginTop: 10 }]}>STATUS</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <Text style={{ fontSize: 13, color: '#0F172A', fontWeight: '600' }}>Active Account</Text>
                  <Switch
                    value={editingMember.isActive}
                    onValueChange={(val) => {
                      setEditingMember({ ...editingMember, isActive: val });
                    }}
                    trackColor={{ false: '#E2E8F0', true: '#10B981' }}
                  />
                </View>

                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={() => {
                    if (!editingMember._id.startsWith('user-')) {
                      updateMutation.mutate({
                        id: editingMember._id,
                        data: {
                          isActive: editingMember.isActive,
                        },
                      });
                    } else {
                      setEditingMember(null);
                    }
                  }}
                  disabled={updateMutation.isPending}
                  activeOpacity={0.8}
                >
                  {updateMutation.isPending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Create New Branch Modal (Admin Only) */}
      <Modal
        visible={showAddBranchModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddBranchModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: '#CCFBF1',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Building2 size={18} color="#0F766E" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Create New Branch</Text>
                  <Text style={styles.modalSubtitle}>Add a new company branch or office</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowAddBranchModal(false)}>
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

              <Text style={[styles.inputLabel, { marginTop: 12 }]}>LOCATION / ADDRESS (OPTIONAL)</Text>
              <TextInput
                style={[styles.modalInput, { height: 64, textAlignVertical: 'top' }]}
                placeholder="e.g. 124 Cross Cut Road, Gandhipuram"
                placeholderTextColor="#94A3B8"
                value={newBranchAddress}
                onChangeText={setNewBranchAddress}
                multiline
              />
            </ScrollView>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: '#0D9488', marginTop: 16 }]}
              onPress={() => {
                if (!newBranchName.trim()) {
                  Alert.alert('Required', 'Please enter a branch name.');
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
                <Text style={styles.submitBtnText}>Create Branch</Text>
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
    padding: 12,
    paddingBottom: 110,
  },
  bannerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
    flexWrap: 'wrap',
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  bannerSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  addAgentBtn: {
    backgroundColor: '#0F9D58',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 8,
  },
  addAgentText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  branchTabsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  branchTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 9,
    paddingVertical: 4,
    height: 28,
    borderRadius: 14,
  },
  branchTabActive: {
    backgroundColor: '#F0FDFA',
    borderColor: '#99F6E4',
  },
  branchTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  branchTabTextActive: {
    color: '#0F766E',
    fontWeight: '800',
  },
  searchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 34,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 11.5,
    color: '#0F172A',
    padding: 0,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    height: 34,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  statusBadgeText: {
    fontSize: 11,
    color: '#047857',
    fontWeight: '600',
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  thCell: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.4,
  },
  tableDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tdCell: {
    justifyContent: 'center',
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 11,
    fontWeight: '700',
  },
  memberNameText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  memberEmailText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  memberBranchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CCFBF1',
    alignSelf: 'flex-start',
  },
  memberBranchBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F766E',
  },
  hqBranchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    alignSelf: 'flex-start',
  },
  hqBranchBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4338CA',
  },
  phoneText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '500',
  },
  rolePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  rolePillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  editBtn: {
    padding: 6,
    borderRadius: 4,
  },
  tableFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FAFAFA',
  },
  tableFooterCount: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  tableFooterStatus: {
    fontSize: 11,
    color: '#94A3B8',
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
    borderRadius: 14,
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
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  modalBody: {
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
    paddingVertical: 7,
    fontSize: 12,
    color: '#0F172A',
    marginTop: 3,
  },
  staticFieldText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
    marginTop: 3,
    marginBottom: 4,
  },
  managerBranchLockedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
  },
  managerBranchLockedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
  },
  branchPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  branchPickBtn: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#F8FAFC',
  },
  branchPickBtnActive: {
    backgroundColor: '#F0FDFA',
    borderColor: '#0D9488',
  },
  branchPickText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  branchPickTextActive: {
    color: '#0F766E',
    fontWeight: '800',
  },
  managerRoleLockedBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
  },
  managerRoleLockedText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  rolePickerRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  rolePickBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: 'center',
  },
  rolePickBtnActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  rolePickText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  rolePickTextActive: {
    color: '#2563EB',
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 14,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
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
