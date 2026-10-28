import { AppState, AppStateStatus } from 'react-native';
import { callService } from './call.service';
import { incomingCallSyncService } from './incomingCallSync.service';
import { useLeadHistoryStore } from '../store/leadHistoryStore';
import { useAuthStore } from '../store/authStore';
import { Lead, DetectedCallResult } from '../types';
import { navigationRef } from '../navigation/RootNavigator';

export interface StartCallOptions {
  callerSource?: 'DIALPAD' | 'QUEUE' | 'LEAD_DETAIL' | 'CALL_HISTORY' | 'MY_LEADS' | 'FOLLOW_UPS';
  queue?: Lead[];
  queueIndex?: number;
  onCallComplete?: (result: DetectedCallResult) => void;
}

interface ActiveCallSession {
  lead: Lead;
  startTime: number;
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
  }

  public getActiveSession(): ActiveCallSession | null {
    return this.activeSession;
  }

  public isCallInProgress(): boolean {
    return this.isCalling;
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

    this.activeSession = {
      lead,
      startTime: Date.now(),
      callerSource: options?.callerSource || 'DIRECT',
      queue: options?.queue,
      queueIndex: options?.queueIndex,
      onCallComplete: options?.onCallComplete,
    };
    this.isCalling = true;

    try {
      const ok = await callService.startCall(lead);
      if (!ok) {
        this.activeSession = null;
        this.isCalling = false;
      }
      return ok;
    } catch (err) {
      this.activeSession = null;
      this.isCalling = false;
      throw err;
    }
  }

  public cancelActiveSession() {
    this.activeSession = null;
    this.isCalling = false;
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

      const startTime = session.startTime;
      const lead = session.lead;

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

      // ==============================================================
      // NEODOVE-GRADE VERIFICATION: Was a call actually placed?
      // If the agent opened the dialer and pressed Back without dialing,
      // NO call log entry exists. DO NOT increment call count or log activity!
      // ==============================================================
      const wasCallActuallyPlaced = result.callPlaced ?? result.matchedLog ?? false;

      let classificationReason: string;
      if (!wasCallActuallyPlaced) {
        classificationReason = 'AGENT_ABORTED_OR_CANCELLED';
      } else if (result.connected && result.durationSeconds >= 5) {
        classificationReason = 'CONNECTED_TALK_TIME';
      } else if (result.connected && result.durationSeconds > 0) {
        classificationReason = 'BRIEF_CONNECTED';
      } else {
        classificationReason = 'UNANSWERED_0S';
      }

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
        (result as any).logId ||
        `call-${startTime}-${lead.phone.replace(/\D/g, '').slice(-10)}`;
      const idempotencyKey = `disp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      // Record strictly 1 single deduplicated activity in useLeadHistoryStore
      try {
        const user = useAuthStore.getState().user;
        useLeadHistoryStore.getState().addActivity(lead._id, {
          phone: lead.phone,
          customerName: lead.name,
          agentName: user?.name,
          agentId: user?._id,
          branch: user?.branch,
          connected: result.connected,
          type: 'CALL',
          direction: 'OUTGOING',
          notConnectedReason: result.connected ? undefined : 'DID_NOT_PICK',
          stage: result.connected
            ? lead.stage === 'New'
              ? 'Connected'
              : lead.stage
            : 'Not Connected',
          durationSeconds: result.connected ? result.durationSeconds : 0,
          remark: result.connected ? 'Call completed' : 'Call not answered',
          callLogId: stableCallLogId,
          idempotencyKey,
          classificationReason,
        });
      } catch (logErr) {
        console.warn('[CallSession] Failed to auto-log call activity:', logErr);
      }

      // Invoke optional callback if the caller registered one
      try {
        session.onCallComplete?.({
          ...result,
          callLogId: stableCallLogId,
          classificationReason,
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
              idempotencyKey,
              classificationReason,
              ...(session.queue && session.queueIndex !== undefined
                ? { queue: session.queue, queueIndex: session.queueIndex }
                : {}),
            });
          }
          // Also sync any incoming / missed calls in the background
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
