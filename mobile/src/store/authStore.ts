import { create } from 'zustand';
import axios from 'axios';
import { User } from '../types';
import { storage } from '../utils/storage';
import { API_BASE_URL } from '../config';
import { UserRegistry } from '../utils/userRegistry';
import { toast } from './toastStore';
import { useLeadHistoryStore } from './leadHistoryStore';

const TOKEN_KEY = 'tele_app_auth_token';
const USER_KEY = 'tele_app_auth_user';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  switchDemoAccount: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  error: null,

  login: async (email: string, password: string): Promise<boolean> => {
    set({ isLoading: true, error: null });
    const cleanEmail = email.trim().toLowerCase();

    // 1. Attempt backend login
    try {
      const response = await axios.post<{ token: string; user: User }>(
        `${API_BASE_URL}/auth/login`,
        { email: cleanEmail, password },
        { timeout: 8000 },
      );

      const { token, user } = response.data;

      // Sync user into local registry
      await UserRegistry.saveUser(
        {
          name: user.name,
          email: user.email,
          phone: user.phone || '9876543210',
          role: user.role,
          branch: user.branch,
          isActive: user.isActive,
          canReceiveLeads: user.canReceiveLeads,
          password: password,
        },
        user._id,
      );

      await storage.setItem(TOKEN_KEY, token);
      await storage.setItem(USER_KEY, JSON.stringify(user));

      set({ token, user, isLoading: false, error: null });
      toast.success(
        `Welcome back, ${user.name}! Logged in as ${user.role}${user.branch ? ` (${user.branch})` : ''}`,
        'Login Successful',
      );
      return true;
    } catch (err: unknown) {
      // 2. If backend is offline or credentials failed, verify with persistent UserRegistry
      try {
        const localUser = await UserRegistry.verifyCredentials(cleanEmail, password);
        if (localUser) {
          const sessionToken = `auth-session-${localUser._id}-${Date.now()}`;
          const authenticatedUser: User = {
            _id: localUser._id,
            name: localUser.name,
            email: localUser.email,
            phone: localUser.phone,
            role: localUser.role,
            branch: localUser.branch,
            isActive: localUser.isActive,
            canReceiveLeads: localUser.canReceiveLeads,
            createdAt: localUser.createdAt,
            updatedAt: localUser.updatedAt,
          };

          await storage.setItem(TOKEN_KEY, sessionToken);
          await storage.setItem(USER_KEY, JSON.stringify(authenticatedUser));
          set({ token: sessionToken, user: authenticatedUser, isLoading: false, error: null });
          toast.success(
            `Welcome back, ${authenticatedUser.name}! (${authenticatedUser.role}${authenticatedUser.branch ? ` - ${authenticatedUser.branch}` : ''})`,
            'Login Successful',
          );
          return true;
        }
      } catch (localErr: any) {
        set({
          error: localErr?.message || 'Authentication failed. Please check credentials.',
          isLoading: false,
        });
        toast.error(localErr?.message || 'Authentication failed. Please check credentials.');
        return false;
      }

      let errorMessage = 'Invalid email or password. Please check your credentials.';
      if (axios.isAxiosError(err) && err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      set({ error: errorMessage, isLoading: false });
      toast.error(errorMessage, 'Login Failed');
      return false;
    }
  },

  switchDemoAccount: async (email: string): Promise<void> => {
    const cleanEmail = email.trim().toLowerCase();
    const localUser = await UserRegistry.findByEmail(cleanEmail);
    if (localUser) {
      const mockToken = `demo-token-${localUser._id}`;
      const userObj: User = {
        _id: localUser._id,
        name: localUser.name,
        email: localUser.email,
        phone: localUser.phone,
        role: localUser.role,
        branch: localUser.branch,
        isActive: localUser.isActive,
        canReceiveLeads: localUser.canReceiveLeads,
        createdAt: localUser.createdAt,
        updatedAt: localUser.updatedAt,
      };
      await storage.setItem(TOKEN_KEY, mockToken);
      await storage.setItem(USER_KEY, JSON.stringify(userObj));
      set({ token: mockToken, user: userObj, isLoading: false, error: null });
      toast.info(`Switched active profile to ${userObj.name} (${userObj.role})`, 'Profile Switched');
    }
  },

  logout: async (): Promise<void> => {
    await storage.removeItem(TOKEN_KEY);
    await storage.removeItem(USER_KEY);
    await storage.removeItem('tele_crm_my_leads_cache_v2');
    await useLeadHistoryStore.getState().clearHistory();
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem('hi_talk_last_screen');
        localStorage.removeItem('hi_talk_last_params');
      } catch {}
    }
    set({ user: null, token: null, error: null, isLoading: false });
    toast.info('You have been logged out safely.', 'Signed Out');
  },

  restoreSession: async (): Promise<void> => {
    set({ isLoading: true });
    try {
      const token = await storage.getItem(TOKEN_KEY);

      // If no token exists, do NOT auto-login to any account. Remain on LoginScreen.
      if (!token) {
        set({ token: null, user: null, isLoading: false });
        return;
      }

      // Verify token with backend if it's a real JWT token
      if (
        !token.startsWith('demo-') &&
        !token.startsWith('mock-') &&
        !token.startsWith('auth-session-')
      ) {
        try {
          const response = await axios.get<{ user: User }>(`${API_BASE_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 15000,
          });

          const user = response.data.user;
          await storage.setItem(USER_KEY, JSON.stringify(user));
          set({ token, user, isLoading: false, error: null });
          return;
        } catch {
          // If backend fails due to network/cold-start, fallback to cached user
        }
      }

      // Restore from cached user
      const cachedUserStr = await storage.getItem(USER_KEY);
      if (cachedUserStr) {
        const user = JSON.parse(cachedUserStr) as User;
        set({ token, user, isLoading: false, error: null });
        return;
      }

      set({ token: null, user: null, isLoading: false });
    } catch {
      set({ token: null, user: null, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
