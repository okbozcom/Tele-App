import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Clipboard,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  Phone,
  Delete,
  X,
  User,
  ClipboardPaste,
  ChevronDown,
  Layers,
  PhoneCall,
  UserPlus,
} from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useDialerStore } from '../store/dialerStore';
import { useCampaignStore } from '../store/campaignStore';
import { fetchCampaigns, createWalkInLead } from '../api/leadApi';
import { callService } from '../services/call.service';
import { callSession } from '../services/callSession';
import { toast } from '../store/toastStore';
import { Campaign, Lead } from '../types';

const KEYPAD_BUTTONS = [
  { digit: '1', sub: '' },
  { digit: '2', sub: 'ABC' },
  { digit: '3', sub: 'DEF' },
  { digit: '4', sub: 'GHI' },
  { digit: '5', sub: 'JKL' },
  { digit: '6', sub: 'MNO' },
  { digit: '7', sub: 'PQRS' },
  { digit: '8', sub: 'TUV' },
  { digit: '9', sub: 'WXYZ' },
  { digit: '*', sub: '' },
  { digit: '0', sub: '+' },
  { digit: '#', sub: '' },
];

export const DirectDialpadModal: React.FC = () => {
  const navigation = useNavigation<any>();
  const {
    isOpen,
    phoneNumber,
    customerName,
    campaignId: storeCampaignId,
    closeDialer,
    setPhoneNumber,
    setCustomerName,
    appendDigit,
    backspace,
    clear,
  } = useDialerStore();

  const globalCampaignId = useCampaignStore((s) => s.selectedCampaignId);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [showCampaignPicker, setShowCampaignPicker] = useState(false);

  // Fetch campaigns to link the direct call activity
  const { data: campaignData } = useQuery({
    queryKey: ['campaigns'],
    queryFn: fetchCampaigns,
  });

  const campaigns: Campaign[] = useMemo(() => {
    return (campaignData?.campaigns || []).filter((c) => c.isActive !== false);
  }, [campaignData]);

  useEffect(() => {
    if (storeCampaignId) {
      setSelectedCampaignId(storeCampaignId);
    } else if (globalCampaignId && globalCampaignId !== 'All campaigns') {
      setSelectedCampaignId(globalCampaignId);
    } else if (campaigns.length > 0 && !selectedCampaignId) {
      setSelectedCampaignId(campaigns[0]._id);
    }
  }, [storeCampaignId, globalCampaignId, campaigns, selectedCampaignId]);

  const selectedCampaignName = useMemo(() => {
    if (!selectedCampaignId) return campaigns[0]?.name || 'General Campaign';
    const found = campaigns.find((c) => c._id === selectedCampaignId);
    return found ? found.name : 'General Campaign';
  }, [selectedCampaignId, campaigns]);

  const handlePaste = async () => {
    try {
      const content = await Clipboard.getString();
      if (content) {
        const cleaned = content.replace(/[^0-9+*#]/g, '');
        if (cleaned) {
          setPhoneNumber(cleaned);
          toast.info('Pasted from clipboard', 'Keypad');
        }
      }
    } catch {
      // Ignore clipboard error
    }
  };

  const handleCall = async () => {
    const cleanDigits = phoneNumber.replace(/\D/g, '');
    if (cleanDigits.length < 5) {
      Alert.alert('Invalid Number', 'Please enter a valid phone number (at least 5 digits).');
      return;
    }

    const targetCampaignId = selectedCampaignId || campaigns[0]?._id;
    const leadName = customerName.trim() || `Direct Call (${phoneNumber.trim()})`;

    // Automatically ensure the lead is saved in MongoDB under the agent's campaign immediately
    if (targetCampaignId) {
      createWalkInLead(targetCampaignId, {
        name: leadName,
        phone: phoneNumber.trim(),
      }).catch((err) => {
        console.warn('[DirectDialpad] Auto-saving lead in campaign:', err);
      });
    }

    const activeLead: Lead = {
      _id: `dial-${cleanDigits}`,
      campaignId: targetCampaignId || 'default',
      name: leadName,
      phone: phoneNumber.trim(),
      source: 'DIRECT',
      stage: 'New',
      status: 'OPEN',
      attemptCount: 1,
      customProperties: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    closeDialer();
    toast.info(`Dialing ${phoneNumber.trim()} via SIM...`, 'Calling');

    try {
      await callSession.startCall(activeLead, {
        callerSource: 'DIALPAD',
      });
    } catch (err) {
      Alert.alert('Call Error', 'Could not open device phone dialer.');
    }
  };

  const handleSaveAsLead = () => {
    closeDialer();
    navigation.navigate('AddWalkInLead', {
      phone: phoneNumber.trim(),
      name: customerName.trim(),
      campaignId: selectedCampaignId || undefined,
    });
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={closeDialer}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.backdropPressArea}
          activeOpacity={1}
          onPress={closeDialer}
        />
        <View style={styles.card}>
          {/* Top Drag Handle (NeoDove Bottom Sheet Style) */}
          <View style={styles.sheetHandle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.iconCircle}>
                <PhoneCall size={16} color="#0F9D58" strokeWidth={2.5} />
              </View>
              <View>
                <Text style={styles.headerTitle}>Phone Keypad</Text>
                <Text style={styles.headerSub}>Free SIM Calling · No extra charges</Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={closeDialer}
              style={styles.closeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Number Display Area */}
          <View style={styles.displayArea}>
            <TextInput
              style={styles.numberDisplayInput}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="Enter phone number"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              autoFocus={false}
            />

            <View style={styles.displayActions}>
              <TouchableOpacity
                onPress={handlePaste}
                style={styles.displayActionBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel="Paste number"
              >
                <ClipboardPaste size={16} color="#0F9D58" />
              </TouchableOpacity>

              {phoneNumber.length > 0 && (
                <TouchableOpacity
                  onPress={backspace}
                  onLongPress={clear}
                  style={styles.displayActionBtn}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityLabel="Delete digit"
                >
                  <Delete size={18} color="#EF4444" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Optional Meta Row: Name & Campaign */}
          <View style={styles.metaRow}>
            <View style={styles.nameInputWrap}>
              <User size={13} color="#94A3B8" />
              <TextInput
                style={styles.nameInput}
                placeholder="Contact Name (optional)"
                placeholderTextColor="#94A3B8"
                value={customerName}
                onChangeText={setCustomerName}
              />
            </View>

            {campaigns.length > 0 && (
              <TouchableOpacity
                style={styles.campaignSelectBtn}
                onPress={() => setShowCampaignPicker(!showCampaignPicker)}
                activeOpacity={0.7}
              >
                <Layers size={12} color="#0F766E" />
                <Text style={styles.campaignSelectText} numberOfLines={1}>
                  {selectedCampaignName}
                </Text>
                <ChevronDown size={12} color="#0F766E" />
              </TouchableOpacity>
            )}
          </View>

          {/* Campaign Dropdown */}
          {showCampaignPicker && (
            <View style={styles.dropdownBox}>
              <ScrollView style={{ maxHeight: 110 }}>
                {campaigns.map((camp) => (
                  <TouchableOpacity
                    key={camp._id}
                    style={styles.dropdownItem}
                    onPress={() => {
                      setSelectedCampaignId(camp._id);
                      setShowCampaignPicker(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        selectedCampaignId === camp._id && styles.dropdownItemTextActive,
                      ]}
                    >
                      {camp.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* 12 Keypad Buttons (3 Columns x 4 Rows) */}
          <View style={styles.keypadGrid}>
            {KEYPAD_BUTTONS.map((item) => (
              <TouchableOpacity
                key={item.digit}
                style={styles.keypadBtn}
                onPress={() => appendDigit(item.digit)}
                onLongPress={() => {
                  if (item.digit === '0') appendDigit('+');
                }}
                activeOpacity={0.65}
              >
                <Text style={styles.keypadDigit}>{item.digit}</Text>
                {item.sub ? <Text style={styles.keypadSub}>{item.sub}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>

          {/* Actions: Big Green Call Button + Save as Lead Option */}
          <View style={styles.bottomActions}>
            <TouchableOpacity
              style={styles.callNowBtn}
              onPress={handleCall}
              activeOpacity={0.85}
            >
              <Phone size={18} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.callNowText}>Call Number</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveAsLeadBtn}
              onPress={handleSaveAsLead}
              activeOpacity={0.75}
            >
              <UserPlus size={13} color="#0F9D58" strokeWidth={2.2} />
              <Text style={styles.saveAsLeadText}>Save as Walk-in Lead</Text>
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
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: 0,
  },
  backdropPressArea: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  closeBtn: {
    padding: 4,
  },
  displayArea: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 8,
  },
  numberDisplayInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
    paddingVertical: 0,
  },
  displayActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  displayActionBtn: {
    padding: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  nameInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    height: 32,
    gap: 4,
  },
  nameInput: {
    flex: 1,
    fontSize: 11.5,
    color: '#0F172A',
    paddingVertical: 0,
  },
  campaignSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 32,
    gap: 4,
    maxWidth: 130,
  },
  campaignSelectText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
    flex: 1,
  },
  dropdownBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropdownItemText: {
    fontSize: 12,
    color: '#334155',
  },
  dropdownItemTextActive: {
    color: '#0F9D58',
    fontWeight: '700',
  },
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  keypadBtn: {
    width: '30%',
    aspectRatio: 1.65,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadDigit: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 24,
  },
  keypadSub: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1,
    marginTop: -1,
  },
  bottomActions: {
    gap: 8,
  },
  callNowBtn: {
    backgroundColor: '#0F9D58',
    height: 46,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#0F9D58',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  callNowText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  saveAsLeadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 6,
  },
  saveAsLeadText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F9D58',
  },
});
