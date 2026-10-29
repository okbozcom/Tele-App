import { Schema, model, Document, Types } from 'mongoose';

export const NotConnectedReasons = [
  'DID_NOT_PICK',
  'BUSY',
  'USER_DISCONNECTED',
  'SWITCHED_OFF',
  'OUT_OF_COVERAGE',
  'CALL_NOT_COMPLETED',
  'OTHER',
  'INVALID_NUMBER',
  'INCOMING_NOT_AVAILABLE',
  'NUMBER_NOT_IN_USE',
] as const;

export type NotConnectedReason = (typeof NotConnectedReasons)[number];

export interface IEngagementAnswer {
  questionId: string;
  value: unknown;
}

export interface IActivity {
  leadId: Types.ObjectId;
  campaignId: Types.ObjectId;
  userId: Types.ObjectId;
  clientEventId?: string | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  durationSource?: 'DEVICE_CALL_LOG' | 'APP_ESTIMATE';
  dispositionMismatch?: boolean;
  noAttempt?: boolean;
  clientTimestamp?: Date | null;
  serverReceivedAt?: Date;
  dayIST?: string;
  phone?: string | null;
  branch?: string | null;
  type: 'CALL' | 'UPDATE';
  direction?: 'OUTGOING' | 'INCOMING';
  connected: boolean;
  notConnectedReason?: NotConnectedReason | null;
  stage: string;
  tag?: string | null;
  remark?: string | null;
  followUpAt?: Date | null;
  durationSeconds: number;
  callLogId?: string | null;
  idempotencyKey?: string | null;
  classificationReason?: string | null;
  dealAmount?: number | null;
  currency?: string | null;
  answers: IEngagementAnswer[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IActivityDoc extends IActivity, Document<Types.ObjectId> {}

const engagementAnswerSchema = new Schema<IEngagementAnswer>(
  {
    questionId: {
      type: String,
      required: true,
      trim: true,
    },
    value: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: false },
);

const activitySchema = new Schema<IActivityDoc>(
  {
    leadId: {
      type: Schema.Types.ObjectId,
      ref: 'Lead',
      required: [true, 'Lead ID is required'],
      index: true,
    },
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'Campaign',
      required: [true, 'Campaign ID is required'],
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    clientEventId: {
      type: String,
      default: null,
      trim: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    durationSource: {
      type: String,
      enum: ['DEVICE_CALL_LOG', 'APP_ESTIMATE'],
      default: 'APP_ESTIMATE',
    },
    dispositionMismatch: {
      type: Boolean,
      default: false,
    },
    noAttempt: {
      type: Boolean,
      default: false,
    },
    clientTimestamp: {
      type: Date,
      default: null,
    },
    serverReceivedAt: {
      type: Date,
      default: Date.now,
    },
    dayIST: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['CALL', 'UPDATE'],
      default: 'CALL',
    },
    direction: {
      type: String,
      enum: ['OUTGOING', 'INCOMING'],
      default: 'OUTGOING',
      index: true,
    },
    connected: {
      type: Boolean,
      required: [true, 'Connected status is required'],
    },
    notConnectedReason: {
      type: String,
      enum: NotConnectedReasons,
      default: null,
    },
    stage: {
      type: String,
      required: [true, 'Stage is required'],
      trim: true,
    },
    tag: {
      type: String,
      default: null,
      trim: true,
    },
    remark: {
      type: String,
      default: null,
      trim: true,
    },
    followUpAt: {
      type: Date,
      default: null,
    },
    durationSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    callLogId: {
      type: String,
      default: null,
      trim: true,
    },
    idempotencyKey: {
      type: String,
      default: null,
      trim: true,
    },
    classificationReason: {
      type: String,
      default: null,
      trim: true,
    },
    dealAmount: {
      type: Number,
      default: null,
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true,
    },
    answers: {
      type: [engagementAnswerSchema],
      default: [],
    },
    phone: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    branch: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

activitySchema.index({ userId: 1, clientEventId: 1 }, { unique: true, sparse: true });
activitySchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
activitySchema.index({ leadId: 1, createdAt: -1 });
activitySchema.index({ phone: 1, direction: 1, createdAt: -1 });
activitySchema.index({ userId: 1, direction: 1, createdAt: -1 });
activitySchema.index({ userId: 1, dayIST: 1, createdAt: -1 });
activitySchema.index({ dayIST: 1, branch: 1 });
activitySchema.index({ phone: 1, createdAt: -1 });
activitySchema.index({ branch: 1, createdAt: -1 });
activitySchema.index({ userId: 1, createdAt: -1 });
activitySchema.index({ createdAt: -1, branch: 1 });

export const Activity = model<IActivityDoc>('Activity', activitySchema);
