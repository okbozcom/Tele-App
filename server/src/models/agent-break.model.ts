import { Schema, model, Document, Types } from 'mongoose';

export type BreakReason = 'TEA' | 'LUNCH' | 'MEETING' | 'PERSONAL' | 'TRAINING';

export interface IAgentBreak {
  userId: Types.ObjectId;
  reason: BreakReason;
  startTime: Date;
  endTime?: Date | null;
  durationMinutes?: number | null;
  exceededThreshold?: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAgentBreakDoc extends IAgentBreak, Document<Types.ObjectId> {}

const agentBreakSchema = new Schema<IAgentBreakDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reason: {
      type: String,
      enum: ['TEA', 'LUNCH', 'MEETING', 'PERSONAL', 'TRAINING'],
      default: 'TEA',
    },
    startTime: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endTime: {
      type: Date,
      default: null,
    },
    durationMinutes: {
      type: Number,
      default: null,
    },
    exceededThreshold: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

agentBreakSchema.index({ userId: 1, isActive: 1 });
agentBreakSchema.index({ userId: 1, startTime: -1 });

export const AgentBreak = model<IAgentBreakDoc>('AgentBreak', agentBreakSchema);
