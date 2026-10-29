import { Linking, Platform } from 'react-native';
import { Lead, DetectedCallResult } from '../types';
import { normalizePhoneDigits } from '../utils/phoneUtils';

export interface ICallService {
  startCall(lead: Lead): Promise<boolean>;
  openWhatsApp(phone: string, text?: string): Promise<boolean>;
  checkPermissions(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
  getCallResult(phone: string, callStartTime: number): Promise<DetectedCallResult>;
}

export class DeviceCallService implements ICallService {
  /**
   * Initiates a phone call to the lead's phone number using the native dialer.
   * Cleans non-digit characters for dialing compatibility.
   */
  public async startCall(lead: Lead): Promise<boolean> {
    if (!lead || !lead.phone) {
      console.warn('[CallService] Cannot start call: Missing phone number');
      return false;
    }

    let cleanNumber = lead.phone.trim();
    if (cleanNumber.includes('*') && lead._id) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { fetchDialTarget } = require('../api/leadApi');
        const res = await fetchDialTarget(lead._id);
        if (res && res.dialNumber) {
          cleanNumber = res.dialNumber.trim();
        }
      } catch (e) {
        console.warn('[CallService] Could not resolve dial target for masked lead:', e);
      }
    }
    const telUrl = `tel:${cleanNumber}`;

    try {
      if (Platform.OS === 'web') {
        window.open(telUrl, '_self');
        return true;
      }

      await Linking.openURL(telUrl);
      return true;
    } catch (error) {
      console.warn('[CallService] Failed to open phone dialer:', error);
      return false;
    }
  }

  /**
   * Opens WhatsApp chat with the specified phone number.
   * Strips all non-digit characters and prefixes country code (default 91 for India if 10 digits).
   */
  public async openWhatsApp(phone: string, text?: string): Promise<boolean> {
    if (!phone) {
      return false;
    }

    const digitsOnly = normalizePhoneDigits(phone);
    const target = digitsOnly.length === 10 ? `91${digitsOnly}` : phone.replace(/\D/g, '');
    const encodedText = text ? encodeURIComponent(text) : '';
    const nativeWaUrl = `whatsapp://send?phone=${target}${encodedText ? `&text=${encodedText}` : ''}`;
    const webWaUrl = `https://wa.me/${target}${encodedText ? `?text=${encodedText}` : ''}`;

    try {
      if (Platform.OS === 'web') {
        window.open(webWaUrl, '_blank');
        return true;
      }

      // 1. Try opening via native WhatsApp URI scheme if installed
      const canOpenNative = await Linking.canOpenURL(nativeWaUrl).catch(() => false);
      if (canOpenNative) {
        await Linking.openURL(nativeWaUrl);
        return true;
      }

      // 2. Fallback to HTTPS web wa.me intent
      const canOpenWeb = await Linking.canOpenURL(webWaUrl).catch(() => false);
      if (canOpenWeb) {
        await Linking.openURL(webWaUrl);
        return true;
      }

      await Linking.openURL(webWaUrl);
      return true;
    } catch {
      try {
        await Linking.openURL(webWaUrl);
        return true;
      } catch (error) {
        console.warn('[CallService] Failed to open WhatsApp URL:', error);
        return false;
      }
    }
  }

  /**
   * Default permissions check for standard/fallback platforms.
   */
  public async checkPermissions(): Promise<boolean> {
    return false;
  }

  /**
   * Default permissions request for standard/fallback platforms.
   */
  public async requestPermissions(): Promise<boolean> {
    return false;
  }

  /**
   * Calculates call result using elapsed wall-clock time when native call log is not available.
   */
  public async getCallResult(_phone: string, callStartTime: number): Promise<DetectedCallResult> {
    const elapsedSeconds = Math.max(0, Math.round((Date.now() - callStartTime) / 1000));
    const wasPlaced = elapsedSeconds >= 5;
    return {
      callPlaced: wasPlaced,
      durationSeconds: wasPlaced ? elapsedSeconds : 0,
      connected: wasPlaced,
      matchedLog: false,
    };
  }
}

let activeCallService: ICallService | null = null;

const getActiveCallService = (): ICallService => {
  if (!activeCallService) {
    if (Platform.OS === 'android') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { androidCallService } = require('./android-call.service');
      activeCallService = androidCallService;
    } else {
      activeCallService = new DeviceCallService();
    }
  }
  return activeCallService!;
};

export const callService: ICallService = {
  startCall: (lead) => getActiveCallService().startCall(lead),
  openWhatsApp: (phone, text) => getActiveCallService().openWhatsApp(phone, text),
  checkPermissions: () => getActiveCallService().checkPermissions?.() ?? Promise.resolve(false),
  requestPermissions: () => getActiveCallService().requestPermissions?.() ?? Promise.resolve(false),
  getCallResult: (phone, start) => getActiveCallService().getCallResult(phone, start),
};
