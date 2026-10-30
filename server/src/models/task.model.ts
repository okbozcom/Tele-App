import mongoose, { Document, Schema, Types } from 'mongoose';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type TaskStatus = 'PENDING' | 'COMPLETED';

export interface ITask extends Document {
  title: string;
  description?: string;
  leadId: Types.ObjectId;
  leadName?: string;
  leadPhone?: string;
  assignedTo: Types.ObjectId;
  assignedToName?: string;
  reportedBy: Types.ObjectId;
  reportedByName?: string;
  dueDate: Date;
  priority: TaskPriority;
  status: TaskStatus;
  completedAt?: Date;
  branch?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<ITask>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    leadId: {
      type: Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
      index: true,
    },
    leadName: {
      type: String,
      trim: true,
    },
    leadPhone: {
      type: String,
      trim: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    assignedToName: {
      type: String,
      trim: true,
    },
    reportedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reportedByName: {
      type: String,
      trim: true,
    },
    dueDate: {
      type: Date,
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH'],
      default: 'MEDIUM',
    },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED'],
      default: 'PENDING',
      index: true,
    },
    completedAt: {
      type: Date,
    },
    branch: {
      type: Schema.Types.ObjectId,
      ref: 'Branch',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

taskSchema.index({ assignedTo: 1, status: 1, dueDate: 1 });
taskSchema.index({ reportedBy: 1, status: 1, dueDate: 1 });

export const Task = mongoose.model<ITask>('Task', taskSchema);
