const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');

const { DailyStatService } = require('../dist/services/daily-stat.service');
const { SyncService } = require('../dist/services/sync.service');
const { ActivityService } = require('../dist/services/activity.service');
const { DailyStat } = require('../dist/models/daily-stat.model');
const { Activity } = require('../dist/models/activity.model');
const { getISTDayKey, resolveCallDate, getISTDayRange } = require('../dist/utils/dateUtils');
const { isActivityIncoming } = require('../dist/utils/activityUtils');

describe('DailyStat & Batch Sync Unit / Integration Tests', () => {
  beforeEach(() => {
    mock.restoreAll();
  });

  afterEach(() => {
    mock.restoreAll();
  });

  // -------------------------------------------------------------
  // 1. IST Date Boundaries & Clock Skew Guard
  // -------------------------------------------------------------
  describe('IST Date Calculation & Clock Skew Protection', () => {
    it('accurately resolves Asia/Kolkata date key (YYYY-MM-DD)', () => {
      // 2026-10-29 18:30:00 UTC = 2026-10-30 00:00:00 IST
      const utcDate = new Date('2026-10-29T18:30:00.000Z');
      const dayKey = getISTDayKey(utcDate);
      assert.equal(dayKey, '2026-10-30');
    });

    it('flags clock skew when client timestamp differs by > 5 minutes from server', () => {
      const serverNow = new Date('2026-10-29T10:00:00.000Z');
      const skewedClientTime = new Date('2026-10-29T10:20:00.000Z'); // 20 min skew

      const res = resolveCallDate(skewedClientTime, serverNow);
      assert.equal(res.clockSkewWarning, true);
      assert.equal(res.clockSkewMinutes, 20);
      assert.equal(res.callDate.toISOString(), serverNow.toISOString());
    });

    it('accepts accurate client timestamp when within 5 minutes of server time', () => {
      const serverNow = new Date('2026-10-29T10:00:00.000Z');
      const closeClientTime = new Date('2026-10-29T10:02:00.000Z'); // 2 min skew

      const res = resolveCallDate(closeClientTime, serverNow);
      assert.equal(res.clockSkewWarning, false);
      assert.equal(res.clockSkewMinutes, 2);
      assert.equal(res.callDate.toISOString(), closeClientTime.toISOString());
    });
  });

  // -------------------------------------------------------------
  // 2. Canonical Activity Direction Helper
  // -------------------------------------------------------------
  describe('Canonical Activity Direction Detection', () => {
    it('classifies explicit OUTGOING as false for isActivityIncoming', () => {
      assert.equal(isActivityIncoming({ direction: 'OUTGOING', stage: 'Missed Call' }), false);
      assert.equal(isActivityIncoming({ direction: 'OUTGOING', callType: 'OUTGOING' }), false);
    });

    it('classifies explicit INCOMING as true for isActivityIncoming', () => {
      assert.equal(isActivityIncoming({ direction: 'INCOMING' }), true);
      assert.equal(isActivityIncoming({ callType: 'INCOMING' }), true);
      assert.equal(isActivityIncoming({ _id: 'inc-123456789' }), true);
    });

    it('classifies Missed Call without OUTGOING direction as true', () => {
      assert.equal(isActivityIncoming({ stage: 'Missed Call', direction: null }), true);
    });
  });

  // -------------------------------------------------------------
  // 3. DailyStat Atomic Counter Recording
  // -------------------------------------------------------------
  describe('DailyStatService.recordActivity', () => {
    it('atomically increments attempts, connected, and talkSeconds for connected outgoing calls', async () => {
      const userId = new Types.ObjectId();
      const campaignId = new Types.ObjectId();

      let findOneAndUpdateCalls = 0;
      mock.method(DailyStat, 'findOneAndUpdate', async (filter, update) => {
        findOneAndUpdateCalls++;
        const inc = update.$inc;
        assert.equal(inc.attempts, 1);
        assert.equal(inc.connected, 1);
        assert.equal(inc.talkSeconds, 85);
        return { ...filter, ...inc };
      });

      await DailyStatService.recordActivity({
        userId,
        campaignId,
        type: 'CALL',
        direction: 'OUTGOING',
        connected: true,
        durationSeconds: 85,
        startedAt: new Date('2026-10-29T10:00:00Z'),
      });

      // Updated both campaign-specific and overall (null campaign) rows
      assert.equal(findOneAndUpdateCalls, 2);
    });

    it('increments notConnected when call is not connected', async () => {
      const userId = new Types.ObjectId();

      mock.method(DailyStat, 'findOneAndUpdate', async (filter, update) => {
        const inc = update.$inc;
        assert.equal(inc.attempts, 1);
        assert.equal(inc.notConnected, 1);
        assert.equal(inc.connected, undefined);
        return { ...filter, ...inc };
      });

      await DailyStatService.recordActivity({
        userId,
        type: 'CALL',
        direction: 'OUTGOING',
        connected: false,
        durationSeconds: 0,
      });
    });

    it('increments incoming counter when activity is canonically INCOMING', async () => {
      const userId = new Types.ObjectId();

      mock.method(DailyStat, 'findOneAndUpdate', async (filter, update) => {
        const inc = update.$inc;
        assert.equal(inc.incoming, 1);
        assert.equal(inc.attempts, undefined);
        return { ...filter, ...inc };
      });

      await DailyStatService.recordActivity({
        userId,
        type: 'CALL',
        direction: 'INCOMING',
        connected: true,
        durationSeconds: 30,
      });
    });
  });

  // -------------------------------------------------------------
  // 4. Batch Sync Service Idempotency
  // -------------------------------------------------------------
  describe('SyncService.batchSync', () => {
    it('detects already_synced events via clientEventId and avoids duplicate activity creation', async () => {
      const userId = new Types.ObjectId();
      const existingActivityId = new Types.ObjectId();
      const requester = { _id: userId, role: 'AGENT' };

      mock.method(Activity, 'findOne', async ({ clientEventId }) => {
        if (clientEventId === 'client-event-1') {
          return { _id: existingActivityId, clientEventId: 'client-event-1' };
        }
        return null;
      });

      mock.method(ActivityService, 'disposeLead', async () => {
        return { activity: { _id: new Types.ObjectId() }, lead: {} };
      });

      const res = await SyncService.batchSync(requester, [
        {
          clientEventId: 'client-event-1', // Already synced
          leadId: new Types.ObjectId().toString(),
          connected: true,
          durationSeconds: 40,
          stage: 'Interested',
        },
        {
          clientEventId: 'client-event-2', // New
          leadId: new Types.ObjectId().toString(),
          connected: false,
          durationSeconds: 0,
          stage: 'Not Connected',
        },
      ]);

      assert.equal(res.total, 2);
      assert.equal(res.succeeded, 2);
      assert.equal(res.results[0].status, 'already_synced');
      assert.equal(res.results[0].activityId, existingActivityId.toString());
      assert.equal(res.results[1].status, 'success');
    });
  });
});
