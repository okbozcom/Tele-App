# Hi Talk — NeoDove Parity Master Implementation Plan

This document serves as the master blueprint, audit, and living progress tracker for achieving 100% behavioral parity with NeoDove in the telecalling CRM modules of Hi Talk (`Tele App`), while preserving all protected features (P1–P6) and UI styling.

---

## 1. End-to-End Inventory of Current Call Flow vs NeoDove Spec

### 1.1 HomeScreen / Calling Desk (`mobile/src/screens/HomeScreen.tsx`)
- **Current Behavior**:
  - Displays greeting, period controls, call statistics derived from local Zustand store (`useLeadHistoryStore`), and a "Hero Lead" card.
  - Fetches 5,000 leads via `fetchMyLeads({ limit: 5000 })` with a 45s polling interval (`mobile/src/screens/HomeScreen.tsx:324-326`).
  - Segregates leads on the client into three queues: `newUnattemptedLeads`, `followUpLeads`, and `notConnectedLeads` (`mobile/src/screens/HomeScreen.tsx:729-751`).
  - "Start Calling" passes the entire array `targetQueue` (up to 5,000 lead objects) inside React Navigation route params (`mobile/src/screens/HomeScreen.tsx:759-764`).
  - Calls are initiated via `handleDirectDial`, which invokes `callSession.startCall`.
- **Differences from NeoDove (Spec 4.1 & 4.2)**:
  - NeoDove has a single unified "Start" button at the top that starts calling by **Priority and Follow-up due time**.
  - NeoDove requires 4 entry points: (a) Priority-wise (Start button), (b) Campaign-wise, (c) My Leads-wise, (d) Filter-wise.
  - All entry points must lead to the **same one-lead-at-a-time call screen** served by a server-side atomic cursor endpoint (`/api/leads/next`), NOT passing serialized 5,000-lead arrays through navigation state.
  - Client calculates stats locally from Zustand instead of reading atomic `DailyStat` from the server.
- **Bugs Identified**:
  - `mobile/src/screens/HomeScreen.tsx:324`: Unbounded 5,000-lead fetch polling every 45s locks client memory and floods Mongo.
  - `mobile/src/screens/HomeScreen.tsx:759-764`: Passing huge `targetQueue` array in navigation route params causes memory bloat and app stuttering.
  - `mobile/src/screens/HomeScreen.tsx:341-359`: Call stats computed from client Zustand store drift from backend database.
- **Planned Fix**:
  - Implement single top "Start" calling button (with org setting `displayStartCallingButton` toggle).
  - Implement atomic `/api/leads/next` cursor endpoint with lease lock.
  - Unify all 4 entry points to consume the single-lead calling desk with next-lead prefetching.
  - Bind stats directly to `/api/stats/today` backed by `DailyStat`.

---

### 1.2 MyLeadsScreen (`mobile/src/screens/MyLeadsScreen.tsx`)
- **Current Behavior**:
  - Renders tabs: All, New, Follow-up, Interested, Not connected, Not Interested.
  - Fetches up to 5,000 leads and filters in memory (`mobile/src/screens/MyLeadsScreen.tsx:505-545`).
  - Allows starting queue calling or clicking an individual lead.
- **Differences from NeoDove (Spec 4.1 & 4.2)**:
  - NeoDove My Leads displays counts for Open, Follow-up, Not Connected with "View" and "Start Calling" buttons.
  - Calling from My Leads should transition into the unified calling desk.
- **Bugs Identified**:
  - `mobile/src/screens/MyLeadsScreen.tsx:661-689`: `handleOpenLead` creates a synthetic lead object with hardcoded `campaignId: 'default-camp'`, dropping real backend metadata.
  - `mobile/src/screens/MyLeadsScreen.tsx:512-516`: Campaign filter matches `campaignName` OR `campaignId`, causing collision when campaigns share names.
  - `mobile/src/screens/MyLeadsScreen.tsx:430-431`: Generates fallback synthetic IDs (`lead-phone-...` / `lead-fallback-...`) if `_id` is missing.
  - `mobile/src/screens/MyLeadsScreen.tsx:617-626`: Unlocks calling lock with arbitrary 2-second timeout without waiting for call lifecycle.
  - Desktop view renders all filtered rows in one unvirtualized DOM table.
- **Planned Fix**:
  - Pass the original backend lead object to modals/desk.
  - Filter strictly by `campaignId`.
  - Enforce stable database IDs; treat missing IDs as data errors.
  - Add virtualized pagination on desktop table and cursor-based loading.

---

### 1.3 LeadDetailScreen & DisposeScreen (`mobile/src/screens/LeadDetailScreen.tsx`, `mobile/src/screens/DisposeScreen.tsx`)
- **Current Behavior**:
  - `DisposeScreen.tsx` is a 7-line wrapper that renders `<LeadDetailScreen />`.
  - `LeadDetailScreen.tsx` manages lead info, call history, WhatsApp messaging, and call disposition.
- **Differences from NeoDove (Spec 4.4)**:
  - NeoDove requires two explicit disposition paths:
    1. **"Yes, Connected"**:
       - Engagement form with campaign-defined questions (all question types: short/long answer, number, date, time, single/multi choice, dropdown, attach file).
       - Pre-drafted WhatsApp/SMS/Email message strip.
       - Stage & Tag selection. If Converted/Lost => CLOSED. Other stages => mandatory follow-up date-time (unless org setting allows disposal without follow-up).
       - Quick follow-up presets (1 hour, Tomorrow, Next week, custom date-time).
       - Optional: Re-assign lead, Copy lead to campaign.
       - Mandatory remark, then Submit.
    2. **"Not Connected"**:
       - 10 standard NeoDove reasons (Did not pick, Busy in another call, User disconnected the call, Switch off, Out of coverage / network issue, Call not connected / could not be completed, Other reason, Incorrect / invalid number, Incoming calls not available, Number not in use).
       - Auto-reschedule retry calculation based on reason retry settings.
       - Mandatory follow-up only if org setting is enabled.
- **Bugs Identified**:
  - Double logging: `callSession.ts:165` logs activity locally in Zustand upon return, and `LeadDetailScreen.tsx:690` submits another activity to the server, resulting in duplicate activities or mismatched timestamps.
  - Recovery: If the app is killed while on a call, the pending disposition is lost.
  - `ActivityService.disposeLead` (`server/src/services/activity.service.ts:49-64`) creates synthetic leads with `9810000129` if leadId is unresolved.
- **Planned Fix**:
  - Separate dial event logging (`clientEventId`) from disposition submission (`idempotencyKey = (leadId, clientEventId)`).
  - Store `pendingCallSession` in persistent storage (`storage.setItem('pending_call_session', ...)`) to restore disposition on app re-open.
  - Implement full NeoDove Disposition v2 (Connected engagement form + Not Connected 10 reasons + retry rules).

---

### 1.4 Call Lifecycle & Duration Accuracy (`callSession.ts`, `android-call.service.ts`, `call.service.ts`)
- **Current Behavior**:
  - `callSession.ts` listens to `AppState` transitions. When app returns from background, it queries `callService.getCallResult(phone, startTime)`.
  - Android queries native `react-native-call-log`.
- **Differences from NeoDove (Spec 4.3 & Section 6)**:
  - Must mark official duration source: `DEVICE_CALL_LOG` for matched Android call logs; `APP_ESTIMATE` for iOS/Web and fallbacks.
  - Auto-dial delay: If org setting "Enable automatic call dialing" is ON, start call after N seconds countdown.
  - Dual-SIM support: Remember agent's preferred SIM card; skip prompt on single-SIM devices.
  - Disconnected dials vs aborted calls: If dialer opened but Back was pressed without dialing (0 duration, no log entry), flag as aborted (`noAttempt = true`) and do not count as a dial attempt.
  - Flag `dispositionMismatch = true` if agent picks Not Connected but duration > 20s or Connected with duration 0.
- **Planned Fix**:
  - Record `durationSource` and `dispositionMismatch` flags on Activity.
  - Implement Dual-SIM preference helper.
  - Add auto-dial countdown modal with Cancel button.

---

### 1.5 FollowUpsScreen (`mobile/src/screens/FollowUpsScreen.tsx`)
- **Current Behavior**:
  - Shows Overdue, Today, Upcoming tabs with countdown labels.
  - Fetches up to 5,000 leads via `fetchMyLeads({ type: 'FOLLOW_UP', limit: 5000 })`.
- **Bugs Identified**:
  - `mobile/src/screens/FollowUpsScreen.tsx:324`: Fetches 5,000 leads without cursor pagination.
  - `mobile/src/screens/FollowUpsScreen.tsx:328-340`: `handleOpenLead` generates synthetic lead with default campaign.
- **Planned Fix**:
  - Pass real lead objects.
  - Use server-side IST date boundaries.
  - Allow "Start Calling" directly from follow-ups queue into the unified calling desk.

---

### 1.6 CallHistoryScreen (`mobile/src/screens/CallHistoryScreen.tsx`)
- **Current Behavior**:
  - Shows Outgoing / Incoming calls with filter tabs and search.
- **Bugs Identified**:
  - Direction logic (`isActivityIncoming`) is duplicated across multiple screens.
  - Call duration display does not specify duration source.
- **Planned Fix**:
  - Use single canonical `isActivityIncoming` helper from shared foundation.
  - Show duration source badge (`Call Log` vs `Estimated`).

---

### 1.7 Reports & Statistics (`ReportService`, `DashboardScreen`, `AgentReportScreen`)
- **Current Behavior**:
  - `ReportService` runs full `Activity.aggregate` on every request.
  - Home screen, Dashboard, and AgentReport each calculate totals differently.
- **Differences from NeoDove (Spec 4.7 & Section 6)**:
  - All screens must read from atomic `DailyStat` collection updated via `$inc` on call activity creation.
  - Numbers for "Today calls made, connected, talk time" must match 100% across Agent screen, Manager dashboard, and Admin reports.
  - Reconcile incremental counters with nightly reconciliation job.
- **Planned Fix**:
  - Create `DailyStat` model and service.
  - Update `ActivityService.disposeLead` to atomically `$inc` `DailyStat`.
  - Expose `GET /api/stats/today`, `GET /api/stats/team`, `GET /api/stats/range`.
  - Create unified React hook `useDailyStats` used across HomeScreen, Dashboard, and AgentReport.

---

### 1.8 Lead Distribution & Assignment (`server/src/services/lead-assignment.service.ts`)
- **Current Behavior**:
  - Supports `EQUAL` and `CONDITIONAL` distribution.
- **Differences from NeoDove (Spec 4.6)**:
  - NeoDove requires **AI Assignment (pull/bucket)**: Leads remain open/unassigned after upload; delivered first-come-first-served to agents actively calling.
  - Equal Assignment: split equally among campaign agents.
  - Conditional Assignment: field value rules -> specific user or group.
  - Duplicate handling: global vs campaign-wise (skip / merge / merge-and-reopen-closed).
  - Bulk actions: Update, Delete (typed confirmation), Move with history, Close.
- **Bugs Identified**:
  - `lead-assignment.service.ts:41-55`: Runs `Lead.aggregate` for every candidate on EVERY lead during upload (N+1 query during bulk ingest).
- **Planned Fix**:
  - Implement AI Pull mode backed by atomic `findOneAndUpdate`.
  - Batch calculate agent lead counts before bulk distribution.
  - Add duplicate mode handlers (`SKIP`, `MERGE`, `MERGE_REOPEN`).

---

### 1.9 Settings & Permissions (`SettingService`, `SettingsScreen`, Section 4.8 & 4.9)
- **Current Behavior**:
  - Settings screen allows updating disposal follow-up toggles and local call delay.
- **Differences from NeoDove (Spec 4.8 & 4.9)**:
  - Add missing NeoDove org settings without touching existing controls (P3):
    - Break manager notification threshold.
    - Enable automatic call dialing + delay interval.
    - Display contact number toggle (number masking).
    - Display Start Calling button.
    - Allow listening to call recordings.
    - Lead duplicacy mode (Global vs Campaign).
    - Retry settings configuration.
    - Lead Priority list.
  - Additive role permissions: Executive / Agent number masking, recording playback permissions.

---

## 2. Living Implementation Checklist

- [x] **Phase 0 — Audit & Protection Lock**
  - [x] Create branch `parity/neodove`
  - [x] Run baseline tests (45 server tests passing, 0 mobile tsc errors)
  - [x] Write `PROTECTED_REGRESSION_TESTS.md`
  - [x] Create automated regression tests locking P1–P6 (`server/tests/protected-regression.test.cjs`)
  - [x] Produce `PARITY_PLAN.md`
  - [x] Produce `EXTRAS_DECISIONS.md`
  - [x] Produce `OPEN_QUESTIONS.md`
  - [x] Produce `LOAD_AUDIT.md`
  - [x] Verify all 62 server tests pass green
- [ ] **Phase 1 — Shared Foundations**
  - [ ] Shared IST calendar day helper (`Asia/Kolkata` day boundary computed on server)
  - [ ] Canonical call direction helper (`isActivityIncoming`)
  - [ ] Client-generated `clientEventId` (UUID) with unique compound index `(userId, clientEventId)`
  - [ ] `DailyStat` Mongoose model + atomic `$inc` updates on Activity writes
  - [ ] Endpoints: `GET /api/stats/today`, `GET /api/stats/team`, `GET /api/stats/range`
  - [ ] Mobile shared `useDailyStats` hook
  - [ ] Request layer: deduplication, stale-while-revalidate, AbortController cancellation
  - [ ] Batch sync endpoint: `POST /api/sync/batch`
  - [ ] Mongo compound indexes & scheduler distributed leader lock
- [ ] **Phase 2 — Call Module**
  - [ ] Dual-SIM selection helper & persistence
  - [ ] Auto-dial delay setting & countdown modal
  - [ ] Persistent pending-disposition restoration on app re-open
  - [ ] Accurate duration recording (`durationSource: DEVICE_CALL_LOG` vs `APP_ESTIMATE`)
  - [ ] Disposition v2: Connected engagement form + message templates + mandatory follow-up clamp
  - [ ] Disposition v2: Not Connected 10 standard reasons + retry rules
- [ ] **Phase 3 — Call Leading (Spec 4.2)**
  - [ ] Server-side atomic cursor endpoint: `POST /api/leads/next` (`findOneAndUpdate` with lease lock)
  - [ ] Admin Lead Priority list configuration
  - [ ] 4 entry points: Priority-wise, Campaign-wise, My Leads-wise, Filter-wise
  - [ ] Lead prefetching during active call
- [ ] **Phase 4 — Lead Assignment & Distribution (Spec 4.6)**
  - [ ] AI Assignment (pull/bucket mode)
  - [ ] Equal & Conditional distribution optimizations (no N+1 queries)
  - [ ] Duplicate handling: Skip, Merge, Merge & Reopen Closed
  - [ ] Custom contact properties
  - [ ] Bulk actions: Update, Delete (typed confirmation), Move with history, Close
- [ ] **Phase 5 — Stats / Reporting Accuracy & Recording (Spec 4.7 & Section 6)**
  - [ ] Reconcile HomeScreen, Dashboard, AgentReport, and ReportGeneratorModal to `DailyStat`
  - [ ] Nightly & on-demand DailyStat reconciliation job
  - [ ] GSM call recording attachment flow (Android)
  - [ ] Admin reports & trend visualizations
- [ ] **Phase 6 — Settings Additions (Spec 4.9) & Roles/Permissions (Spec 4.8)**
  - [ ] Add missing NeoDove org settings in new labeled section on SettingsScreen
  - [ ] Phone number masking permission for Executive role
  - [ ] Call recording playback permissions
- [ ] **Phase 7 — Tasks, Notifications, Language (Spec 4.10)**
  - [ ] Tasks module: Add task from lead, "Assigned to me" / "Reported by me"
  - [ ] 24-hour notifications with unread highlight
  - [ ] Language switcher (English, Tamil, Hindi)
- [ ] **Phase 8 — Extras Cleanup, Bug Sweep, Load Test**
  - [ ] Commit extras removals to `parity(cleanup): ...`
  - [ ] Comprehensive bug sweep verification
  - [ ] Load test script in `server/loadtest/` targeting 300 agents / 50 managers / 50k rows
  - [ ] Produce `LOAD_TEST.md`
  - [ ] Produce `PARITY_REPORT.md`
  - [ ] Wait for user's explicit "push" instruction
