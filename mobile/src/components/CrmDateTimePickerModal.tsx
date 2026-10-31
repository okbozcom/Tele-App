import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import {
  Calendar as CalendarIcon,
  Clock,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  Plus,
  Minus,
  ArrowRight,
  CalendarCheck,
} from 'lucide-react-native';

export interface CrmDateTimePickerModalProps {
  visible: boolean;
  initialDate?: string | Date | null;
  onClose: () => void;
  onConfirm: (isoDate: string) => void;
  title?: string;
  allowPastDates?: boolean;
  allowFutureDates?: boolean;
  mode?: 'datetime' | 'date';
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const HOURS_GRID = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES_GRID = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

export const CrmDateTimePickerModal: React.FC<CrmDateTimePickerModalProps> = ({
  visible,
  initialDate,
  onClose,
  onConfirm,
  title = 'Select Date & Time',
  allowPastDates = false,
  allowFutureDates = true,
  mode = 'datetime',
}) => {
  // Active Tab: 'DATE' or 'TIME'
  const [activeTab, setActiveTab] = useState<'DATE' | 'TIME'>('DATE');
  // Time sub-selection: 'HOUR' or 'MINUTE'
  const [timeSubTab, setTimeSubTab] = useState<'HOUR' | 'MINUTE'>('HOUR');

  // Currently displayed month in calendar view
  const [viewYear, setViewYear] = useState<number>(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(() => new Date().getMonth());

  // Currently selected date
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    if (!allowPastDates) {
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
    }
    return d;
  });

  // Time states
  const [hour12, setHour12] = useState<number>(10);
  const [minute, setMinute] = useState<number>(0);
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');

  // Initialize on opening
  useEffect(() => {
    if (visible) {
      let init = new Date();
      if (initialDate) {
        const parsed = new Date(initialDate);
        if (!isNaN(parsed.getTime())) {
          init = parsed;
        } else if (!allowPastDates) {
          init.setDate(init.getDate() + 1);
          init.setHours(10, 0, 0, 0);
        }
      } else if (!allowPastDates) {
        init.setDate(init.getDate() + 1);
        init.setHours(10, 0, 0, 0);
      }

      setSelectedDate(init);
      setViewYear(init.getFullYear());
      setViewMonth(init.getMonth());

      const rawHours = init.getHours();
      const isPm = rawHours >= 12;
      const h12 = rawHours % 12 === 0 ? 12 : rawHours % 12;
      setHour12(h12);
      setMinute(init.getMinutes());
      setPeriod(isPm ? 'PM' : 'AM');
      setActiveTab('DATE');
      setTimeSubTab('HOUR');
    }
  }, [visible, initialDate, allowPastDates]);

  // Calendar Math
  const monthName = useMemo(() => {
    return new Date(viewYear, viewMonth, 1).toLocaleDateString([], {
      month: 'long',
      year: 'numeric',
    });
  }, [viewYear, viewMonth]);

  const daysInMonth = useMemo(() => {
    return new Date(viewYear, viewMonth + 1, 0).getDate();
  }, [viewYear, viewMonth]);

  const firstDayOfWeek = useMemo(() => {
    return new Date(viewYear, viewMonth, 1).getDay();
  }, [viewYear, viewMonth]);

  const today = useMemo(() => new Date(), []);

  // Month Navigation Bounds
  const canGoNext = useMemo(() => {
    if (allowFutureDates) return true;
    return (
      viewYear < today.getFullYear() ||
      (viewYear === today.getFullYear() && viewMonth < today.getMonth())
    );
  }, [allowFutureDates, viewYear, viewMonth, today]);

  const canGoPrev = useMemo(() => {
    if (allowPastDates) return true;
    return (
      viewYear > today.getFullYear() ||
      (viewYear === today.getFullYear() && viewMonth > today.getMonth())
    );
  }, [allowPastDates, viewYear, viewMonth, today]);

  // Month Navigation
  const prevMonth = () => {
    if (!canGoPrev) return;
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (!canGoNext) return;
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Day selection
  const handleSelectDay = (day: number) => {
    const newDate = new Date(viewYear, viewMonth, day);
    setSelectedDate(newDate);
  };

  // Check if a cell is selected
  const isDaySelected = (day: number) => {
    return (
      selectedDate.getDate() === day &&
      selectedDate.getMonth() === viewMonth &&
      selectedDate.getFullYear() === viewYear
    );
  };

  // Check if a cell is today
  const isDayToday = (day: number) => {
    return (
      today.getDate() === day &&
      today.getMonth() === viewMonth &&
      today.getFullYear() === viewYear
    );
  };

  // Check if a day is in the past
  const isDayPast = (day: number) => {
    if (allowPastDates) return false;
    const dateToCheck = new Date(viewYear, viewMonth, day, 23, 59, 59);
    return dateToCheck.getTime() < today.getTime() && !isDayToday(day);
  };

  // Check if a day is in the future
  const isDayFuture = (day: number) => {
    if (allowFutureDates) return false;
    const dateToCheck = new Date(viewYear, viewMonth, day, 0, 0, 0);
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return dateToCheck.getTime() > startOfToday;
  };

  // Hour & Minute Selectors
  const handleSelectHour = (h: number) => {
    setHour12(h);
    // After picking hour, smoothly switch to minute
    setTimeSubTab('MINUTE');
  };

  const handleSelectMinute = (m: number) => {
    setMinute(m);
  };

  const stepMinute = (delta: number) => {
    let next = minute + delta;
    if (next >= 60) next = 0;
    if (next < 0) next = 59;
    setMinute(next);
  };

  // Formatted preview strings
  const formattedDateStr = useMemo(() => {
    return selectedDate.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }, [selectedDate]);

  const formattedTimeStr = useMemo(() => {
    const h = hour12 < 10 ? `0${hour12}` : hour12;
    const m = minute < 10 ? `0${minute}` : minute;
    return `${h}:${m} ${period}`;
  }, [hour12, minute, period]);

  const formattedFullPreview = useMemo(() => {
    const fullDate = selectedDate.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${fullDate} • ${formattedTimeStr}`;
  }, [selectedDate, formattedTimeStr]);

  // Confirm Selection
  const handleConfirm = () => {
    if (mode === 'date') {
      const finalDate = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        12,
        0,
        0,
        0,
      );
      onConfirm(finalDate.toISOString());
      onClose();
      return;
    }

    let finalHours = hour12 % 12;
    if (period === 'PM') {
      finalHours += 12;
    }
    const finalDate = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      finalHours,
      minute,
      0,
      0,
    );
    onConfirm(finalDate.toISOString());
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={styles.iconBox}>
                <CalendarCheck size={18} color="#10B981" />
              </View>
              <View>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {mode === 'date' ? 'Choose date to view history' : 'Pick exact callback date & time'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Segmented Tab Bar: [ 📅 Date ] and [ 🕒 Time ] (Hidden in date-only mode) */}
          {mode !== 'date' ? (
            <View style={styles.segmentedTabBar}>
              <TouchableOpacity
                style={[styles.segmentTab, activeTab === 'DATE' && styles.segmentTabActive]}
                onPress={() => setActiveTab('DATE')}
                activeOpacity={0.8}
              >
                <CalendarIcon size={15} color={activeTab === 'DATE' ? '#10B981' : '#64748B'} />
                <Text style={[styles.segmentTabText, activeTab === 'DATE' && styles.segmentTabTextActive]}>
                  1. Date ({formattedDateStr})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.segmentTab, activeTab === 'TIME' && styles.segmentTabActive]}
                onPress={() => setActiveTab('TIME')}
                activeOpacity={0.8}
              >
                <Clock size={15} color={activeTab === 'TIME' ? '#10B981' : '#64748B'} />
                <Text style={[styles.segmentTabText, activeTab === 'TIME' && styles.segmentTabTextActive]}>
                  2. Time ({formattedTimeStr})
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* =========================================================================
                TAB 1: REAL MONTHLY CALENDAR GRID
               ========================================================================= */}
            {activeTab === 'DATE' ? (
              <View style={styles.calendarCard}>
                {/* Month & Year Navigation Header */}
                <View style={styles.monthHeaderRow}>
                  <TouchableOpacity
                    onPress={prevMonth}
                    style={[styles.navBtn, !canGoPrev && { opacity: 0.3 }]}
                    disabled={!canGoPrev}
                    activeOpacity={0.7}
                  >
                    <ChevronLeft size={18} color="#334155" />
                  </TouchableOpacity>

                  <Text style={styles.monthTitleText}>{monthName}</Text>

                  <TouchableOpacity
                    onPress={nextMonth}
                    style={[styles.navBtn, !canGoNext && { opacity: 0.3 }]}
                    disabled={!canGoNext}
                    activeOpacity={0.7}
                  >
                    <ChevronRight size={18} color="#334155" />
                  </TouchableOpacity>
                </View>

                {/* Weekday Row (Su, Mo, Tu, We, Th, Fr, Sa) */}
                <View style={styles.weekdaysRow}>
                  {WEEKDAYS.map((wd, idx) => (
                    <View key={idx} style={styles.weekdayCell}>
                      <Text style={[styles.weekdayText, idx === 0 && { color: '#EF4444' }]}>{wd}</Text>
                    </View>
                  ))}
                </View>

                {/* Monthly Days Grid */}
                <View style={styles.daysGrid}>
                  {/* Empty cells for offset before 1st day of month */}
                  {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                    <View key={`empty-${idx}`} style={styles.dayCell} />
                  ))}

                  {/* Days of the month (1 to daysInMonth) */}
                  {Array.from({ length: daysInMonth }).map((_, idx) => {
                    const day = idx + 1;
                    const selected = isDaySelected(day);
                    const isCurrentDay = isDayToday(day);
                    const past = isDayPast(day);
                    const future = isDayFuture(day);
                    const disabled = past || future;

                    return (
                      <TouchableOpacity
                        key={`day-${day}`}
                        style={[
                          styles.dayCell,
                          selected && styles.dayCellSelected,
                          !selected && isCurrentDay && styles.dayCellToday,
                        ]}
                        onPress={() => handleSelectDay(day)}
                        disabled={disabled}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.dayCellText,
                            selected && styles.dayCellTextSelected,
                            !selected && isCurrentDay && styles.dayCellTextToday,
                            disabled && styles.dayCellTextPast,
                          ]}
                        >
                          {day}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Next Step Button (only in datetime mode) */}
                {mode !== 'date' ? (
                  <TouchableOpacity
                    style={styles.nextStepBtn}
                    onPress={() => setActiveTab('TIME')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.nextStepBtnText}>Next: Select Time ({formattedTimeStr})</Text>
                    <ArrowRight size={16} color="#10B981" />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              /* =========================================================================
                  TAB 2: INTERACTIVE EXACT TIME PICKER
                 ========================================================================= */
              <View style={styles.timePickerCard}>
                {/* Big Digital Clock Display */}
                <View style={styles.digitalClockWrap}>
                  {/* Hour Box */}
                  <TouchableOpacity
                    style={[styles.digitalBox, timeSubTab === 'HOUR' && styles.digitalBoxActive]}
                    onPress={() => setTimeSubTab('HOUR')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.digitalNum, timeSubTab === 'HOUR' && styles.digitalNumActive]}>
                      {hour12 < 10 ? `0${hour12}` : hour12}
                    </Text>
                    <Text style={styles.digitalLabel}>HOUR</Text>
                  </TouchableOpacity>

                  <Text style={styles.digitalColon}>:</Text>

                  {/* Minute Box */}
                  <TouchableOpacity
                    style={[styles.digitalBox, timeSubTab === 'MINUTE' && styles.digitalBoxActive]}
                    onPress={() => setTimeSubTab('MINUTE')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.digitalNum, timeSubTab === 'MINUTE' && styles.digitalNumActive]}>
                      {minute < 10 ? `0${minute}` : minute}
                    </Text>
                    <Text style={styles.digitalLabel}>MINUTE</Text>
                  </TouchableOpacity>

                  {/* AM / PM Toggle Box */}
                  <View style={styles.digitalAmPmBox}>
                    <TouchableOpacity
                      style={[styles.amPmBtn, period === 'AM' && styles.amPmBtnActive]}
                      onPress={() => setPeriod('AM')}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.amPmBtnText, period === 'AM' && styles.amPmBtnTextActive]}>
                        AM
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.amPmBtn, period === 'PM' && styles.amPmBtnActive]}
                      onPress={() => setPeriod('PM')}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.amPmBtnText, period === 'PM' && styles.amPmBtnTextActive]}>
                        PM
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Sub Tab Switcher: [ Choose Hour ] [ Choose Minute ] */}
                <View style={styles.timeModeSwitchRow}>
                  <TouchableOpacity
                    style={[styles.timeModeBtn, timeSubTab === 'HOUR' && styles.timeModeBtnActive]}
                    onPress={() => setTimeSubTab('HOUR')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.timeModeBtnText, timeSubTab === 'HOUR' && styles.timeModeBtnTextActive]}>
                      Select Hour (1 - 12)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.timeModeBtn, timeSubTab === 'MINUTE' && styles.timeModeBtnActive]}
                    onPress={() => setTimeSubTab('MINUTE')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.timeModeBtnText, timeSubTab === 'MINUTE' && styles.timeModeBtnTextActive]}>
                      Select Minute (00 - 55)
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Grid View: Hours or Minutes */}
                {timeSubTab === 'HOUR' ? (
                  <View style={styles.gridContainer}>
                    <Text style={styles.gridHeading}>TAP AN HOUR</Text>
                    <View style={styles.numbersGrid}>
                      {HOURS_GRID.map((h) => {
                        const isSelected = hour12 === h;
                        return (
                          <TouchableOpacity
                            key={h}
                            style={[styles.numberCell, isSelected && styles.numberCellActive]}
                            onPress={() => handleSelectHour(h)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.numberCellText, isSelected && styles.numberCellTextActive]}>
                              {h < 10 ? `0${h}` : h}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ) : (
                  <View style={styles.gridContainer}>
                    <View style={styles.minuteHeadingRow}>
                      <Text style={styles.gridHeading}>TAP A MINUTE</Text>
                      {/* Fine Step Buttons */}
                      <View style={styles.minuteStepperRow}>
                        <TouchableOpacity onPress={() => stepMinute(-1)} style={styles.stepperBtn} activeOpacity={0.7}>
                          <Minus size={14} color="#0F172A" />
                        </TouchableOpacity>
                        <Text style={styles.stepperValue}>{minute < 10 ? `0${minute}` : minute}m</Text>
                        <TouchableOpacity onPress={() => stepMinute(1)} style={styles.stepperBtn} activeOpacity={0.7}>
                          <Plus size={14} color="#0F172A" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.numbersGrid}>
                      {MINUTES_GRID.map((m) => {
                        const isSelected = minute === m;
                        return (
                          <TouchableOpacity
                            key={m}
                            style={[styles.numberCell, isSelected && styles.numberCellActive]}
                            onPress={() => handleSelectMinute(m)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.numberCellText, isSelected && styles.numberCellTextActive]}>
                              :{m < 10 ? `0${m}` : m}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Back to Calendar Link */}
                <TouchableOpacity
                  style={styles.backToDateBtn}
                  onPress={() => setActiveTab('DATE')}
                  activeOpacity={0.7}
                >
                  <ChevronLeft size={16} color="#64748B" />
                  <Text style={styles.backToDateText}>Change Date ({formattedDateStr})</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* =========================================================================
                SUMMARY BANNER
               ========================================================================= */}
            <View style={styles.summaryBanner}>
              <View style={styles.summaryIconBox}>
                <Check size={16} color="#059669" strokeWidth={3} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryLabel}>
                  {mode === 'date' ? 'SELECTED DATE' : 'CONFIRMED SCHEDULE'}
                </Text>
                <Text style={styles.summaryValue}>
                  {mode === 'date' ? formattedDateStr : formattedFullPreview}
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleConfirm} style={styles.confirmBtn} activeOpacity={0.8}>
              <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.confirmBtnText}>
                {mode === 'date' ? 'Confirm Date' : 'Set Follow-up Date'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '92%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  modalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
    fontWeight: '500',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Segmented Tab Bar
  segmentedTabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  segmentTabActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  segmentTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  segmentTabTextActive: {
    color: '#047857',
    fontWeight: '800',
  },

  scrollContent: {
    padding: 16,
    gap: 12,
  },

  // Calendar Card
  calendarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  monthHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthTitleText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  weekdaysRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
  },
  weekdayText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    marginVertical: 2,
  },
  dayCellSelected: {
    backgroundColor: '#10B981',
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  dayCellText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  dayCellTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  dayCellTextToday: {
    color: '#059669',
    fontWeight: '800',
  },
  dayCellTextPast: {
    color: '#CBD5E1',
  },
  nextStepBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingVertical: 10,
  },
  nextStepBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#047857',
  },

  // Time Picker Card
  timePickerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  digitalClockWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  digitalBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    minWidth: 70,
  },
  digitalBoxActive: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  digitalNum: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0F172A',
  },
  digitalNumActive: {
    color: '#047857',
  },
  digitalLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  digitalColon: {
    fontSize: 24,
    fontWeight: '900',
    color: '#64748B',
  },
  digitalAmPmBox: {
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 3,
    gap: 3,
    marginLeft: 6,
  },
  amPmBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  amPmBtnActive: {
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  amPmBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
  },
  amPmBtnTextActive: {
    color: '#FFFFFF',
  },

  // Time Mode Switch Row
  timeModeSwitchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  timeModeBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  timeModeBtnActive: {
    backgroundColor: '#10B981',
  },
  timeModeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  timeModeBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // Grid
  gridContainer: {
    marginBottom: 10,
  },
  gridHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  minuteHeadingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  minuteStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  stepperBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  stepperValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#047857',
  },
  numbersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  numberCell: {
    width: '22%',
    flexGrow: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberCellActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  numberCellText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#334155',
  },
  numberCellTextActive: {
    color: '#FFFFFF',
  },
  backToDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 8,
  },
  backToDateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },

  // Summary Banner
  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 12,
  },
  summaryIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#166534',
    letterSpacing: 0.4,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803D',
    marginTop: 1,
  },

  // Bottom Actions
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FAFAFA',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  confirmBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: '#10B981',
    borderRadius: 10,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
