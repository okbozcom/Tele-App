import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { X, CalendarCheck2, Clock, Check, AlertCircle } from 'lucide-react-native';
import { createTask } from '../api/taskApi';
import { colors, borderRadius, shadows } from '../theme';
import { toast } from '../store/toastStore';
import { useQueryClient } from '@tanstack/react-query';

interface CreateTaskModalProps {
  visible: boolean;
  onClose: () => void;
  leadId: string;
  leadName: string;
  leadPhone?: string;
  onSuccess?: () => void;
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  visible,
  onClose,
  leadId,
  leadName,
  leadPhone,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [dueOption, setDueOption] = useState<'2H' | 'TODAY_EVENING' | 'TOMORROW_MORNING' | '2D'>('TOMORROW_MORNING');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const calculateDueDate = (opt: '2H' | 'TODAY_EVENING' | 'TOMORROW_MORNING' | '2D'): Date => {
    const now = new Date();
    if (opt === '2H') {
      return new Date(now.getTime() + 2 * 60 * 60 * 1000);
    }
    if (opt === 'TODAY_EVENING') {
      const d = new Date(now);
      d.setHours(17, 30, 0, 0);
      if (d.getTime() < now.getTime()) {
        d.setTime(now.getTime() + 2 * 60 * 60 * 1000);
      }
      return d;
    }
    if (opt === 'TOMORROW_MORNING') {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
      return d;
    }
    // 2 days
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    d.setHours(11, 0, 0, 0);
    return d;
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter a task title');
      return;
    }

    try {
      setIsSubmitting(true);
      const dueDate = calculateDueDate(dueOption);

      await createTask({
        title: title.trim(),
        description: description.trim(),
        leadId,
        priority,
        dueDate: dueDate.toISOString(),
      });

      toast.success('Task created successfully');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setTitle('');
      setDescription('');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconBox}>
                <CalendarCheck2 size={18} color="#059669" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Add Task / Reminder</Text>
                <Text style={styles.headerSubtitle}>For {leadName}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.body}>
            {/* Task Title */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Task Title *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Send price quote via WhatsApp"
                placeholderTextColor="#94A3B8"
                value={title}
                onChangeText={setTitle}
                autoFocus
              />
            </View>

            {/* Description */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Notes / Deliverable Description</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Key details to remember when completing this task..."
                placeholderTextColor="#94A3B8"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Priority Chips */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Priority</Text>
              <View style={styles.optionsRow}>
                {(['LOW', 'MEDIUM', 'HIGH'] as const).map((p) => {
                  const isSelected = priority === p;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[
                        styles.chipBtn,
                        isSelected &&
                          (p === 'HIGH'
                            ? styles.chipHighActive
                            : p === 'MEDIUM'
                            ? styles.chipMediumActive
                            : styles.chipLowActive),
                      ]}
                      onPress={() => setPriority(p)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          isSelected &&
                            (p === 'HIGH'
                              ? styles.chipHighTextActive
                              : p === 'MEDIUM'
                              ? styles.chipMediumTextActive
                              : styles.chipLowTextActive),
                        ]}
                      >
                        {p}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Due Time Shortcut Chips */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Due Date / Deadline</Text>
              <View style={styles.optionsRow}>
                {[
                  { id: '2H', label: 'In 2 hours' },
                  { id: 'TODAY_EVENING', label: 'Today 5:30 PM' },
                  { id: 'TOMORROW_MORNING', label: 'Tomorrow 10 AM' },
                  { id: '2D', label: 'In 2 days' },
                ].map((d) => {
                  const isSelected = dueOption === d.id;
                  return (
                    <TouchableOpacity
                      key={d.id}
                      style={[styles.dueChip, isSelected && styles.dueChipActive]}
                      onPress={() => setDueOption(d.id as any)}
                      activeOpacity={0.7}
                    >
                      <Clock size={11} color={isSelected ? '#059669' : '#64748B'} />
                      <Text style={[styles.dueChipText, isSelected && styles.dueChipTextActive]}>
                        {d.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Actions */}
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSubmit}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.submitBtnText}>Create Task</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
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
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    ...shadows.elevated,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  body: {
    marginTop: 14,
    gap: 12,
  },
  fieldWrap: {
    gap: 5,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 12,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  textArea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  chipHighActive: {
    backgroundColor: '#FEE2E2',
    borderColor: '#DC2626',
  },
  chipHighTextActive: {
    color: '#DC2626',
  },
  chipMediumActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#D97706',
  },
  chipMediumTextActive: {
    color: '#D97706',
  },
  chipLowActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  chipLowTextActive: {
    color: '#2563EB',
  },
  dueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dueChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  dueChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  dueChipTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
