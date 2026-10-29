import { Schema, model, Document, Types } from 'mongoose';

export type WorkSessionStatus = 'ONLINE' | 'BREAK' | 'OFFLINE';

export interface IWorkSession {
  userId: Types.ObjectId;
  date: string; // YYYY-MM-DD
  clockInAt: Date;
  clockOutAt?: Date | null;
  status: WorkSessionStatus;
  totalWorkSeconds: number;
  totalBreakSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWorkSessionDoc extends IWorkSession, Document<Types.ObjectId> {}

const workSessionSchema = new Schema<IWorkSessionDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    clockInAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    clockOutAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['ONLINE', 'BREAK', 'OFFLINE'],
      default: 'ONLINE',
      index: true,
    },
    totalWorkSeconds: {
      type: Number,
      default: 0,
    },
    totalBreakSeconds: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

workSessionSchema.index({ userId: 1, date: 1 }, { unique: true });

export const WorkSession = model<IWorkSessionDoc>('WorkSession', workSessionSchema);
