const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');

const { NotificationService } = require('../dist/services/notification.service');
const { Notification } = require('../dist/models/notification.model');
const { AppError } = require('../dist/utils/AppError');

describe('Notification Center Unit / Integration Tests (Spec 4.10)', () => {
  afterEach(() => {
    mock.restoreAll();
  });

  const userId = new Types.ObjectId();
  const notificationId = new Types.ObjectId();

  const mockNotification = {
    _id: notificationId,
    userId,
    title: 'Upcoming Follow-up',
    message: 'Follow-up due with Rajesh Kumar at 10:00 AM',
    type: 'FOLLOW_UP',
    isRead: false,
    readAt: null,
    createdAt: new Date(),
  };

  it('creates an unread notification successfully', async () => {
    mock.method(Notification, 'create', async (doc) => ({
      _id: new Types.ObjectId(),
      ...doc,
    }));

    const created = await NotificationService.createNotification({
      userId: userId.toString(),
      title: 'New Lead Assigned',
      message: 'You have been assigned a high priority lead: Priya',
      type: 'ASSIGNMENT',
    });

    assert.equal(created.title, 'New Lead Assigned');
    assert.equal(created.type, 'ASSIGNMENT');
    assert.equal(created.isRead, false);
  });

  it('retrieves user notifications with unreadCount', async () => {
    mock.method(Notification, 'find', () => ({
      populate: () => ({
        sort: () => ({
          skip: () => ({
            limit: async () => [mockNotification],
          }),
        }),
      }),
    }));
    mock.method(Notification, 'countDocuments', async (filter) => {
      if (filter && filter.isRead === false) return 1;
      return 1;
    });

    const result = await NotificationService.getUserNotifications(userId.toString(), {
      page: 1,
      limit: 20,
    });

    assert.equal(result.notifications.length, 1);
    assert.equal(result.unreadCount, 1);
    assert.equal(result.total, 1);
  });

  it('marks a specific notification as read and sets readAt', async () => {
    mock.method(Notification, 'findOneAndUpdate', async (filter, update) => {
      assert.equal(filter._id.toString(), notificationId.toString());
      assert.equal(filter.userId.toString(), userId.toString());
      assert.equal(update.$set.isRead, true);
      assert.notEqual(update.$set.readAt, null);
      return {
        ...mockNotification,
        isRead: true,
        readAt: update.$set.readAt,
      };
    });

    const updated = await NotificationService.markAsRead(userId.toString(), notificationId.toString());
    assert.equal(updated.isRead, true);
    assert.notEqual(updated.readAt, null);
  });

  it('marks all unread notifications as read for user', async () => {
    mock.method(Notification, 'updateMany', async (filter, update) => {
      assert.equal(filter.userId.toString(), userId.toString());
      assert.equal(filter.isRead, false);
      assert.equal(update.$set.isRead, true);
      return { modifiedCount: 4 };
    });

    const result = await NotificationService.markAllAsRead(userId.toString());
    assert.equal(result.modifiedCount, 4);
  });

  it('returns unread count accurately', async () => {
    mock.method(Notification, 'countDocuments', async () => 3);

    const count = await NotificationService.getUnreadCount(userId.toString());
    assert.equal(count, 3);
  });

  it('rejects invalid notificationId format with 400 Bad Request', async () => {
    await assert.rejects(
      () => NotificationService.markAsRead(userId.toString(), 'invalid-id'),
      (err) => err instanceof AppError && err.statusCode === 400
    );
  });
});
