import { Schema, model, Document, Types } from 'mongoose';

export interface IDailyStat {
  userId: Types.ObjectId;
  dayIST: string; // 'YYYY-MM-DD'
  campaignId?: Types.ObjectId | null;
  branch?: string | null;
  attempts: number;
  connected: number;
  notConnected: number;
  talkSeconds: number;
  incoming: number;
  noAttempt: number;
  mismatches: number;
  firstCallAt?: Date | null;
  lastCallAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDailyStatDoc extends IDailyStat, Document<Types.ObjectId> {}

const dailyStatSchema = new Schema<IDailyStatDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    dayIST: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'Campaign',
      default: null,
      index: true,
    },
    branch: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    connected: {
      type: Number,
      default: 0,
      min: 0,
    },
    notConnected: {
      type: Number,
      default: 0,
      min: 0,
    },
    talkSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    incoming: {
      type: Number,
      default: 0,
      min: 0,
    },
    noAttempt: {
      type: Number,
      default: 0,
      min: 0,
    },
    mismatches: {
      type: Number,
      default: 0,
      min: 0,
    },
    firstCallAt: {
      type: Date,
      default: null,
    },
    lastCallAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Unique compound index ensuring one stat record per user per day per campaign
dailyStatSchema.index({ userId: 1, dayIST: 1, campaignId: 1 }, { unique: true });
dailyStatSchema.index({ dayIST: 1, branch: 1 });
dailyStatSchema.index({ userId: 1, dayIST: 1 });

export const DailyStat = model<IDailyStatDoc>('DailyStat', dailyStatSchema);
