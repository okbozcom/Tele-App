# Hi Talk — NeoDove Parity Open Questions & Architecture Notes

This document logs real blockers, architectural assumptions, and platform-specific constraints identified during the audit.

---

## 1. Cloud IVR vs Device GSM SIM Telephony
- **Context**: NeoDove reference documentation notes that "incoming logs only exist for IVR; GSM/SIM calls produce outgoing logs."
- **Current Hi Talk Architecture**:
  - Operates as a device-native SIM telecalling CRM on Android/iOS/Web using GSM cellular connections (`android.intent.action.CALL` / `tel:`).
  - No third-party cloud telephony vendor (Twilio, Exotel, MCube) is integrated or provisioned.
- **Resolution**:
  - We continue operating in device GSM SIM mode.
  - Outgoing calls are initiated via the native SIM dialer with Dual-SIM support.
  - On Android, incoming calls are captured via the device call log listener (`incomingCallSyncService`), whereas in environments without IVR, agent call reports focus on outbound telecalling performance.
  - No blocker for current parity objectives.

---

## 2. iOS & Web Operating System Call Log Access Limitation
- **Context**: Apple iOS sandbox policies strictly forbid any third-party app from reading the device call log (`android.provider.CallLog.Calls`). Web browsers similarly do not have access to cellular call logs.
- **Resolution**:
  - Android remains the primary production telecalling platform with exact duration extracted directly from `CallLog.Calls` (`durationSource = 'DEVICE_CALL_LOG'`).
  - iOS and Web clients utilize app-measured elapsed duration flagged with `durationSource = 'APP_ESTIMATE'`.
  - Reports will distinguish between `DEVICE_CALL_LOG` and `APP_ESTIMATE`.

---

## 3. TRAI Regulatory Calling Hours (09:00–20:00 IST)
- **Context**: Telecom Regulatory Authority of India (TRAI) and Department of Telecommunications (DoT) prohibit commercial telecalling outside 09:00 to 20:00 local time.
- **Resolution**:
  - Per Section 5(b) of the Master Prompt, this legal safeguard is retained. Auto-reschedule retries and follow-up date pickers will continue clamping timestamps falling outside 09:00–20:00 IST to 09:30 AM the next morning.
