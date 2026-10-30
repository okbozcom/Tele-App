import { Types } from 'mongoose';
import { Notification, INotificationDoc, NotificationType } from '../models/notification.model';
import { AppError } from '../utils/AppError';

export interface CreateNotificationInput {
  userId: string | Types.ObjectId;
  title: string;
  message: string;
  type?: NotificationType;
  leadId?: string | Types.ObjectId | null;
  metadata?: Record<string, unknown>;
}

export class NotificationService {
  public static async createNotification(
    input: CreateNotificationInput,
  ): Promise<INotificationDoc> {
    return Notification.create({
      userId: new Types.ObjectId(input.userId),
      title: input.title.trim(),
      message: input.message.trim(),
      type: input.type || 'SYSTEM',
      leadId: input.leadId ? new Types.ObjectId(input.leadId) : null,
      metadata: input.metadata || {},
      isRead: false,
    });
  }

  public static async getUserNotifications(
    userId: string | Types.ObjectId,
    query: { page?: number; limit?: number; unreadOnly?: boolean },
  ): Promise<{
    notifications: INotificationDoc[];
    total: number;
    unreadCount: number;
    page: number;
    limit: number;
  }> {
    const page = query.page || 1;
    const limit = query.limit || 30;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
    };
    if (query.unreadOnly) {
      filter.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .populate('leadId', 'name phone stage tag')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ userId: new Types.ObjectId(userId), isRead: false }),
    ]);

    return {
      notifications,
      total,
      unreadCount,
      page,
      limit,
    };
  }

  public static async markAsRead(
    userId: string | Types.ObjectId,
    notificationId: string,
  ): Promise<INotificationDoc> {
    if (!Types.ObjectId.isValid(notificationId)) {
      throw new AppError('Invalid notification ID format', 400);
    }

    const notification = await Notification.findOneAndUpdate(
      {
        _id: new Types.ObjectId(notificationId),
        userId: new Types.ObjectId(userId),
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      },
      { new: true },
    );

    if (!notification) {
      throw new AppError('Notification not found', 404);
    }

    return notification;
  }

  public static async markAllAsRead(
    userId: string | Types.ObjectId,
  ): Promise<{ modifiedCount: number }> {
    const result = await Notification.updateMany(
      {
        userId: new Types.ObjectId(userId),
        isRead: false,
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      },
    );

    return { modifiedCount: result.modifiedCount };
  }

  public static async getUnreadCount(userId: string | Types.ObjectId): Promise<number> {
    return Notification.countDocuments({
      userId: new Types.ObjectId(userId),
      isRead: false,
    });
  }
}
