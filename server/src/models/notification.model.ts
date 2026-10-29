import { Schema, model, Document, Types } from 'mongoose';

export type NotificationType =
  | 'FOLLOW_UP'
  | 'LEAD_TAGGED'
  | 'BREAK_EXCEEDED'
  | 'ASSIGNMENT'
  | 'SYSTEM';

export interface INotification {
  userId: Types.ObjectId;
  title: string;
  message: string;
  type: NotificationType;
  leadId?: Types.ObjectId | null;
  isRead: boolean;
  readAt?: Date | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationDoc extends INotification, Document<Types.ObjectId> {}

const notificationSchema = new Schema<INotificationDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['FOLLOW_UP', 'LEAD_TAGGED', 'BREAK_EXCEEDED', 'ASSIGNMENT', 'SYSTEM'],
      default: 'SYSTEM',
      index: true,
    },
    leadId: {
      type: Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
      index: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

export const Notification = model<INotificationDoc>('Notification', notificationSchema);
