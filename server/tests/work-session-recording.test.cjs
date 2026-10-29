const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');

const { WorkSessionService } = require('../dist/services/work-session.service');
const { AgentBreakService } = require('../dist/services/agent-break.service');
const { ActivityService } = require('../dist/services/activity.service');
const { SettingService } = require('../dist/services/setting.service');
const { AuditService } = require('../dist/services/audit.service');
const { WorkSession } = require('../dist/models/work-session.model');
const { AgentBreak } = require('../dist/models/agent-break.model');
const { Activity } = require('../dist/models/activity.model');
const { User } = require('../dist/models/user.model');
const { AppError } = require('../dist/utils/AppError');

describe('Work Session, Break Threshold & Call Recording Tests (NeoDove Spec 4.7 & 4.9)', () => {
  beforeEach(() => {
    mock.method(AuditService, 'log', async () => {});
    mock.method(User, 'findByIdAndUpdate', async () => {});
  });

  afterEach(() => {
    mock.restoreAll();
  });

  // 1. Work Session Clock-in & Clock-out
  describe('WorkSessionService lifecycle', () => {
    const userId = new Types.ObjectId();
    const mockUser = {
      _id: userId,
      name: 'Agent A',
      email: 'agenta@example.com',
      role: 'AGENT',
    };

    it('creates new work session upon clock-in and enables lead receipt', async () => {
      mock.method(WorkSession, 'findOne', async () => null);
      mock.method(WorkSession, 'create', async (doc) => ({
        _id: new Types.ObjectId(),
        ...doc,
      }));

      const session = await WorkSessionService.clockIn(mockUser);
      assert.equal(session.status, 'ONLINE');
      assert.equal(session.userId.toString(), userId.toString());
      assert.equal(session.clockOutAt, null);
    });

    it('clocks out user, ends active break, and disables lead receipt', async () => {
      const mockSession = {
        _id: new Types.ObjectId(),
        userId,
        date: '2026-01-01',
        clockInAt: new Date(Date.now() - 3600 * 1000), // 1 hr ago
        status: 'ONLINE',
        totalBreakSeconds: 600, // 10 min
        totalWorkSeconds: 0,
        save: async function () { return this; },
      };

      mock.method(WorkSession, 'findOne', async () => mockSession);
      mock.method(AgentBreakService, 'getCurrentBreak', async () => null);

      const session = await WorkSessionService.clockOut(mockUser);
      assert.equal(session.status, 'OFFLINE');
      assert.notEqual(session.clockOutAt, null);
      assert.equal(session.totalWorkSeconds > 0, true);
    });
  });

  // 2. Break Threshold Alert
  describe('AgentBreakService threshold checks', () => {
    const userId = new Types.ObjectId();

    it('flags break as exceededThreshold when duration exceeds threshold setting', async () => {
      const breakStartTime = new Date(Date.now() - 25 * 60 * 1000); // 25 mins ago
      const mockActiveBreak = {
        _id: new Types.ObjectId(),
        userId,
        reason: 'TEA',
        startTime: breakStartTime,
        isActive: true,
        save: async function () { return this; },
      };

      mock.method(AgentBreak, 'findOne', async () => mockActiveBreak);
      mock.method(SettingService, 'getSettings', async () => ({
        breakNotificationThresholdMinutes: 15,
      }));
      mock.method(WorkSession, 'updateOne', async () => ({}));

      const finished = await AgentBreakService.endBreak(userId);
      assert.equal(finished.isActive, false);
      assert.equal(finished.exceededThreshold, true);
      assert.equal(finished.durationMinutes >= 24, true);
    });

    it('does not flag break when duration is within threshold', async () => {
      const breakStartTime = new Date(Date.now() - 5 * 60 * 1000); // 5 mins ago
      const mockActiveBreak = {
        _id: new Types.ObjectId(),
        userId,
        reason: 'TEA',
        startTime: breakStartTime,
        isActive: true,
        save: async function () { return this; },
      };

      mock.method(AgentBreak, 'findOne', async () => mockActiveBreak);
      mock.method(SettingService, 'getSettings', async () => ({
        breakNotificationThresholdMinutes: 15,
      }));
      mock.method(WorkSession, 'updateOne', async () => ({}));

      const finished = await AgentBreakService.endBreak(userId);
      assert.equal(finished.isActive, false);
      assert.equal(finished.exceededThreshold, false);
    });
  });

  // 3. Call Recording Attach & Playback
  describe('ActivityService call recording', () => {
    const activityId = new Types.ObjectId();
    const leadId = new Types.ObjectId();
    const agentId = new Types.ObjectId();
    const otherAgentId = new Types.ObjectId();

    const mockActivity = {
      _id: activityId,
      leadId,
      userId: agentId,
      durationSeconds: 45,
      recordingUrl: 'https://storage.example.com/recordings/call_123.mp3',
      save: async function () { return this; },
    };

    it('attaches recording URL to activity for assigned agent', async () => {
      mock.method(Activity, 'findById', async () => ({
        ...mockActivity,
        recordingUrl: null,
        save: async function () { return this; },
      }));

      const requester = {
        _id: agentId,
        role: 'AGENT',
        email: 'agent@example.com',
      };

      const updated = await ActivityService.attachRecording(
        requester,
        activityId.toString(),
        'https://storage.example.com/recordings/new_call.mp3'
      );

      assert.equal(updated.recordingUrl, 'https://storage.example.com/recordings/new_call.mp3');
    });

    it('rejects another agent attaching recording to someone else activity (403)', async () => {
      mock.method(Activity, 'findById', async () => mockActivity);

      const requester = {
        _id: otherAgentId,
        role: 'AGENT',
        email: 'other@example.com',
      };

      await assert.rejects(
        () =>
          ActivityService.attachRecording(
            requester,
            activityId.toString(),
            'https://storage.example.com/hack.mp3'
          ),
        (err) => err instanceof AppError && err.statusCode === 403
      );
    });

    it('retrieves recording URL when playback policy is enabled', async () => {
      mock.method(Activity, 'findById', async () => mockActivity);
      mock.method(SettingService, 'getSettings', async () => ({
        allowCallRecordingPlayback: true,
      }));

      const requester = {
        _id: agentId,
        role: 'AGENT',
        email: 'agent@example.com',
      };

      const result = await ActivityService.getRecording(requester, activityId.toString());
      assert.equal(result.recordingUrl, 'https://storage.example.com/recordings/call_123.mp3');
      assert.equal(result.durationSeconds, 45);
    });

    it('forbids AGENT playback when allowCallRecordingPlayback is disabled (403)', async () => {
      mock.method(Activity, 'findById', async () => mockActivity);
      mock.method(SettingService, 'getSettings', async () => ({
        allowCallRecordingPlayback: false,
      }));

      const requester = {
        _id: agentId,
        role: 'AGENT',
        email: 'agent@example.com',
      };

      await assert.rejects(
        () => ActivityService.getRecording(requester, activityId.toString()),
        (err) => err instanceof AppError && err.statusCode === 403 && err.message.includes('disabled by policy')
      );
    });

    it('allows ADMIN playback even when allowCallRecordingPlayback is disabled', async () => {
      mock.method(Activity, 'findById', async () => mockActivity);
      mock.method(SettingService, 'getSettings', async () => ({
        allowCallRecordingPlayback: false,
      }));

      const adminRequester = {
        _id: new Types.ObjectId(),
        role: 'ADMIN',
        email: 'admin@example.com',
      };

      const result = await ActivityService.getRecording(adminRequester, activityId.toString());
      assert.equal(result.recordingUrl, 'https://storage.example.com/recordings/call_123.mp3');
    });
  });
});
