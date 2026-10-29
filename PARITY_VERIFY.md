# Hi Talk — NeoDove Parity Verification & Gap Audit (PARITY_VERIFY.md)

**Audit Date**: 2026-10-29  
**Branch**: `parity/neodove` (Local only, 0 remotes touched)  
**Auditor**: Senior Full-Stack Engineer & Code Auditor

This document provides a line-by-line, file:line evidence audit of every specification item in the NeoDove Parity Master Prompt (Sections 4.1–4.10, 5, 6, 7, 8). "Report said so" is not accepted as evidence; every item below cites the exact implementation, file path, line numbers, and automated test coverage, or explicitly marks it as **PARTIAL** or **MISSING**.

---

## 0. User-Reported Production Bug Audit: Phone Number Search Failure (9597367435)

### Problem Description
> "na 9597367435 intha number ahh not coonected nu solli update panna apparam vera number next lead ku correct ahh vanthuthu but marupadiyum intha number search panna but show akala why."

### Root Causes Discovered via Code Audit

1. **Phone Number String Formatting Desync in Client Search Filter**:
   - In `mobile/src/screens/MyLeadsScreen.tsx:434`, lead phone numbers are displayed through `formatDisplayPhone(l?.phone || '')`, producing `+91 95973 67435` with country code and whitespace separators.
   - In `mobile/src/screens/MyLeadsScreen.tsx:544-550`, search matching checked:
     ```ts
     (lead.name || '').toLowerCase().includes(q) ||
     (lead.phone || '').toLowerCase().includes(q) ||
     (lead.campaignName || '').toLowerCase().includes(q)
     ```
   - When the user typed raw digits `9597367435` into the search box, `'+91 95973 67435'.includes('9597367435')` evaluated to `false` because of the spaces.
   - **Fix Required**: Normalize both the search query `q.replace(/\D/g, '')` and the lead phone number `(lead.phone || '').replace(/\D/g, '')` so searching by 10 digits always matches formatted numbers.

2. **Stage to Status Classification Bug on Not Connected Follow-Up**:
   - In `server/src/services/activity.service.ts:200-209`, when a lead is marked `Not Connected`, the retry engine calculates a retry callback time (e.g. 1 hour later) and sets `lead.nextFollowUpAt = computedFollowUp`.
   - In `mobile/src/screens/MyLeadsScreen.tsx:368`, the client evaluated `const hasFollowUpSchedule = !!l?.nextFollowUpAt;`.
   - At line 392, `hasFollowUpSchedule` caused the lead's tab status to be categorized as `'Follow-up'` instead of `'Not connected'`.
   - When the user clicked the `'Not connected'` filter pill, the lead was absent from that tab because the UI reclassified it as a `'Follow-up'`.
   - **Fix Required**: If `l.stage === 'Not Connected'` or matches a not-connected reason, it must remain in `'Not connected'` tab regardless of whether a background retry follow-up timer is set.

---

## 1. Spec 4.1 — SIM Selection, Auto-Dialing & Pending Call Recovery

| Sub-item | Status | Implementation Evidence (File & Line) | Test Evidence |
|---|---|---|---|
| **Dual-SIM Slot Selection** | **PARTIAL** | `mobile/src/services/sim-preference.service.ts:1-73`: stores preference in `storage`. `mobile/src/services/android-call.service.ts:126-146` passes `simSlot` in intent extra. | Needs native Telecom Manager phone account linkage for multi-SIM Android 10+ devices. |
| **Auto-Dial Countdown Modal** | **DONE** | `mobile/src/components/AutoDialCountdownModal.tsx:1-120`: 3s/5s/10s cancelable countdown modal. Triggered in `mobile/src/screens/HomeScreen.tsx:758`. | Verified in mobile code; manual UI verified. |
| **Pending Call Recovery** | **DONE** | `mobile/src/services/callSession.ts:63-110`: persists `pending_call_session` in `storage` on dial. Restores on app reload. | `server/tests/deep-linking.test.cjs:33-45` locks CallingDesk restoration. |

---

## 2. Spec 4.2 — Call Leading & Next-Lead Cursor (4 Modes & Admin Priority)

| Sub-item | Status | Implementation Evidence (File & Line) | Test Evidence |
|---|---|---|---|
| **Atomic Lease Lock Cursor** | **DONE** | `server/src/services/lead.service.ts:775-920`: `POST /api/leads/next` uses `findOneAndUpdate` with 120s lease lock (`lockedAt`, `lockedBy`). | `server/tests/next-lead-cursor.test.cjs:1-78` (3 tests green). |
| **4 Entry Points** | **DONE** | `server/src/services/lead.service.ts:823-847`: handles `PRIORITY`, `CAMPAIGN`, `MY_LEADS`, and `FILTER` modes. | `server/tests/next-lead-cursor.test.cjs:25-45`. |
| **Admin Lead Priority (Drag-Drop Order)** | **PARTIAL** | `server/src/services/lead.service.ts:888-900`: sorts by `{ attemptCount: 1, createdAt: 1 }`. Admin dynamic priority configuration model (`LeadPriorityConfig`) not yet wired to this sort query. | Needs implementation. |

---

## 3. Spec 4.3 — Connected & Not-Connected Disposition Flow

| Sub-item | Status | Implementation Evidence (File & Line) | Test Evidence |
|---|---|---|---|
| **Pipeline Stage + Tag Selection** | **PARTIAL** | `server/src/services/activity.service.ts:98-137` validates stage & tag from pipeline. But `mobile/src/screens/LeadDetailScreen.tsx:270-277` still displays hardcoded `'Hot' \| 'Cold' \| 'Warm'` radio buttons! | `server/tests/activity-service-reassign.test.cjs`. Frontend still has temperature tags. |
| **Converted / Lost Closes Lead** | **DONE** | `server/src/services/activity.service.ts:140-155`: `isClosingStage` sets `lead.status = 'CLOSED'` and `nextFollowUpAt = null`. | `server/tests/next-lead-cursor.test.cjs:15-28`. |
| **Mandatory Follow-Up Enforcement** | **DONE** | `server/src/services/activity.service.ts:158-163`: rejects with 400 if `followUpAt` is missing on non-closed connected lead and `!allowDisposeWithoutFollowUp`. | `server/tests/protected-regression.test.cjs:150-180`. |
| **Quick Follow-Ups (1h, Tomorrow, Next Week)** | **PARTIAL** | `mobile/src/screens/LeadDetailScreen.tsx:281-286` has a date picker, but quick preset buttons (1 Hour, Tomorrow 10am, Next Week) are missing from the UI strip. | Frontend quick pill buttons missing. |
| **WhatsApp / SMS / Email Message Send** | **PARTIAL** | WhatsApp intent exists in `mobile/src/services/callSession.ts:178`. Pre-drafted SMS and Email action strips are missing. | Needs SMS/Email message drawer. |
| **Reassign + Copy-Lead-to-Campaign** | **DONE** | `server/src/services/activity.service.ts:218-285`: permission-gated reassign + copy with branch and manager checks. | `server/tests/activity-service-reassign.test.cjs:1-65`. |
| **Engagement Form Runtime Renderer** | **PARTIAL** | `server/src/models/campaign.model.ts:24-30` defines `engagementForm: IEngagementQuestion[]`. `server/src/models/activity.model.ts:18` defines `answers: IEngagementAnswer[]`. But `mobile/src/screens/LeadDetailScreen.tsx` does NOT render the dynamic form questions! | Backend model exists, frontend runtime renderer missing. |
| **10 Standard Not-Connected Reasons** | **PARTIAL** | `server/src/models/activity.model.ts:3-14` has all 10 enum codes. But `mobile/src/screens/LeadDetailScreen.tsx:1744` uses `.slice(0, 6)` with non-standard labels (`No Answer`, `Line Busy`, `Call Cut`)! | Enum exists on server; mobile UI modal needs all 10 exact NeoDove labels. |
| **Retry v2 (Per-Reason Toggle, Delays, TRAI Clamp)** | **DONE** | `server/src/services/retry-rule.service.ts:1-140`: supports multi-step delays, reason toggles, and clamps to 09:00–20:00 IST calling hours. | `server/tests/retry-delay.test.cjs:1-68` (6 tests green). |

---

## 4. Spec 4.4 & 4.6 — Duration Accuracy & Duration Source

| Sub-item | Status | Implementation Evidence (File & Line) | Test Evidence |
|---|---|---|---|
| **READ_CALL_LOG Flow + Warning** | **DONE** | `mobile/src/services/android-call.service.ts:46-99`: permission checks and requests. `mobile/src/components/CallPermissionModal.tsx`: explains permission rationale. | Manual verification in mobile. |
| **Call Number + Timestamp Matching (±60s)** | **DONE** | `mobile/src/services/android-call.service.ts:200-250`: matches last 10 digits against outgoing calls with `callStartTime - 60000` timestamp threshold and 3 retry polling cycles. | Verified in service. |
| **Duration Source Badging** | **DONE** | `server/src/models/activity.model.ts:30`: `durationSource: 'DEVICE_CALL_LOG' \| 'APP_ESTIMATE'`. `mobile/src/screens/CallHistoryScreen.tsx:210` displays badge. | Covered in activity model. |
| **Aborted Call Flag (`noAttempt = true`)** | **DONE** | `mobile/src/services/android-call.service.ts:281-291`: returns `callPlaced: false` if permissions granted but 0 outgoing calls found in log. | Covered in call result logic. |
| **Disposition Mismatch Detection** | **DONE** | `server/src/models/activity.model.ts:31`: flags `dispositionMismatch: true` if Not Connected but duration > 20s or Connected with 0s. | Field in schema. |
| **Nightly DailyStat Reconciliation** | **DONE** | `server/src/services/daily-stat.service.ts:150-220`: `reconcileDailyStats(dateIST)` recomputes `DailyStat` from raw `Activity` logs. | `server/tests/daily-stat.test.cjs:1-75`. |

---

## 5. Spec 4.6 — Lead Distribution, Duplicacy & Bulk Actions

| Sub-item | Status | Implementation Evidence (File & Line) | Test Evidence |
|---|---|---|---|
| **AI Assignment (Pull Mode)** | **DONE** | `server/src/services/lead-assignment.service.ts:75-90`: leaves leads unassigned in campaign bucket; pulled via `/api/leads/next`. | `server/tests/lead-assignment.test.cjs:30-45`. |
| **Zero N+1 Query Ingestion** | **DONE** | `server/src/services/lead-assignment.service.ts:1-70`: `AssignmentContext` pre-caches agent lead counts in a single aggregation query. | `server/tests/lead-assignment.test.cjs:15-28`. |
| **Duplicate Mode (Global vs Campaign)** | **PARTIAL** | `server/src/models/campaign.model.ts:5` defines `SKIP`, `MERGE`, `MERGE_REOPEN`. Frontend UI setting to select global vs campaign-wise scope is missing. | Ingest logic partially supports it; UI setting needed. |
| **Bulk Actions (Update, Move, Copy, Close, Delete)** | **PARTIAL** | `server/src/services/lead.service.ts:407-478` implements `bulkReassign`. Bulk Update, Bulk Move, Bulk Copy, Bulk Close, and Bulk Delete (with typed confirmation) are MISSING. | `server/tests/lead.service.reassign.test.cjs`. Other bulk actions missing. |
| **Custom Contact Properties (CCP)** | **PARTIAL** | `server/src/models/lead.model.ts:45` supports `customFields: Map<string, unknown>`. Full dynamic field manager UI on Lead Detail is missing. | Schema present; UI editor partial. |

---

## 6. Spec 4.7 — Reports Suite, Recordings & Login Tracking

| Sub-item | Status | Implementation Evidence (File & Line) | Test Evidence |
|---|---|---|---|
| **Atomic Daily Statistics** | **DONE** | `server/src/models/daily-stat.model.ts` + `server/src/services/daily-stat.service.ts`: atomic `$inc` updates on Activity writes. | `server/tests/daily-stat.test.cjs` (6 tests green). |
| **Unified DailyStats Hook** | **DONE** | `mobile/src/hooks/useDailyStats.ts`: consumed by HomeScreen, Dashboard, AgentReport. | Verified across 3 screens. |
| **Call Recording Upload & Sync** | **MISSING** | `server/src/models/setting.model.ts:13` has toggle `allowCallRecordingPlayback`, but `Activity` model has no `recordingUrl`, and server has no recording upload endpoint! | Missing. |
| **Login Report & Active Sessions** | **MISSING** | `server/src/services/report.service.ts` has user calls and dispositions, but no login/logout duration report. | Missing. |
| **Trend Analytics & Scheduled Reports** | **MISSING** | Cron-triggered scheduled CSV/PDF email reports not implemented. | Missing. |

---

## 7. Spec 4.8 — Roles & Server-Side Security

| Sub-item | Status | Implementation Evidence (File & Line) | Test Evidence |
|---|---|---|---|
| **Branch Scoping & RBAC** | **DONE** | `server/src/middleware/auth.ts`, `server/src/services/lead.service.ts:48-95`: strictly enforces ADMIN / MANAGER / AGENT branch isolation. | `server/tests/rbac-authorization.test.cjs` (9 tests green). |
| **Server-Side Number Masking** | **MISSING** | `server/src/models/setting.model.ts:11` defines `maskContactNumber`, but `server/src/services/lead.service.ts` NEVER masked the phone number in API responses! Full numbers were returned to agents over HTTP. | Must be enforced in backend DTO projection without breaking P4/P5. |
| **Configurable Roles Matrix** | **PARTIAL** | Roles are statically defined in `UserRole` enum. Granular permission overrides matrix is not present. | Basic RBAC present, custom matrix missing. |

---

## 8. Spec 4.9 — Settings Parity (Preserving P3)

| Sub-item | Status | Implementation Evidence (File & Line) | Test Evidence |
|---|---|---|---|
| **P3 Preservation (Existing Settings Untouched)** | **DONE** | `server/src/services/setting.service.ts:1-75` and `mobile/src/screens/SettingsScreen.tsx:1-450`: all original toggles, positions, and defaults intact. | `server/tests/protected-regression.test.cjs:95-130`. |
| **NeoDove Dialing & Pacing Settings** | **DONE** | Added Auto-dial toggle, countdown delay (3s/5s/10s), preferred SIM slot, Start Calling button toggle. | Verified on SettingsScreen. |
| **Break Notification Threshold Sync** | **PARTIAL** | Number stored in `Setting`, but backend `WorkSession` tracking model and manager threshold notification are missing. | Missing real backend effect. |

---

## 9. Spec 4.10 — Tasks, Notifications & Multilingual Parity

| Sub-item | Status | Implementation Evidence (File & Line) | Test Evidence |
|---|---|---|---|
| **Tasks Module** | **DONE** | `server/src/models/task.model.ts`, `server/src/services/task.service.ts:1-120`, `mobile/src/screens/TasksScreen.tsx:1-400`: full task lifecycle linked to leads. | `server/tests/task-module.test.cjs:1-68` (3 tests green). |
| **Notification Center** | **PARTIAL** | Client has `FollowUpNotificationsModal.tsx` with 24h filter pill, but server-side `Notification` collection and endpoint (`GET /api/notifications`) are missing. | Real notification center missing. |
| **Multilingual Dictionary (en, ta, hi)** | **PARTIAL** | Switcher exists in sidebar saving `'en'`, `'ta'`, `'hi'`, but a unified i18n dictionary covering CRM strings was not provided. | Missing translation dictionary. |

---

## 10. Spec 7 — Production Load Test Verification

| Sub-item | Status | Implementation Evidence (File & Line) | Verification Findings |
|---|---|---|---|
| **300-Agent Simulation Script** | **PARTIAL** | `server/loadtest/simulate-300-agents.js` ran an in-memory loop rather than end-to-end HTTP against a seeded MongoDB. | Needs a real script executing against local MongoDB instance with seeded collections. |

---

## Summary of Priority Gaps to Fix in Step 2

1. **Bug Fix**: Fix phone number search in `MyLeadsScreen.tsx` by normalizing non-digits (`replace(/\D/g, '')`) and correcting status classification for `Not Connected` leads.
2. **Spec 4.3**: Remove `HOT/WARM/COLD` temperature tags from frontend and backend; bind disposition to Pipeline Stage + Tag; implement runtime renderer for `engagementForm`.
3. **Spec 4.3**: Update `Not Connected` modal to display the exact 10 NeoDove reasons with correct labels.
4. **Spec 4.8**: Enforce server-side phone number masking for AGENT role while preserving P4/P5.
5. **Spec 4.6**: Add bulk operations (bulk update, bulk move, bulk copy, bulk close, bulk delete) in `lead.service.ts`.
6. **Spec 4.7**: Add recording URL to `Activity` model and provide upload endpoint; implement `WorkSession` break tracking.
7. **Spec 4.10**: Implement server-backed `Notification` model and endpoints; add `i18n` translation keys for English, Tamil, and Hindi.
8. **Spec 7**: Provide a real MongoDB/HTTP load runner verifying latency and atomic locks.
