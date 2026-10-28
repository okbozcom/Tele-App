import { Branch, IBranchDoc } from '../models/branch.model';
import { User, IUserDoc } from '../models/user.model';
import { Lead } from '../models/lead.model';
import { Campaign } from '../models/campaign.model';
import { CreateBranchInput } from '../validations/branch.validation';
import { AppError } from '../utils/AppError';

const DEFAULT_BRANCHES = [
  { name: 'Trichy', code: 'TRZ', address: 'Trichy Main Office' },
  { name: 'Pudukkottai', code: 'PDK', address: 'Pudukkottai Branch Office' },
  { name: 'Chennai', code: 'MAA', address: 'Chennai Regional Office' },
  { name: 'Madurai', code: 'IXM', address: 'Madurai Branch Office' },
];

export class BranchService {
  /**
   * Lists all branches. If none exist yet, automatically seeds default branches.
   */
  public static async listBranches(): Promise<IBranchDoc[]> {
    let branches = await Branch.find().sort({ name: 1 });

    if (branches.length === 0) {
      try {
        await Branch.insertMany(
          DEFAULT_BRANCHES.map((b) => ({
            ...b,
            isActive: true,
            createdBy: null,
          })),
        );
        branches = await Branch.find().sort({ name: 1 });
      } catch (_err: unknown) {
        // If race condition or duplicate key on seed, ignore and re-query
        branches = await Branch.find().sort({ name: 1 });
      }
    }

    return branches;
  }

  /**
   * Creates a new branch. Restricted to ADMIN users only.
   */
  public static async createBranch(
    requester: IUserDoc,
    input: CreateBranchInput,
  ): Promise<IBranchDoc> {
    if (requester.role !== 'ADMIN') {
      throw new AppError('Forbidden: Only administrators can create branches', 403);
    }

    const trimmedName = input.name.trim();

    // Case-insensitive duplicate check
    const existing = await Branch.findOne({
      name: { $regex: new RegExp(`^${trimmedName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') },
    });

    if (existing) {
      throw new AppError(`A branch named '${trimmedName}' already exists`, 409);
    }

    const branch = await Branch.create({
      name: trimmedName,
      code: input.code ? input.code.trim().toUpperCase() : '',
      address: input.address ? input.address.trim() : '',
      isActive: true,
      createdBy: requester._id,
    });

    return branch;
  }

  /**
   * Deletes a branch. Restricted to ADMIN users only.
   */
  public static async deleteBranch(requester: IUserDoc, id: string): Promise<void> {
    if (requester.role !== 'ADMIN') {
      throw new AppError('Forbidden: Only administrators can delete branches', 403);
    }

    const branch = await Branch.findById(id);
    if (!branch) {
      throw new AppError('Branch not found', 404);
    }

    // Safety check 1: Prevent deleting branch if users are assigned to it
    const userCount = await User.countDocuments({ branch: branch.name });
    if (userCount > 0) {
      throw new AppError(
        `Cannot delete branch '${branch.name}' because ${userCount} team member(s) are assigned to it. Please reassign them to another branch first.`,
        400,
      );
    }

    // Safety check 2: Prevent deleting branch if campaigns are assigned to it
    const campaignCount = await Campaign.countDocuments({ branch: branch.name });
    if (campaignCount > 0) {
      throw new AppError(
        `Cannot delete branch '${branch.name}' because ${campaignCount} campaign(s) are assigned to it. Please reassign or close these campaigns first.`,
        400,
      );
    }

    // Safety check 3: Prevent deleting branch if leads are assigned to it
    const leadCount = await Lead.countDocuments({ branch: branch.name });
    if (leadCount > 0) {
      throw new AppError(
        `Cannot delete branch '${branch.name}' because ${leadCount} lead(s) are assigned to it. Please reassign or reallocate these leads first.`,
        400,
      );
    }

    await branch.deleteOne();
  }
}
