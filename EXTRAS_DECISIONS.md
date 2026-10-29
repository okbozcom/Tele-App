# Hi Talk — Non-NeoDove Extras Decisions & Inventory

This document reviews every feature and implementation pattern in the in-scope telecalling modules that has **NO direct equivalent in NeoDove**, evaluating each against Section 5 (Extras Policy) and Section 1 (Protected Items).

---

## 1. Decision Summary Table

| Feature / Artifact | Location in Codebase | NeoDove Equivalent? | Protected? | Recommendation | Rationale |
|---|---|---|---|---|---|
| **TRAI Legal Calling Hours (09:00–20:00 IST)** | `mobile/src/utils/callingHours.ts`, `server/tests/calling-hours.test.cjs` | No (NeoDove allows any time) | No (Rule 5b) | **KEEP** | Essential TRAI/DoT regulatory compliance in India; prevents telecalling violations and harassment penalties. |
| **Multi-Branch Data Model & Scoping** | `server/src/models/branch.model.ts`, `user.model.ts`, `lead.model.ts` | No (NeoDove uses Teams/Depts) | Yes (P2, P6, Rule 5d) | **KEEP** | Core structural requirement of Hi Talk multi-branch operations. Protected under P2 and P6. |
| **Offline Outbox & Background Sync** | `mobile/src/store/outboxStore.ts`, `services/callSession.ts` | Partial | No (Rule 5c) | **KEEP & HARDEN** | Essential infrastructure for field agents with intermittent mobile connectivity. Upgraded to batch sync (`POST /api/sync/batch`). |
| **System Diagnostics Screen & VPS Health** | `mobile/src/screens/DiagnosticsScreen.tsx`, `/api/health` | No | No (Rule 5c) | **KEEP** | Critical operational tooling for monitoring server status, memory, database latency, and telephony permissions. |
| **Deal Amount & Currency in Activity** | `server/src/models/activity.model.ts` | No | No | **KEEP (DEPRECATED)** | Preserved in schema with default `INR` to maintain backward compatibility with any existing deal documents. |
| **Synthetic Lead Auto-Creation on Disposed Number** | `server/src/services/activity.service.ts:49-64` (`9810000129`) | No | No | **REMOVE** | Concept error. If a lead ID cannot be resolved, the API must return `404 Not Found` rather than fabricating dummy database leads. |
| **Client-side 5,000-Lead Memory Queuing** | `mobile/src/screens/HomeScreen.tsx:324, 729-751` | No | No | **REMOVE / REPLACE** | Concept error and severe memory hog. Replaced with server-side atomic cursor endpoint (`/api/leads/next`). |
| **Synthetic Fallback IDs (`lead-phone-...`)** | `mobile/src/screens/MyLeadsScreen.tsx:430-431` | No | No | **REMOVE** | Dangerous fallback that causes collisions. Require stable MongoDB `_id`; flag records without IDs as data errors. |
| **Synthetic Lead Construction in `handleOpenLead`** | `mobile/src/screens/MyLeadsScreen.tsx:661-689`, `FollowUpsScreen.tsx:328` | No | No | **REMOVE** | Drops actual campaign IDs and overwrites timestamps. Replaced with passing the original backend lead object. |
| **Arbitrary 2-Second Calling Lock Timeout** | `mobile/src/screens/MyLeadsScreen.tsx:623-626` | No | No | **REMOVE** | Does not track true call lifecycle. Replaced with real call detection via `callSession`. |
| **Local Zustand-only Call History Calculations** | `mobile/src/screens/HomeScreen.tsx:341-359` | No | No | **REPLACE** | Causes client-server statistics drift. Replaced with unified `useDailyStats` reading `DailyStat` from server. |

---

## 2. Items Requiring Owner Decision (`OPEN_QUESTIONS.md`)

None of the above REMOVE actions break protected items P1–P6 or degrade system resilience. All cleanups will be committed atomically on branch `parity/neodove` under commit tag `parity(cleanup): ...` so that any individual item can be inspected or reverted if required.
