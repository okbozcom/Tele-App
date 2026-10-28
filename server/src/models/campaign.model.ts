import { Schema, model, Document, Types } from 'mongoose';

export type DistributionMode = 'EQUAL' | 'CONDITIONAL';
export type CampaignPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type DuplicateMode = 'SKIP' | 'MERGE' | 'CREATE_NEW';

export type QuestionType =
  | 'TEXT'
  | 'SHORT_ANSWER'
  | 'NUMBER'
  | 'LONG_ANSWER'
  | 'DATE'
  | 'TIME'
  | 'MULTIPLE_CHOICE'
  | 'CHECKBOX'
  | 'DROPDOWN';

export interface IConditionalRule {
  field: string;
  value: string;
  agentIds: Types.ObjectId[];
}

export interface IEngagementQuestion {
  id: string;
  type: QuestionType;
  label: string;
  options: string[];
  required: boolean;
}

export interface ICampaign {
  name: string;
  pipelineId: Types.ObjectId;
  managerId: Types.ObjectId;
  agentIds: Types.ObjectId[];
  branch?: string | null;
  distributionMode: DistributionMode;
  conditionalRules: IConditionalRule[];
  fallbackAgentId?: Types.ObjectId | null;
  priority: CampaignPriority;
  duplicateMode: DuplicateMode;
  engagementForm: IEngagementQuestion[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICampaignDoc extends ICampaign, Document<Types.ObjectId> {}

const conditionalRuleSchema = new Schema<IConditionalRule>(
  {
    field: {
      type: String,
      required: true,
      trim: true,
    },
    value: {
      type: String,
      required: true,
      trim: true,
    },
    agentIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
  },
  { _id: false },
);

const engagementQuestionSchema = new Schema<IEngagementQuestion>(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: [
        'TEXT',
        'SHORT_ANSWER',
        'NUMBER',
        'LONG_ANSWER',
        'DATE',
        'TIME',
        'MULTIPLE_CHOICE',
        'CHECKBOX',
        'DROPDOWN',
      ],
      required: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    options: {
      type: [String],
      default: [],
    },
    required: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false },
);

const campaignSchema = new Schema<ICampaignDoc>(
  {
    name: {
      type: String,
      required: [true, 'Campaign name is required'],
      trim: true,
    },
    pipelineId: {
      type: Schema.Types.ObjectId,
      ref: 'Pipeline',
      required: [true, 'Pipeline ID is required'],
    },
    managerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Manager ID is required'],
    },
    agentIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    branch: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    distributionMode: {
      type: String,
      enum: ['EQUAL', 'CONDITIONAL'],
      default: 'EQUAL',
    },
    conditionalRules: {
      type: [conditionalRuleSchema],
      default: [],
    },
    fallbackAgentId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    priority: {
      type: String,
      enum: ['HIGH', 'MEDIUM', 'LOW'],
      default: 'MEDIUM',
    },
    duplicateMode: {
      type: String,
      enum: ['SKIP', 'MERGE', 'CREATE_NEW'],
      default: 'SKIP',
    },
    engagementForm: {
      type: [engagementQuestionSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

export const Campaign = model<ICampaignDoc>('Campaign', campaignSchema);
