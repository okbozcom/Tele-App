import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from 'react-native';
import {
  FileSpreadsheet,
  X,
  Calendar,
  Building2,
  Users,
  Download,
  CheckCircle2,
  AlertCircle,
  FileText,
  PhoneCall,
  Clock,
  Layers,
  ChevronDown,
} from 'lucide-react-native';

import { exportReportCsv } from '../api/leadApi';
import {
  downloadOrShareCsv,
  convertUserCallStatsToCsv,
  convertCallActivitiesToCsv,
} from '../utils/csvDownloader';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';
import { UserCallStats, Activity } from '../types';

export type ReportType =
  | 'user-calls'
  | 'call-logs'
  | 'dashboard'
  | 'dispositions'
  | 'follow-ups'
  | 'campaign-stages'
  | 'campaign-leads';

export type ReportPeriod = 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH' | 'ALL';

interface ReportGeneratorModalProps {
  visible: boolean;
  onClose: () => void;
  initialType?: ReportType;
  initialPeriod?: ReportPeriod;
  initialBranch?: string;
  targetAgent?: { id: string; name: string } | null;
  availableBranches?: string[];
  localStats?: UserCallStats[];
  localActivities?: Activity[];
}

interface ReportTypeOption {
  id: ReportType;
  title: string;
  subtitle: string;
  icon: any;
  forRoles: Array<'AGENT' | 'MANAGER' | 'ADMIN'>;
}

const REPORT_TYPE_OPTIONS: ReportTypeOption[] = [
  {
    id: 'user-calls',
    title: 'Calling Performance Summary',
    subtitle: 'Calls dialed, connected, talk time, and connect rate per agent',
    icon: PhoneCall,
    forRoles: ['AGENT', 'MANAGER', 'ADMIN'],
  },
  {
    id: 'call-logs',
    title: 'Detailed Call History & Notes',
    subtitle: 'Customer contacts, timestamps, durations, outcomes, and remarks',
    icon: Clock,
    forRoles: ['AGENT', 'MANAGER', 'ADMIN'],
  },
  {
    id: 'dashboard',
    title: 'Executive Lead & Calling Overview',
    subtitle: 'High-level lead funnel, open/closed counts, and conversion rates',
    icon: Layers,
    forRoles: ['MANAGER', 'ADMIN'],
  },
  {
    id: 'dispositions',
    title: 'Lead Dispositions Breakdown',
    subtitle: 'Distribution of call stages and customer responses',
    icon: FileText,
    forRoles: ['MANAGER', 'ADMIN'],
  },
  {
    id: 'follow-ups',
    title: 'Follow-ups & Due Tasks',
    subtitle: 'Pending follow-up backlog, completed callbacks, and missed alerts',
    icon: Calendar,
    forRoles: ['AGENT', 'MANAGER', 'ADMIN'],
  },
];

export const ReportGeneratorModal: React.FC<ReportGeneratorModalProps> = ({
  visible,
  onClose,
  initialType = 'user-calls',
  initialPeriod = 'TODAY',
  initialBranch = 'ALL',
  targetAgent = null,
  availableBranches = ['Trichy', 'Pudukkottai', 'Chennai', 'Madurai'],
  localStats = [],
  localActivities = [],
}) => {
  const { width } = useWindowDimensions();
  const isWide = width >= 860;

  const currentUser = useAuthStore((s) => s.user);
  const userRole = currentUser?.role || 'AGENT';
  const isAgent = userRole === 'AGENT';

  const [reportType, setReportType] = useState<ReportType>(initialType);
  const [period, setPeriod] = useState<ReportPeriod>(initialPeriod);
  const [selectedBranch, setSelectedBranch] = useState<string>(
    currentUser?.role === 'MANAGER' && currentUser?.branch ? currentUser.branch : initialBranch,
  );
  const [isGenerating, setIsGenerating] = useState(false);

  // Midnight tracker: re-evaluates date boundaries across midnight
  const [currentDateKey, setCurrentDateKey] = useState(() => new Date().toDateString());
  useEffect(() => {
    const interval = setInterval(() => {
      const todayStr = new Date().toDateString();
      setCurrentDateKey((prev) => (prev !== todayStr ? todayStr : prev));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Filter available report types based on current user's role
  const allowedReportTypes = useMemo(() => {
    return REPORT_TYPE_OPTIONS.filter((opt) => opt.forRoles.includes(userRole));
  }, [userRole]);

  // Compute ISO date range based on period
  const { fromDate, toDate, periodLabel } = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (period === 'TODAY') {
      return {
        fromDate: startOfToday.toISOString(),
        toDate: endOfToday.toISOString(),
        periodLabel: 'Today',
      };
    }
    if (period === 'YESTERDAY') {
      const startOfYesterday = new Date(startOfToday.getTime() - 24 * 3600 * 1000);
      const endOfYesterday = new Date(startOfToday.getTime() - 1);
      return {
        fromDate: startOfYesterday.toISOString(),
        toDate: endOfYesterday.toISOString(),
        periodLabel: 'Yesterday',
      };
    }
    if (period === 'WEEK') {
      const sevenDaysAgo = new Date(startOfToday.getTime() - 6 * 24 * 3600 * 1000);
      return {
        fromDate: sevenDaysAgo.toISOString(),
        toDate: endOfToday.toISOString(),
        periodLabel: 'Past 7 Days',
      };
    }
    if (period === 'MONTH') {
      const thirtyDaysAgo = new Date(startOfToday.getTime() - 29 * 24 * 3600 * 1000);
      return {
        fromDate: thirtyDaysAgo.toISOString(),
        toDate: endOfToday.toISOString(),
        periodLabel: 'Past 30 Days',
      };
    }
    return {
      fromDate: undefined,
      toDate: undefined,
      periodLabel: 'All Time',
    };
  }, [period, currentDateKey]);

  // Handle generating and exporting report
  const handleGenerateReport = async () => {
    try {
      setIsGenerating(true);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const agentPrefix = targetAgent?.name ? `${targetAgent.name.replace(/\s+/g, '_')}_` : '';
      const filename = `HiTalk_Report_${agentPrefix}${reportType}_${period.toLowerCase()}_${timestamp}.csv`;

      let csvData = '';

      try {
        // 1. Try server API export
        csvData = await exportReportCsv({
          type: reportType,
          from: fromDate,
          to: toDate,
          branch: selectedBranch !== 'ALL' ? selectedBranch : undefined,
          userId: targetAgent?.id,
        });
      } catch (err: any) {
        console.warn('Backend CSV export failed, falling back to local dataset:', err?.message);

        // 2. Client-side fallback if server is unreachable
        if (reportType === 'user-calls') {
          csvData = convertUserCallStatsToCsv(localStats, periodLabel);
        } else if (reportType === 'call-logs') {
          csvData = convertCallActivitiesToCsv(localActivities, targetAgent?.name || currentUser?.name || 'Agent');
        } else {
          throw new Error('Report data is temporarily unavailable. Please verify your connection.');
        }
      }

      if (!csvData || csvData.trim().length === 0) {
        toast.info('No records found for the selected filter period', 'Empty Report');
        setIsGenerating(false);
        return;
      }

      // 3. Trigger download / native share sheet
      const result = await downloadOrShareCsv(filename, csvData);

      if (result.success) {
        toast.success(`Generated and saved "${filename}"!`, 'Report Exported');
        onClose();
      } else {
        toast.error(result.message, 'Export Warning');
      }
    } catch (error: any) {
      console.error('Report generation error:', error);
      toast.error(error?.message || 'Failed to generate report. Please try again.', 'Report Error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.modalCard, isWide && styles.modalCardWide]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={styles.headerIconBox}>
                <FileSpreadsheet size={20} color="#0F9D58" strokeWidth={2.3} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Generate CRM Report</Text>
                <Text style={styles.subtitle}>
                  {targetAgent
                    ? `Generating report for ${targetAgent.name}`
                    : 'Customize filters and export spreadsheet report'}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <X size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Step 1: Select Report Type */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>1. SELECT REPORT TYPE</Text>
              <View style={{ gap: 8, marginTop: 6 }}>
                {allowedReportTypes.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = reportType === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.typeOptionCard, isSelected && styles.typeOptionCardActive]}
                      onPress={() => setReportType(opt.id)}
                      activeOpacity={0.8}
                    >
                      <View
                        style={[
                          styles.typeOptionIconBox,
                          isSelected && styles.typeOptionIconBoxActive,
                        ]}
                      >
                        <Icon size={18} color={isSelected ? '#0F9D58' : '#64748B'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.typeOptionTitle,
                            isSelected && styles.typeOptionTitleActive,
                          ]}
                        >
                          {opt.title}
                        </Text>
                        <Text style={styles.typeOptionSub}>{opt.subtitle}</Text>
                      </View>
                      <View
                        style={[
                          styles.radioCircle,
                          isSelected && styles.radioCircleActive,
                        ]}
                      >
                        {isSelected && <View style={styles.radioInner} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Step 2: Select Date Range */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>2. TIME PERIOD</Text>
              <View style={styles.periodTabsRow}>
                {(['TODAY', 'YESTERDAY', 'WEEK', 'MONTH', 'ALL'] as const).map((p) => {
                  const isSelected = period === p;
                  const label =
                    p === 'TODAY'
                      ? 'Today'
                      : p === 'YESTERDAY'
                      ? 'Yesterday'
                      : p === 'WEEK'
                      ? '7 Days'
                      : p === 'MONTH'
                      ? '30 Days'
                      : 'All Time';
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[styles.periodTab, isSelected && styles.periodTabActive]}
                      onPress={() => setPeriod(p)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.periodTabText,
                          isSelected && styles.periodTabTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Step 3: Branch Scope (Managers & Admins only) */}
            {!isAgent && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>3. BRANCH OFFICE SCOPE</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 6, marginTop: 6 }}
                >
                  {['ALL', ...availableBranches].map((br) => {
                    const isSelected = selectedBranch.toLowerCase() === br.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={br}
                        style={[styles.branchPill, isSelected && styles.branchPillActive]}
                        onPress={() => setSelectedBranch(br)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.branchPillText,
                            isSelected && styles.branchPillTextActive,
                          ]}
                        >
                          {br === 'ALL' ? '🏢 All Branches' : `📍 ${br}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Live Summary Preview Box */}
            <View style={styles.previewBox}>
              <View style={styles.previewHeaderRow}>
                <CheckCircle2 size={15} color="#0F9D58" />
                <Text style={styles.previewTitle}>Ready to Generate</Text>
              </View>
              <View style={styles.previewGrid}>
                <View style={styles.previewItem}>
                  <Text style={styles.previewLabel}>Report Format</Text>
                  <Text style={styles.previewValue}>CSV (Excel Compatible)</Text>
                </View>
                <View style={styles.previewItem}>
                  <Text style={styles.previewLabel}>Period Scope</Text>
                  <Text style={styles.previewValue}>{periodLabel}</Text>
                </View>
                {!isAgent && (
                  <View style={styles.previewItem}>
                    <Text style={styles.previewLabel}>Branch</Text>
                    <Text style={styles.previewValue}>
                      {selectedBranch === 'ALL' ? 'All Branches' : `${selectedBranch} Branch`}
                    </Text>
                  </View>
                )}
                {targetAgent && (
                  <View style={styles.previewItem}>
                    <Text style={styles.previewLabel}>Agent Filter</Text>
                    <Text style={styles.previewValue}>{targetAgent.name}</Text>
                  </View>
                )}
              </View>
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.generateBtn, isGenerating && styles.generateBtnDisabled]}
              onPress={handleGenerateReport}
              disabled={isGenerating}
              activeOpacity={0.85}
            >
              {isGenerating ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.generateBtnText}>Compiling Report...</Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Download size={16} color="#FFFFFF" strokeWidth={2.3} />
                  <Text style={styles.generateBtnText}>Generate & Download CSV</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxHeight: '90%',
    display: 'flex',
    flexDirection: 'column',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  modalCardWide: {
    maxWidth: 580,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#E6F4EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyScroll: {
    flex: 1,
  },
  bodyContent: {
    padding: 20,
    gap: 18,
  },
  section: {},
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  typeOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  typeOptionCardActive: {
    borderColor: '#0F9D58',
    backgroundColor: '#F0FDF4',
  },
  typeOptionIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeOptionIconBoxActive: {
    backgroundColor: '#DCFCE7',
  },
  typeOptionTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  typeOptionTitleActive: {
    color: '#0F9D58',
  },
  typeOptionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: '#0F9D58',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0F9D58',
  },
  periodTabsRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 6,
    gap: 4,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 7,
  },
  periodTabActive: {
    backgroundColor: '#0F9D58',
  },
  periodTabText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  periodTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  branchPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  branchPillActive: {
    backgroundColor: '#0F9D58',
    borderColor: '#0F9D58',
  },
  branchPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  branchPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  previewBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  previewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  previewTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  previewItem: {
    minWidth: '45%',
    flex: 1,
  },
  previewLabel: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '500',
  },
  previewValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 2,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FAFAFA',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  generateBtn: {
    backgroundColor: '#0F9D58',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateBtnDisabled: {
    opacity: 0.7,
  },
  generateBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
