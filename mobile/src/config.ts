import { Platform } from 'react-native';

/**
 * API Configuration
 *
 * Intelligent Environment Resolution:
 * 1. Web on Localhost/127.0.0.1: Connects directly to local backend (http://localhost:5000/api)
 * 2. Web in Production (hitalk.in, call.okboz.co.in): Uses current host origin (/api)
 * 3. Mobile / Emulator / Remote: Uses EXPO_PUBLIC_API_URL or production fallback
 */
const getDefaultApiBaseUrl = (): string => {
  // If running in a web browser:
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;
    // Local development web server (e.g. localhost:8081, localhost:19006, 127.0.0.1)
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:5000/api';
    }
    // Deployed production web app (hitalk.in, call.okboz.co.in, or any custom domain)
    if (window.location.origin && window.location.origin !== 'null') {
      return `${window.location.origin}/api`;
    }
  }

  // Native mobile (Android / iOS):
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // Android emulator in dev mode
  if (Platform.OS === 'android' && typeof __DEV__ !== 'undefined' && __DEV__) {
    return 'http://10.0.2.2:5000/api';
  }

  return 'https://tele-app-nvbb.onrender.com/api';
};

export const API_BASE_URL = getDefaultApiBaseUrl();
