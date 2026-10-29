import { PermissionsAndroid, Platform, NativeModules } from 'react-native';
import { DeviceCallService, ICallService } from './call.service';
import { Lead, DetectedCallResult } from '../types';

interface RawCallLogEntry {
  id: string;
  phoneNumber?: string;
  duration?: number | string;
  timestamp?: string | number;
  dateTime?: string;
  type?: string;
  rawType?: number;
  simId?: string | number;
  subId?: string | number;
  phoneAccountId?: string;
}

export class AndroidCallService extends DeviceCallService implements ICallService {
  /**
   * Safely acquires the native react-native-call-log module if present in the runtime.
   * Gracefully returns null on iOS, Web, or Expo Go where native module is not linked.
   */
  private getCallLogsModule(): { load: (limit: number, filter?: Record<string, unknown>) => Promise<RawCallLogEntry[]> } | null {
    if (Platform.OS !== 'android') {
      return null;
    }

    try {
      const isTurboModule = (globalThis as { __turboModuleProxy?: unknown }).__turboModuleProxy != null;
      if (!isTurboModule && !NativeModules?.CallLogs) {
        return null;
      }

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const callLogPkg = require('react-native-call-log');
      return callLogPkg.default || callLogPkg;
    } catch (err) {
      console.warn('[AndroidCallService] react-native-call-log is not linked or unavailable:', err);
      return null;
    }
  }

  /**
   * Checks whether the user has granted READ_CALL_LOG, READ_PHONE_STATE, and CALL_PHONE permissions.
   */
  public async checkPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }

    try {
      const hasReadCallLog = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
      );
      const hasReadPhoneState = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
      );
      const hasCallPhone = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.CALL_PHONE,
      );

      return hasReadCallLog && hasReadPhoneState && hasCallPhone;
    } catch (error) {
      console.warn('[AndroidCallService] checkPermissions error:', error);
      return false;
    }
  }

  /**
   * Requests runtime READ_CALL_LOG, READ_PHONE_STATE, and CALL_PHONE permissions on Android.
   */
  public async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return false;
    }

    try {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
        PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
        PermissionsAndroid.PERMISSIONS.CALL_PHONE,
      ]);

      const callLogGranted =
        results[PermissionsAndroid.PERMISSIONS.READ_CALL_LOG] ===
        PermissionsAndroid.RESULTS.GRANTED;
      const phoneStateGranted =
        results[PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE] ===
        PermissionsAndroid.RESULTS.GRANTED;
      const callPhoneGranted =
        results[PermissionsAndroid.PERMISSIONS.CALL_PHONE] ===
        PermissionsAndroid.RESULTS.GRANTED;

      return callLogGranted && phoneStateGranted && callPhoneGranted;
    } catch (error) {
      console.warn('[AndroidCallService] requestPermissions error:', error);
      return false;
    }
  }

  /**
   * Initiates direct phone call without opening the phone keypad, using Intent.ACTION_CALL.
   * Falls back gracefully to ACTION_DIAL if permission not granted or unsupported.
   */
  public override async startCall(lead: Lead): Promise<boolean> {
    if (!lead || !lead.phone) {
      console.warn('[AndroidCallService] Cannot start call: Missing phone number');
      return false;
    }

    let rawPhone = lead.phone;
    if (rawPhone.includes('*') && lead._id) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { fetchDialTarget } = require('../api/leadApi');
        const res = await fetchDialTarget(lead._id);
        if (res && res.dialNumber) {
          rawPhone = res.dialNumber;
        }
      } catch (e) {
        console.warn('[AndroidCallService] Could not resolve dial target for masked lead:', e);
      }
    }

    const cleanNumber = rawPhone.replace(/[^\d+*#]/g, '').trim();
    if (!cleanNumber) return false;

    // Check & request CALL_PHONE permission if needed
    try {
      const hasCallPerm = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CALL_PHONE);
      if (!hasCallPerm) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CALL_PHONE);
      }
    } catch {
      // Continue to call attempt
    }

    // Attempt direct phone call using IntentLauncher (android.intent.action.CALL)
    try {
      // Check for user-configured preferred SIM slot (0 for SIM 1, 1 for SIM 2)
      let simSlot: number | null = null;
      try {
        const { SimPreferenceService } = require('./sim-preference.service');
        simSlot = await SimPreferenceService.getPreferredSimSlot();
      } catch {}

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const IntentLauncher = require('expo-intent-launcher');
      if (IntentLauncher && IntentLauncher.startActivityAsync) {
        const intentParams: Record<string, unknown> = {
          data: `tel:${cleanNumber}`,
        };
        if (simSlot !== null) {
          intentParams.extra = {
            'com.android.phone.extra.slot': simSlot,
            simSlot: simSlot,
            simId: simSlot,
          };
        }
        await IntentLauncher.startActivityAsync('android.intent.action.CALL', intentParams);
        return true;
      }
    } catch (launcherErr) {
      console.log('[AndroidCallService] Direct ACTION_CALL fallback to tel URL:', launcherErr);
    }

    return super.startCall(lead);
  }

  /**
   * Normalizes a phone string into its core 10 digits for accurate matching across formats (+91, 0, spaces).
   */
  private extractCoreDigits(phone: string): string {
    const digits = (phone || '').replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
  }

  /**
   * Searches the device call log for the outbound call matching the lead's number after callStartTime.
   * If found: returns duration and connected (duration > 0).
   * If not found or permissions denied: falls back to elapsed wall-clock time.
   */
  public async getCallResult(phone: string, callStartTime: number): Promise<DetectedCallResult> {
    // 1. Non-Android platforms or missing permissions -> fallback to wall-clock calculation
    if (Platform.OS !== 'android') {
      return super.getCallResult(phone, callStartTime);
    }

    const hasPermission = await this.checkPermissions();
    if (!hasPermission) {
      console.log('[AndroidCallService] Permissions not granted. Falling back to elapsed wall-clock time.');
      return super.getCallResult(phone, callStartTime);
    }

    const CallLogsModule = this.getCallLogsModule();
    if (!CallLogsModule) {
      console.log('[AndroidCallService] Native CallLogs module not linked. Falling back to elapsed wall-clock time.');
      return super.getCallResult(phone, callStartTime);
    }

    const targetDigits = this.extractCoreDigits(phone);
    if (!targetDigits) {
      return super.getCallResult(phone, callStartTime);
    }

    // Helper to query and match logs
    const findMatchingLog = async (): Promise<RawCallLogEntry | null> => {
      try {
        // Query the latest 20 call entries
        const logs = await CallLogsModule.load(20);
        if (!Array.isArray(logs) || logs.length === 0) {
          return null;
        }

        // Look for outbound call to this phone number made near or after callStartTime
        // Allow a 60s window before callStartTime to account for minor clock discrepancies
        const minTimestamp = callStartTime - 60000;

        for (const log of logs) {
          const logDigits = this.extractCoreDigits(log.phoneNumber || '');
          const isPhoneMatch =
            logDigits.length >= 7 &&
            (logDigits === targetDigits ||
              targetDigits.endsWith(logDigits) ||
              logDigits.endsWith(targetDigits));

          const rawType = typeof log.rawType === 'number' ? log.rawType : -1;
          const typeStr = (log.type || '').toUpperCase();
          // Outgoing call in Android is type 2 or 'OUTGOING'
          const isOutgoing = rawType === 2 || typeStr.includes('OUT');

          const timestamp = typeof log.timestamp === 'number'
            ? log.timestamp
            : parseInt(String(log.timestamp || '0'), 10);

          const isRecent = !isNaN(timestamp) && timestamp > 0 ? timestamp >= minTimestamp : true;

          if (isPhoneMatch && isOutgoing && isRecent) {
            return log;
          }
        }

        return null;
      } catch (err) {
        console.warn('[AndroidCallService] Query call logs error:', err);
        return null;
      }
    };

    // First attempt to match call log immediately
    let matchedLog = await findMatchingLog();

    // If not found immediately, wait 700ms and retry once (Android OS often delays writing call log)
    if (!matchedLog) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      matchedLog = await findMatchingLog();
    }

    // Third retry at 800ms to guarantee detection
    if (!matchedLog) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      matchedLog = await findMatchingLog();
    }

    if (matchedLog) {
      const rawDuration = matchedLog.duration;
      const durationSeconds = typeof rawDuration === 'number'
        ? rawDuration
        : parseInt(String(rawDuration || '0'), 10);

      const isConnected = durationSeconds > 0;

      console.log(
        `[AndroidCallService] Verified outbound call log for ${phone}: duration=${durationSeconds}s, connected=${isConnected}`,
      );

      const simAttr =
        matchedLog.simId != null
          ? String(matchedLog.simId)
          : matchedLog.subId != null
          ? String(matchedLog.subId)
          : undefined;

      return {
        callPlaced: true,
        durationSeconds: Math.max(0, durationSeconds),
        connected: isConnected,
        rawType: matchedLog.type || String(matchedLog.rawType),
        matchedLog: true,
        simId: simAttr,
      };
    }

    // NeoDove-Grade Verification:
    // If permissions are granted and no outgoing call was registered in Android call log,
    // the agent opened dialer and came back WITHOUT calling. It MUST NOT be counted!
    console.log(
      `[AndroidCallService] No outbound call log entry found for ${phone}. User cancelled or did not dial.`,
    );
    return {
      callPlaced: false,
      durationSeconds: 0,
      connected: false,
      matchedLog: false,
    };
  }
}

export const androidCallService = new AndroidCallService();
