import { AppState, AppStateStatus } from 'react-native';
import { callService } from './call.service';
import { incomingCallSyncService } from './incomingCallSync.service';
import { useAuthStore } from '../store/authStore';
import { Lead, DetectedCallResult } from '../types';
import { navigationRef } from '../navigation/RootNavigator';
import { storage } from '../utils/storage';
import { fetchDialTarget } from '../api/leadApi';

export interface StartCallOptions {
  callerSource?: 'DIALPAD' | 'QUEUE' | 'LEAD_DETAIL' | 'CALL_HISTORY' | 'MY_LEADS' | 'FOLLOW_UPS';
  queue?: Lead[];
  queueIndex?: number;
  clientEventId?: string;
  onCallComplete?: (result: DetectedCallResult) => void;
}

interface ActiveCallSession {
  lead: Lead;
  startTime: number;
  clientEventId: string;
  callerSource: string;
  queue?: Lead[];
  queueIndex?: number;
  onCallComplete?: (result: DetectedCallResult) => void;
}

class CallSessionManager {
  private activeSession: ActiveCallSession | null = null;
  private isCalling: boolean = false;
  private appState: AppStateStatus = AppState.currentState;
  private isInitialized: boolean = false;
  private isProcessingReturn: boolean = false;

  public init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    AppState.addEventListener('change', (nextState) => {
      this.handleAppStateChange(nextState);
    });

    // Check for orphaned pending call session (e.g. app killed while agent was on a call)
    this.recoverPendingSession().catch(() => {});
  }

  public getActiveSession(): ActiveCallSession | null {
    return this.activeSession;
  }

  public isCallInProgress(): boolean {
    return this.isCalling;
  }

  /**
   * Recovers any active session saved before an unexpected app kill or restart.
   */
  private async recoverPendingSession() {
    try {
      const raw = await storage.getItem('tele_pending_call_session');
      if (!raw) return;

      await storage.removeItem('tele_pending_call_session');
      const session = JSON.parse(raw);
      if (!session || !session.lead || !session.startTime) return;

      const elapsed = Date.now() - session.startTime;
      // Only recover if the call started within the last 2 hours
      if (elapsed > 2 * 60 * 60 * 1000) return;

      console.log('[CallSession] Recovering pending call session for:', session.lead.name);
      const result = await callService.getCallResult(session.lead.phone, session.startTime);

      if (result.callPlaced ?? result.matchedLog ?? false) {
        setTimeout(() => {
          if (navigationRef.isReady()) {
            navigationRef.navigate('Dispose', {
              lead: session.lead,
              initialTab: 'DISPOSE LEAD',
              callDurationSeconds: result.durationSeconds || 0,
              isCallConnected: result.connected,
              callAttempt: true,
              detectionMethod: 'RECOVERED_SESSION',
              autoOpenNotConnectedSheet: !result.connected,
              clientEventId: session.clientEventId,
              startedAt: new Date(session.startTime).toISOString(),
              durationSource: result.matchedLog ? 'DEVICE_CALL_LOG' : 'APP_ESTIMATE',
            });
          }
        }, 1000);
      }
    } catch (err) {
      console.warn('[CallSession] Failed to recover pending session:', err);
    }
  }

  public async startCall(lead: Lead, options?: StartCallOptions): Promise<boolean> {
    if (!lead || !lead.phone) {
      console.warn('[CallSession] Cannot start call: missing lead or phone');
      return false;
    }

    if (this.isCalling) {
      console.warn('[CallSession] A call is already in progress, ignoring duplicate startCall');
      return false;
    }

    const clientEventId =
      options?.clientEventId || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    this.activeSession = {
      lead,
      startTime: Date.now(),
      clientEventId,
      callerSource: options?.callerSource || 'DIRECT',
      queue: options?.queue,
      queueIndex: options?.queueIndex,
      onCallComplete: options?.onCallComplete,
    };
    this.isCalling = true;

    // Persist pending session immediately so crash / kill does not lose disposition
    storage
      .setItem(
        'tele_pending_call_session',
        JSON.stringify({
          lead,
          startTime: this.activeSession.startTime,
          clientEventId,
          callerSource: this.activeSession.callerSource,
        }),
      )
      .catch(() => {});

    try {
      let dialableLead = lead;
      if (lead.phone.includes('*') && lead._id) {
        try {
          const dialRes = await fetchDialTarget(lead._id);
          if (dialRes && dialRes.dialNumber) {
            dialableLead = { ...lead, phone: dialRes.dialNumber };
          }
        } catch (dialErr) {
          console.warn('[CallSession] Failed to resolve dial target for masked lead:', dialErr);
        }
      }

      const ok = await callService.startCall(dialableLead);
      if (!ok) {
        this.activeSession = null;
        this.isCalling = false;
        storage.removeItem('tele_pending_call_session').catch(() => {});
      }
      return ok;
    } catch (err) {
      this.activeSession = null;
      this.isCalling = false;
      storage.removeItem('tele_pending_call_session').catch(() => {});
      throw err;
    }
  }

  public cancelActiveSession() {
    this.activeSession = null;
    this.isCalling = false;
    storage.removeItem('tele_pending_call_session').catch(() => {});
  }

  private async handleAppStateChange(nextState: AppStateStatus) {
    const prevState = this.appState;
    this.appState = nextState;

    // Detect transition from background/inactive back to foreground active
    if (
      (prevState === 'background' || prevState === 'inactive') &&
      nextState === 'active' &&
      this.isCalling &&
      this.activeSession &&
      !this.isProcessingReturn
    ) {
      this.isProcessingReturn = true;
      const session = this.activeSession;
      this.activeSession = null;
      this.isCalling = false;

      // Clear persisted pending session from storage
      storage.removeItem('tele_pending_call_session').catch(() => {});

      const startTime = session.startTime;
      const lead = session.lead;
      const clientEventId = session.clientEventId;

      let result: DetectedCallResult = { connected: false, durationSeconds: 0 };
      try {
        // Bounded retry loop (immediate, 600ms, 1200ms) to accommodate asynchronous OEM call-log flushes
        result = await callService.getCallResult(lead.phone, startTime);
        if (!result.callPlaced && !result.matchedLog) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          result = await callService.getCallResult(lead.phone, startTime);
        }
        if (!result.callPlaced && !result.matchedLog) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          result = await callService.getCallResult(lead.phone, startTime);
        }
      } catch (err) {
        console.warn('[CallSession] Error fetching call result:', err);
        result = { connected: false, durationSeconds: 0 };
      }

      // Was a call actually placed? If user pressed back without dialing, do not count attempt
      const wasCallActuallyPlaced = result.callPlaced ?? result.matchedLog ?? false;

      if (!wasCallActuallyPlaced) {
        console.log(
          '[CallSession] Outbound call was not placed or cancelled before dialing. Discarding without logging.',
        );
        this.isProcessingReturn = false;
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { toast } = require('../store/toastStore');
          toast.info('Call was cancelled without dialing.', 'Call Cancelled');
        } catch {}
        return;
      }

      const stableCallLogId =
        (result as any).logId || `call-${startTime}-${lead.phone.replace(/\D/g, '').slice(-10)}`;
      const durationSource = result.matchedLog ? 'DEVICE_CALL_LOG' : 'APP_ESTIMATE';

      // Invoke optional callback if the caller registered one
      try {
        session.onCallComplete?.({
          ...result,
          callLogId: stableCallLogId,
        });
      } catch (cbErr) {
        console.warn('[CallSession] onCallComplete callback error:', cbErr);
      }

      // Seamless navigation directly into DisposeScreen / Lead Details
      setTimeout(() => {
        try {
          if (navigationRef.isReady()) {
            navigationRef.navigate('Dispose', {
              lead,
              initialTab: 'DISPOSE LEAD',
              callDurationSeconds: result.connected ? result.durationSeconds : 0,
              isCallConnected: result.connected,
              callAttempt: true,
              detectionMethod: 'AUTOMATIC',
              autoOpenNotConnectedSheet: !result.connected,
              callLogId: stableCallLogId,
              clientEventId,
              startedAt: new Date(startTime).toISOString(),
              durationSource,
              ...(session.queue && session.queueIndex !== undefined
                ? { queue: session.queue, queueIndex: session.queueIndex }
                : {}),
            });
          }
          // Sync any incoming / missed calls in the background
          incomingCallSyncService.syncIncomingCalls().catch(() => {});
        } catch (navErr) {
          console.warn('[CallSession] Navigation to Dispose screen failed:', navErr);
        } finally {
          this.isProcessingReturn = false;
        }
      }, 150);
    }
  }
}

export const callSession = new CallSessionManager();
