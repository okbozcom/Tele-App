import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  StatusBar as RNStatusBar,
  useWindowDimensions,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldCheck, Phone, Eye, EyeOff, AlertCircle, Mail, Lock } from 'lucide-react-native';
import { useSafeTopPadding } from '../utils/safeArea';
import { useAuthStore } from '../store/authStore';

// ======================================================================
// DESIGN TOKENS — same palette/rhythm as the rest of the app (HomeScreen)
// ======================================================================
const T = {
  radius: { sm: 10, md: 14, lg: 20 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  color: {
    bg: '#F6FAF8',
    surface: '#FFFFFF',
    surfaceSunken: '#F8FAFC',
    border: '#E7EAEE',
    text: '#111827',
    textMuted: '#6B7280',
    textFaint: '#9CA3AF',
    primary: '#0F9D58',
    primaryDark: '#0B7A44',
    primaryTint: '#E6F4EA',
    danger: '#DC2626',
    dangerTint: '#FEF2F2',
  },
};

const LoginBackground: React.FC<{ isWide: boolean }> = ({ isWide }) => (
  <View style={styles.backgroundContainer} pointerEvents="none">
    <ImageBackground
      source={
        isWide
          ? require('../../assets/login-bg-web.png')
          : require('../../assets/login-bg-mobile.png')
      }
      style={StyleSheet.absoluteFill}
      imageStyle={styles.backgroundImage}
      blurRadius={2}
      resizeMode="cover"
    />
  </View>
);

export const LoginScreen: React.FC = () => {
  const { width, height } = useWindowDimensions();
  const isWide = width >= 860;
  const isCompactMobile = !isWide && height < 720;
  const safeTopPadding = useSafeTopPadding(isWide);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const passwordInputRef = useRef<TextInput>(null);

  const { login, isLoading, error, clearError } = useAuthStore();

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const handleLogin = async () => {
    if (isLoading) return;
    setValidationError(null);
    if (error) clearError();

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setValidationError('Please enter your email address.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setValidationError('Please enter a valid email address (e.g. name@company.com).');
      return;
    }

    if (!password) {
      setValidationError('Please enter your password.');
      passwordInputRef.current?.focus();
      return;
    }

    if (password.length < 4) {
      setValidationError('Password must be at least 4 characters long.');
      passwordInputRef.current?.focus();
      return;
    }

    await login(cleanEmail, password);
  };

  const isReady = Boolean(email.trim() && password) && !isLoading;

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: safeTopPadding }]} edges={['left', 'right']}>
      <RNStatusBar barStyle="dark-content" backgroundColor="transparent" translucent={true} />
      <LoginBackground isWide={isWide} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            !isWide && {
              paddingTop: isCompactMobile
                ? Math.max(72, Math.round(height * 0.12))
                : Math.min(188, Math.round(height * 0.22)),
            },
            isWide && styles.wideScrollContent,
          ]}
          scrollEnabled={isWide || isKeyboardVisible}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.centerContainer, isWide && styles.wideCenterContainer]}>
            {/* Brand Logo & Header */}
            {isWide ? (
              <View style={styles.brandBlock}>
                <View style={styles.logoBadge}>
                  <Phone size={30} color="#FFFFFF" strokeWidth={2.5} />
                </View>
                <Text style={styles.brandTitle}>Hi Talk</Text>
                <Text style={styles.brandSubtitle}>High-velocity calling & lead management</Text>
              </View>
            ) : null}

            {!isWide ? (
              <View
                style={[
                  styles.brandBlock,
                  styles.mobileBrandBlock,
                  isCompactMobile && styles.compactMobileBrandBlock,
                ]}
              >
                <Text style={styles.brandTitle}>Hi Talk</Text>
                <Text style={styles.brandSubtitle}>High-velocity calling & lead management</Text>
              </View>
            ) : null}

            {/* Sign-in Card */}
            <View style={[styles.card, isCompactMobile && styles.compactCard]}>
              <Text style={styles.cardTitle}>Sign in to your desk</Text>
              <Text style={[styles.cardSubtitle, isCompactMobile && styles.compactCardSubtitle]}>
                Enter your agent or manager credentials to start calling
              </Text>

              {/* Error Banner */}
              {validationError || error ? (
                <View style={styles.errorBanner}>
                  <AlertCircle size={16} color={T.color.danger} />
                  <Text style={styles.errorBannerText}>{validationError || error}</Text>
                </View>
              ) : null}

              {/* Email Field */}
              <View style={[styles.fieldGroup, isCompactMobile && styles.compactFieldGroup]}>
                <Text style={styles.fieldLabel}>Email address</Text>
                <View style={[styles.inputWrap, isCompactMobile && styles.compactInputWrap]}>
                  <Mail size={16} color={T.color.textFaint} />
                  <TextInput
                    style={styles.input}
                    placeholder="name@company.com"
                    placeholderTextColor={T.color.textFaint}
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      if (validationError) setValidationError(null);
                      if (error) clearError();
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => passwordInputRef.current?.focus()}
                  />
                </View>
              </View>

              {/* Password Field */}
              <View
                style={[
                  styles.fieldGroup,
                  { marginBottom: T.space.xl - 2 },
                  isCompactMobile && styles.compactPasswordGroup,
                ]}
              >
                <Text style={styles.fieldLabel}>Password</Text>
                <View style={[styles.inputWrap, isCompactMobile && styles.compactInputWrap]}>
                  <Lock size={16} color={T.color.textFaint} />
                  <TextInput
                    ref={passwordInputRef}
                    style={styles.input}
                    placeholder="Enter your password"
                    placeholderTextColor={T.color.textFaint}
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      if (validationError) setValidationError(null);
                      if (error) clearError();
                    }}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {showPassword ? (
                      <EyeOff size={18} color={T.color.textMuted} />
                    ) : (
                      <Eye size={18} color={T.color.textMuted} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Sign In CTA */}
              <TouchableOpacity
                onPress={handleLogin}
                disabled={isLoading}
                activeOpacity={0.85}
                style={[
                  styles.submitBtn,
                  isCompactMobile && styles.compactSubmitBtn,
                  !isReady && styles.submitBtnDisabled,
                ]}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Sign in to workspace</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Footer: security note + locale badges, echoing the brand sketch */}
            <View style={[styles.footerBlock, isCompactMobile && styles.compactFooterBlock]}>
              <View style={styles.securityRow}>
                <ShieldCheck size={15} color={T.color.primary} />
                <Text style={styles.securityText}>Encrypted session · Strict branch isolation</Text>
              </View>
              <View
                style={[
                  styles.localeRow,
                  isCompactMobile && styles.compactLocaleRow,
                ]}
              >
                <Text style={styles.localeText}>🇮🇳  Made for India</Text>
                <View style={styles.localeDot} />
                <Text style={styles.localeText}>Crafted in Tamil Nadu</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: T.color.bg,
  },
  backgroundContainer: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: T.space.xl,
    paddingVertical: T.space.xl + 12,
  },
  wideScrollContent: {
    paddingVertical: T.space.xl * 2,
  },
  centerContainer: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  wideCenterContainer: {
    maxWidth: 440,
  },

  // Brand block
  brandBlock: {
    alignItems: 'center',
    marginBottom: T.space.xl + 4,
  },
  mobileBrandBlock: {
    marginBottom: T.space.lg,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: T.radius.lg,
    backgroundColor: T.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: T.space.md + 2,
    shadowColor: T.color.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 6,
  },
  brandTitle: {
    fontSize: 27,
    fontWeight: '800',
    color: T.color.text,
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 13,
    color: '#525151',
    marginTop: 4,
    fontWeight: '500',
  },

  // Card
  card: {
    backgroundColor: T.color.surface,
    borderRadius: T.radius.lg,
    padding: T.space.xl,
    borderWidth: 1,
    borderColor: T.color.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.07,
    shadowRadius: 20,
    elevation: 4,
    marginBottom: T.space.xl,
  },
  compactCard: {
    padding: T.space.md,
    marginBottom: T.space.sm,
  },
  compactCardSubtitle: {
    fontSize: 11.5,
    marginBottom: T.space.sm + 2,
    lineHeight: 15,
  },
  compactMobileBrandBlock: {
    marginBottom: T.space.sm + 2,
  },
  compactFieldGroup: {
    marginBottom: T.space.sm + 2,
  },
  compactPasswordGroup: {
    marginBottom: T.space.md,
  },
  compactInputWrap: {
    height: 44,
  },
  compactSubmitBtn: {
    height: 46,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: T.color.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12.5,
    color: T.color.textMuted,
    marginBottom: T.space.lg + 4,
    lineHeight: 17,
  },

  errorBanner: {
    backgroundColor: T.color.dangerTint,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: T.radius.sm,
    padding: T.space.md - 1,
    marginBottom: T.space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.space.sm,
  },
  errorBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: T.color.danger,
    flex: 1,
  },

  fieldGroup: {
    marginBottom: T.space.lg,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: T.color.textMuted,
    marginBottom: T.space.sm - 2,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.color.surfaceSunken,
    borderWidth: 1,
    borderColor: T.color.border,
    borderRadius: T.radius.sm,
    paddingHorizontal: T.space.md + 2,
    height: 50,
    gap: T.space.sm + 2,
  },
  input: {
    flex: 1,
    fontSize: 13.5,
    color: T.color.text,
    padding: 0,
  },

  submitBtn: {
    height: 52,
    backgroundColor: T.color.primary,
    borderRadius: T.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: T.color.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 3,
  },
  submitBtnDisabled: {
    backgroundColor: T.color.primary,
    shadowOpacity: 0,
    elevation: 0,
    opacity: 0.9,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Footer
  footerBlock: {
    alignItems: 'center',
    gap: T.space.md,
  },
  compactFooterBlock: {
    gap: T.space.sm,
  },
  compactLocaleRow: {
    flexWrap: 'wrap',
    justifyContent: 'center',
    rowGap: T.space.xs,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.space.sm - 2,
  },
  securityText: {
    fontSize: 12,
    color: T.color.textMuted,
    fontWeight: '500',
  },
  localeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.space.sm + 2,
  },
  localeText: {
    fontSize: 12,
    color: T.color.textMuted,
    fontWeight: '600',
  },
  localeDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: T.color.textFaint,
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
    opacity: 0.88,
  },
});