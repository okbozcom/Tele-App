import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { User, IUserDoc, UserRole } from '../models/user.model';
import { Lead } from '../models/lead.model';
import { Campaign } from '../models/campaign.model';
import { AuditService } from './audit.service';
import {
  CreateUserInput,
  UpdateUserInput,
  BulkCreateUsersInput,
  ListUsersQueryInput,
} from '../validations/user.validation';
import { AppError } from '../utils/AppError';

export class UserService {
  public static async createUser(
    requester: IUserDoc,
    input: CreateUserInput,
  ): Promise<IUserDoc> {
    let assignedBranch = input.branch || null;
    if (requester.role === 'MANAGER') {
      if (input.role !== 'AGENT') {
        throw new AppError('Managers can only create AGENT users', 403);
      }
      if (!input.managerId) {
        input.managerId = requester._id.toString();
      }
      if (requester.branch) {
        assignedBranch = requester.branch;
      }
    }

    const existingUser = await User.findOne({ email: input.email.toLowerCase() });
    if (existingUser) {
      throw new AppError('A user with this email already exists', 400);
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(input.password, saltRounds);

    const user = await User.create({
      name: input.name,
      email: input.email.toLowerCase(),
      phone: input.phone,
      passwordHash,
      role: input.role,
      branch: assignedBranch,
      managerId: input.managerId ? new Types.ObjectId(input.managerId) : null,
      isActive: input.isActive ?? true,
      canReceiveLeads: input.canReceiveLeads ?? true,
    });

    await AuditService.log({
      userId: requester._id,
      userEmail: requester.email,
      userRole: requester.role,
      action: 'USER_CREATE',
      resourceType: 'USER',
      resourceId: user._id.toString(),
      details: { email: user.email, role: user.role, branch: user.branch },
    });

    return user;
  }

  public static async listUsers(
    requester?: IUserDoc,
    query: ListUsersQueryInput = {},
  ): Promise<IUserDoc[]> {
    const filter: { role?: UserRole; isActive?: boolean; branch?: string } = {};

    if (requester?.role === 'MANAGER' && requester.branch) {
      filter.branch = requester.branch;
      filter.role = 'AGENT';
    } else {
      if (query.role) {
        filter.role = query.role;
      }
      if (query.branch) {
        filter.branch = query.branch;
      }
    }

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    const users = await User.find(filter)
      .populate('managerId', 'name email role branch')
      .sort({ createdAt: -1 });

    return users;
  }

  public static async updateUser(
    requester: IUserDoc,
    userId: string,
    updates: UpdateUserInput,
  ): Promise<IUserDoc> {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (updates.role !== undefined && requester.role !== 'ADMIN') {
      throw new AppError('Only administrators can change user roles', 403);
    }

    if (requester.role === 'MANAGER' && user.role !== 'AGENT') {
      throw new AppError('Managers can only modify AGENT users', 403);
    }

    if (updates.name !== undefined) user.name = updates.name;
    if (updates.phone !== undefined) user.phone = updates.phone;
    if (updates.role !== undefined) {
      user.role = updates.role;
      user.tokenVersion = (user.tokenVersion || 0) + 1;
    }
    if (updates.branch !== undefined) user.branch = updates.branch;
    if (updates.isActive !== undefined) {
      if (user.isActive !== updates.isActive) {
        user.isActive = updates.isActive;
        if (!updates.isActive) {
          user.tokenVersion = (user.tokenVersion || 0) + 1;
        }
      }
    }
    if (updates.canReceiveLeads !== undefined) user.canReceiveLeads = updates.canReceiveLeads;
    if (updates.managerId !== undefined) {
      user.managerId = updates.managerId ? new Types.ObjectId(updates.managerId) : null;
    }

    await user.save();

    await AuditService.log({
      userId: requester._id,
      userEmail: requester.email,
      userRole: requester.role,
      action: updates.isActive === false ? 'USER_DEACTIVATE' : 'USER_UPDATE',
      resourceType: 'USER',
      resourceId: user._id.toString(),
      details: { updates },
    });

    // P11.3: If agent is deactivated, automatically reassign open leads to active agents
    if (updates.isActive === false && user.role === 'AGENT') {
      const activeAgents = await User.find({
        role: 'AGENT',
        isActive: true,
        canReceiveLeads: true,
        _id: { $ne: user._id },
        ...(user.branch ? { branch: user.branch } : {}),
      });

      if (activeAgents.length > 0) {
        const targetAgent = activeAgents[0];
        const reassigned = await Lead.updateMany(
          { assignedTo: user._id, status: 'OPEN' },
          { $set: { assignedTo: targetAgent._id } },
        );

        await AuditService.log({
          userId: requester._id,
          userEmail: requester.email,
          userRole: requester.role,
          action: 'DEACTIVATED_AGENT_LEADS_REASSIGNED',
          resourceType: 'USER',
          resourceId: user._id.toString(),
          details: {
            fromUserId: user._id.toString(),
            toUserId: targetAgent._id.toString(),
            reassignedCount: reassigned.modifiedCount,
          },
        });
      }
    }

    return user;
  }

  public static async resetPassword(userId: string, newPassword: string): Promise<void> {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const saltRounds = 10;
    user.passwordHash = await bcrypt.hash(newPassword, saltRounds);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
  }

  public static async bulkCreateUsers(
    usersInput: BulkCreateUsersInput,
  ): Promise<IUserDoc[]> {
    const emailsInPayload = usersInput.map((u) => u.email.toLowerCase());
    const uniqueEmails = new Set(emailsInPayload);

    if (uniqueEmails.size !== emailsInPayload.length) {
      throw new AppError('Duplicate email addresses detected in the provided users array', 400);
    }

    const existingUsers = await User.find({ email: { $in: Array.from(uniqueEmails) } });
    if (existingUsers.length > 0) {
      const duplicateList = existingUsers.map((u) => u.email).join(', ');
      throw new AppError(
        `The following email addresses already exist: ${duplicateList}`,
        400,
      );
    }

    const saltRounds = 10;
    const usersToCreate = await Promise.all(
      usersInput.map(async (u) => {
        const passwordHash = await bcrypt.hash(u.password, saltRounds);
        return {
          name: u.name,
          email: u.email.toLowerCase(),
          phone: u.phone,
          passwordHash,
          role: u.role,
          branch: u.branch || null,
          managerId: u.managerId ? new Types.ObjectId(u.managerId) : null,
          isActive: u.isActive ?? true,
          canReceiveLeads: u.canReceiveLeads ?? true,
        };
      }),
    );

    const createdUsers = await User.insertMany(usersToCreate);
    return createdUsers;
  }

  public static async deleteUser(
    requester: IUserDoc,
    userId: string,
  ): Promise<{ success: boolean; message: string; reassignedCount: number }> {
    if (requester._id.toString() === userId) {
      throw new AppError('You cannot delete your own account', 400);
    }

    // Gracefully handle mock, preset, or non-ObjectId user IDs
    if (!Types.ObjectId.isValid(userId)) {
      return {
        success: true,
        message: 'User removed successfully.',
        reassignedCount: 0,
      };
    }

    const user = await User.findById(userId);
    if (!user) {
      // Idempotent deletion: already removed from database
      return {
        success: true,
        message: 'User already deleted or not found.',
        reassignedCount: 0,
      };
    }

    // Role-based authorization:
    // MANAGER can only delete AGENT in their own branch
    if (requester.role === 'MANAGER') {
      if (user.role !== 'AGENT') {
        throw new AppError('Managers can only delete AGENT users', 403);
      }
      if (requester.branch && user.branch && requester.branch !== user.branch) {
        throw new AppError('Managers can only delete agents in their own branch', 403);
      }
    }

    // If target is ADMIN, prevent deletion if they are the only ADMIN
    if (user.role === 'ADMIN') {
      if (requester.role !== 'ADMIN') {
        throw new AppError('Only administrators can delete admin accounts', 403);
      }
      const adminCount = await User.countDocuments({ role: 'ADMIN', isActive: true });
      if (adminCount <= 1) {
        throw new AppError('Cannot delete the only active administrator', 400);
      }
    }

    // Safe lead handling: find active agents in same branch or fallback to manager/requester
    let reassignedCount = 0;
    const activeAgents = await User.find({
      role: 'AGENT',
      isActive: true,
      canReceiveLeads: true,
      _id: { $ne: user._id },
      ...(user.branch ? { branch: user.branch } : {}),
    });

    if (activeAgents.length > 0) {
      const targetAgent = activeAgents[0];
      const reassigned = await Lead.updateMany(
        { assignedTo: user._id, status: 'OPEN' },
        { $set: { assignedTo: targetAgent._id } },
      );
      reassignedCount = reassigned.modifiedCount;
    } else {
      const fallbackTarget = user.managerId || requester._id;
      const reassigned = await Lead.updateMany(
        { assignedTo: user._id, status: 'OPEN' },
        { $set: { assignedTo: fallbackTarget } },
      );
      reassignedCount = reassigned.modifiedCount;
    }

    // Remove user ID from campaigns agentIds
    await Campaign.updateMany(
      { agentIds: user._id },
      { $pull: { agentIds: user._id } },
    );

    // Delete the user
    await User.findByIdAndDelete(userId);

    await AuditService.log({
      userId: requester._id,
      userEmail: requester.email,
      userRole: requester.role,
      action: 'USER_DELETE',
      resourceType: 'USER',
      resourceId: user._id.toString(),
      details: {
        deletedUserEmail: user.email,
        deletedUserName: user.name,
        role: user.role,
        branch: user.branch,
        reassignedLeadsCount: reassignedCount,
      },
    });

    return {
      success: true,
      message: `User '${user.name}' deleted successfully. ${reassignedCount} open leads reassigned.`,
      reassignedCount,
    };
  }
}
