# Hi Talk — Production Load & Database Concurrency Audit

This document identifies all request patterns, database hot paths, polling frequencies, N+1 query loops, and missing indexes capable of causing server exhaustion, based on the production target:
**300 concurrent agents, 50 managers/admins, peak ~ 1 call + disposition per agent per minute, and bulk uploads up to 50,000 rows.**

---

## 1. Measured & Estimated Request Frequencies per Screen

| Screen / Component | Endpoint(s) Called | Current Interval / Trigger | Current Batch / Limit | Requests / Min (300 Active Agents) | Mongo Impact / Hotspot |
|---|---|---|---|---|---|
| **HomeScreen (Calling Desk)** | `GET /api/leads/my` | Every 45s (auto-polling) | `limit: 5000` | **400 req/min** | Scans & serializes up to 2,000,000 lead docs/min across 300 devices. |
| **CampaignSelectScreen** | `GET /api/leads/my`, `GET /api/campaigns` | Every 30s (auto-polling) | `limit: 5000` | **120 req/min** (if open) | Pulls 5,000 leads purely to compute local badge counts. |
| **MyLeadsScreen** | `GET /api/leads/my` | Focus / 60s poll | `limit: 500` | **300–600 req/min** | High data transfer; unvirtualized desktop DOM table. |
| **DashboardScreen (Manager)** | `GET /api/reports/dashboard`, `GET /api/reports/user-calls` | Every 30–60s | Full DB aggregation | **50–100 req/min** (50 Managers) | Executes heavy multi-stage pipelines across raw `Activity` collection. |
| **CSV Bulk Upload** | `POST /api/leads/campaign/:id/upload` | On demand | 5,000 – 50,000 rows | 1–5 req during uploads | **CRITICAL N+1**: Calls `Lead.aggregate` per row during assignment. |
| **Outbox Auto-Flush** | `POST /api/activities` | On network reconnect | 1 req per queued item | Spikes to 500+ req/s | Thundering herd on reconnect without jitter or batching. |

---

## 2. Critical Database Bottlenecks & N+1 Queries

### 2.1 The Lead Assignment N+1 Aggregation Loop
- **File**: `server/src/services/lead-assignment.service.ts:41-55`
- **Mechanism**: In `pickBalancedAgent`, the service executes:
  ```typescript
  const counts = await Lead.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { campaignId, assignedTo: { $in: candidateIds }, status: 'OPEN' } },
    { $group: { _id: '$assignedTo', count: { $sum: 1 } } }
  ]);
  ```
  This aggregation is executed **inside the per-row iteration** of `LeadIngestService.ingest`.
- **Impact**: Uploading a 5,000-row CSV triggers **5,000 separate MongoDB aggregation operations**, locking the server event loop and causing timeouts.
- **Fix**: Pre-calculate agent open-lead counts **once** before processing the ingest array, and maintain an in-memory counter map during bulk distribution.

---

### 2.2 Uncached Raw Activity Scans on Reports
- **File**: `server/src/services/report.service.ts:100-250`
- **Mechanism**: Reports run large `$group` operations over all matching documents in `Activity`. With 300 agents producing ~50,000 activities weekly, scanning 500k+ documents on every dashboard view saturates CPU.
- **Fix**: Migrate all real-time stats to the new `DailyStat` collection updated atomically via `$inc`. Reports query pre-calculated daily summary documents in `< 5ms`.

---

### 2.3 Unbounded Client Fetching & Param Serialization
- **File**: `mobile/src/screens/HomeScreen.tsx:324, 759-764`
- **Mechanism**: Fetching 5,000 leads and passing the array through navigation state (`navigation.navigate('LeadDetail', { queue: targetQueue })`) creates massive JS-to-Native bridge serialization overhead and out-of-memory crashes on mobile.
- **Fix**: Implement server-side cursor endpoint (`POST /api/leads/next`). Client requests only 1 lead at a time and prefetches the next.

---

## 3. Required MongoDB Compound Indexes

The following compound indexes will be created and enforced to support sub-10ms query execution:

1. **`leads` Collection**:
   - `{ assignedTo: 1, status: 1, nextFollowUpAt: 1 }`: For cursor-based lead leading and follow-up queues.
   - `{ campaignId: 1, status: 1, assignedTo: 1 }`: For campaign queue filtering.
   - `{ campaignId: 1, phone: 1 }`: For fast duplicate detection during ingest.
   - `{ branch: 1, status: 1, createdAt: -1 }`: For branch-scoped lead views.

2. **`activities` Collection**:
   - `{ userId: 1, clientEventId: 1 }` (UNIQUE, SPARSE): Eliminates duplicate dial/disposition logging.
   - `{ userId: 1, createdAt: -1 }`: Fast agent activity history.
   - `{ leadId: 1, createdAt: -1 }`: Lead timeline retrieval.
   - `{ branch: 1, createdAt: -1 }`: Branch call logs.

3. **`daily_stats` Collection**:
   - `{ userId: 1, dayIST: 1, campaignId: 1 }` (UNIQUE): Fast atomic `$inc` upserts and instantaneous daily stats.
   - `{ dayIST: 1, branch: 1 }`: Team stats aggregation for managers.

---

## 4. Client Request Discipline Rules

1. **No Polling Under 30s**: All intervals lengthened to ≥ 30s with ±20% randomized jitter.
2. **Background Pausing**: All background polling ceases when `AppState !== 'active'`.
3. **Request Layer**: De-duplicate in-flight queries; use `stale-while-revalidate`.
4. **Batch Sync**: Offline outbox flushes via `POST /api/sync/batch` (up to 50 events per batch with randomized delay).
5. **Cursor Virtualization**: Server limits list responses to a default of 25–50 rows (maximum 100).
