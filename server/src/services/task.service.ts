import { Types } from 'mongoose';
import { Task, ITask } from '../models/task.model';
import { Lead } from '../models/lead.model';
import { User } from '../models/user.model';
import { AppError } from '../utils/AppError';
import { CreateTaskInput } from '../validations/task.validation';

export class TaskService {
  /**
   * Create a new task linked to a lead.
   */
  static async createTask(
    currentUserId: string,
    currentUserRole: string,
    currentUserBranch: string | undefined,
    input: CreateTaskInput
  ): Promise<ITask> {
    const lead = await Lead.findById(input.leadId);
    if (!lead) {
      throw new AppError('Lead not found', 404);
    }

    const reporter = await User.findById(currentUserId);
    if (!reporter) {
      throw new AppError('Reporting user not found', 404);
    }

    const targetUserId = input.assignedTo || currentUserId;
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      throw new AppError('Assigned user not found', 404);
    }

    // Branch isolation: If current user is manager or agent, verify branch consistency
    if (currentUserRole !== 'ADMIN' && currentUserBranch) {
      if (targetUser.branch && targetUser.branch.toString() !== currentUserBranch.toString()) {
        throw new AppError('Cannot assign task to a user outside your branch', 403);
      }
    }

    const task = new Task({
      title: input.title.trim(),
      description: input.description?.trim() || '',
      leadId: lead._id,
      leadName: lead.name,
      leadPhone: lead.phone,
      assignedTo: targetUser._id,
      assignedToName: targetUser.name,
      reportedBy: reporter._id,
      reportedByName: reporter.name,
      dueDate: new Date(input.dueDate),
      priority: input.priority || 'MEDIUM',
      status: 'PENDING',
      branch: targetUser.branch || reporter.branch,
    });

    await task.save();
    return task;
  }

  /**
   * Fetch tasks filtered by "assigned" (Assigned to me) or "reported" (Reported by me).
   */
  static async getTasks(
    currentUserId: string,
    filter: 'assigned' | 'reported' = 'assigned',
    status?: 'PENDING' | 'COMPLETED'
  ): Promise<ITask[]> {
    const query: any = {};

    if (filter === 'reported') {
      query.reportedBy = new Types.ObjectId(currentUserId);
    } else {
      query.assignedTo = new Types.ObjectId(currentUserId);
    }

    if (status) {
      query.status = status;
    }

    return Task.find(query).sort({ dueDate: 1, createdAt: -1 }).lean() as any;
  }

  /**
   * Update task status (toggle PENDING <-> COMPLETED).
   */
  static async updateTaskStatus(
    taskId: string,
    currentUserId: string,
    currentUserRole: string,
    newStatus: 'PENDING' | 'COMPLETED'
  ): Promise<ITask> {
    const task = await Task.findById(taskId);
    if (!task) {
      throw new AppError('Task not found', 404);
    }

    // Authorization: User must be assignee, reporter, or ADMIN
    const isAssignee = task.assignedTo.toString() === currentUserId;
    const isReporter = task.reportedBy.toString() === currentUserId;
    if (!isAssignee && !isReporter && currentUserRole !== 'ADMIN') {
      throw new AppError('You do not have permission to update this task', 403);
    }

    task.status = newStatus;
    task.completedAt = newStatus === 'COMPLETED' ? new Date() : undefined;
    await task.save();

    return task;
  }
}
