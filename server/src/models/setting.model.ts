import { Schema, model, Document, Types } from 'mongoose';

export interface ISetting {
  allowDisposeWithoutFollowUp: boolean;
  followUpMandatoryForNotConnected: boolean;
  autoLeadDistribution?: boolean;
  reassignAfterHours?: number;
  breakNotificationThresholdMinutes?: number;
  enableAutoCallDialing?: boolean;
  autoCallDialingDelaySeconds?: number;
  maskContactNumber?: boolean;
  displayStartCallingButton?: boolean;
  allowCallRecordingPlayback?: boolean;
  preferredSimSlot?: number | null;
  leadPriorityOrder?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ISettingDoc extends ISetting, Document<Types.ObjectId> {}

const settingSchema = new Schema<ISettingDoc>(
  {
    allowDisposeWithoutFollowUp: {
      type: Boolean,
      default: false,
    },
    followUpMandatoryForNotConnected: {
      type: Boolean,
      default: false,
    },
    autoLeadDistribution: {
      type: Boolean,
      default: true,
    },
    reassignAfterHours: {
      type: Number,
      default: 24,
    },
    breakNotificationThresholdMinutes: {
      type: Number,
      default: 15,
    },
    enableAutoCallDialing: {
      type: Boolean,
      default: false,
    },
    autoCallDialingDelaySeconds: {
      type: Number,
      default: 5,
    },
    maskContactNumber: {
      type: Boolean,
      default: false,
    },
    displayStartCallingButton: {
      type: Boolean,
      default: true,
    },
    allowCallRecordingPlayback: {
      type: Boolean,
      default: true,
    },
    preferredSimSlot: {
      type: Number,
      default: null,
    },
    leadPriorityOrder: {
      type: [String],
      default: [
        'OVERDUE_FOLLOWUPS',
        'TODAY_FOLLOWUPS',
        'HIGH_PRIORITY_CAMPAIGNS',
        'NEW_UNCONTACTED',
        'RETRY_NOT_CONNECTED',
      ],
    },
  },
  {
    timestamps: true,
  },
);

export const Setting = model<ISettingDoc>('Setting', settingSchema);
