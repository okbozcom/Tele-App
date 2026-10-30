import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { Phone, X, Clock } from 'lucide-react-native';
import { colors, borderRadius } from '../theme';

interface AutoDialCountdownModalProps {
  visible: boolean;
  seconds?: number;
  leadName: string;
  leadPhone: string;
  onCallNow: () => void;
  onCancel: () => void;
}

export const AutoDialCountdownModal: React.FC<AutoDialCountdownModalProps> = ({
  visible,
  seconds = 5,
  leadName,
  leadPhone,
  onCallNow,
  onCancel,
}) => {
  const [remaining, setRemaining] = useState<number>(seconds);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) {
      setRemaining(seconds);
      return;
    }

    setRemaining(seconds);
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onCallNow();
          return 0;
        }
        // Pulse animation on each tick
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.15, duration: 120, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1.0, duration: 120, useNativeDriver: true }),
        ]).start();
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [visible, seconds]);

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.clockIconWrap}>
              <Clock size={20} color={colors.primary} />
            </View>
            <Text style={styles.headerTitle}>Auto-Dialing Lead</Text>
            <TouchableOpacity onPress={onCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <Text style={styles.leadName} numberOfLines={1}>
              {leadName || 'Next Lead'}
            </Text>
            <Text style={styles.leadPhone}>{leadPhone}</Text>

            <Animated.View style={[styles.counterCircle, { transform: [{ scale: scaleAnim }] }]}>
              <Text style={styles.counterText}>{remaining}</Text>
              <Text style={styles.counterLabel}>sec</Text>
            </Animated.View>
            <Text style={styles.subtext}>Call will start automatically</Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.callNowBtn} onPress={onCallNow} activeOpacity={0.8}>
              <Phone size={18} color="#FFFFFF" />
              <Text style={styles.callNowBtnText}>Call Now</Text>
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
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  clockIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginLeft: 12,
  },
  body: {
    alignItems: 'center',
    marginVertical: 12,
  },
  leadName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  leadPhone: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 18,
  },
  counterCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryLight,
    borderWidth: 3,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  counterText: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
    lineHeight: 32,
  },
  counterLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primaryDark,
    textTransform: 'uppercase',
  },
  subtext: {
    fontSize: 13,
    color: colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  callNowBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 13,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  callNowBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
