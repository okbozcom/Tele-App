import { User, UserRole } from '../types';
import { storage } from './storage';

export interface RegisteredUserRecord extends User {
  password?: string;
}

const REGISTRY_STORAGE_KEY = 'tele_registered_users_v2';
const DELETED_USERS_KEY = 'tele_deleted_users_v1';

export const INITIAL_PRESET_USERS: RegisteredUserRecord[] = [
  {
    _id: 'u-admin',
    name: 'System Admin',
    email: 'admin@example.com',
    phone: '9876543200',
    password: 'Admin@123',
    role: 'ADMIN',
    branch: null,
    isActive: true,
    canReceiveLeads: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    _id: 'u-mgr-trichy',
    name: 'Trichy Manager',
    email: 'manager.trichy@company.com',
    phone: '9876543230',
    password: 'Manager@123',
    role: 'MANAGER',
    branch: 'Trichy',
    isActive: true,
    canReceiveLeads: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    _id: 'u-kavin',
    name: 'Kavin',
    email: 'kavin@company.com',
    phone: '9876543220',
    password: 'Agent@123',
    role: 'AGENT',
    branch: 'Trichy',
    isActive: true,
    canReceiveLeads: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    _id: 'u-sarah',
    name: 'Sarah Telecaller',
    email: 'sarah@company.com',
    phone: '9876543211',
    password: 'Agent@123',
    role: 'AGENT',
    branch: 'Trichy',
    isActive: true,
    canReceiveLeads: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    _id: 'u-mgr-pudukkottai',
    name: 'Pudukkottai Manager',
    email: 'manager.pudukkottai@company.com',
    phone: '9876543240',
    password: 'Manager@123',
    role: 'MANAGER',
    branch: 'Pudukkottai',
    isActive: true,
    canReceiveLeads: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    _id: 'u-john',
    name: 'John Agent',
    email: 'john@company.com',
    phone: '9876543210',
    password: 'Agent@123',
    role: 'AGENT',
    branch: 'Pudukkottai',
    isActive: true,
    canReceiveLeads: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    _id: 'u-alex',
    name: 'Alex Outreach',
    email: 'alex@company.com',
    phone: '9876543212',
    password: 'Agent@123',
    role: 'AGENT',
    branch: 'Pudukkottai',
    isActive: true,
    canReceiveLeads: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

export class UserRegistry {
  /**
   * Retrieves deleted user identifiers (IDs and lowercase emails).
   */
  public static async getDeletedIdentifiers(): Promise<Set<string>> {
    try {
      const stored = await storage.getItem(DELETED_USERS_KEY);
      if (!stored) return new Set<string>();
      const list: string[] = JSON.parse(stored);
      return new Set<string>(list.map((s) => s.toLowerCase()));
    } catch {
      return new Set<string>();
    }
  }

  /**
   * Permanently deletes a user from local storage and blacklists their ID/email
   * so initial presets never resurrect them.
   */
  public static async deleteUser(idOrEmail: string): Promise<boolean> {
    try {
      if (!idOrEmail) return false;
      const cleanTarget = idOrEmail.trim().toLowerCase();
      const deletedSet = await this.getDeletedIdentifiers();
      deletedSet.add(cleanTarget);

      // Find user to also blacklist both their _id and email
      const stored = await storage.getItem(REGISTRY_STORAGE_KEY);
      let users: RegisteredUserRecord[] = stored ? JSON.parse(stored) : [...INITIAL_PRESET_USERS];

      const found = users.find(
        (u) =>
          u._id.toLowerCase() === cleanTarget ||
          u.email.toLowerCase() === cleanTarget,
      );
      if (found) {
        deletedSet.add(found._id.toLowerCase());
        deletedSet.add(found.email.toLowerCase());
      }

      // Check presets as well
      const presetFound = INITIAL_PRESET_USERS.find(
        (p) =>
          p._id.toLowerCase() === cleanTarget ||
          p.email.toLowerCase() === cleanTarget,
      );
      if (presetFound) {
        deletedSet.add(presetFound._id.toLowerCase());
        deletedSet.add(presetFound.email.toLowerCase());
      }

      // Save deleted set
      await storage.setItem(
        DELETED_USERS_KEY,
        JSON.stringify(Array.from(deletedSet)),
      );

      // Filter and save registry
      users = users.filter(
        (u) =>
          !deletedSet.has(u._id.toLowerCase()) &&
          !deletedSet.has(u.email.toLowerCase()),
      );
      await storage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(users));

      return true;
    } catch (e) {
      console.warn('UserRegistry.deleteUser error:', e);
      return false;
    }
  }

  /**
   * Retrieves all users from persistent storage, merging with initial preset users,
   * excluding any users that have been deleted.
   */
  public static async getAllUsers(): Promise<RegisteredUserRecord[]> {
    try {
      const deletedSet = await this.getDeletedIdentifiers();
      const stored = await storage.getItem(REGISTRY_STORAGE_KEY);
      let parsed: RegisteredUserRecord[] = stored ? JSON.parse(stored) : [];

      // Filter out any stored users that are deleted
      parsed = parsed.filter(
        (u) =>
          !deletedSet.has(u._id.toLowerCase()) &&
          !deletedSet.has(u.email.toLowerCase()),
      );

      // Ensure preset users exist in registry ONLY if not deleted
      const existingEmails = new Set(parsed.map((u) => u.email.toLowerCase()));
      const existingIds = new Set(parsed.map((u) => u._id.toLowerCase()));
      let updated = false;

      for (const preset of INITIAL_PRESET_USERS) {
        if (
          !deletedSet.has(preset._id.toLowerCase()) &&
          !deletedSet.has(preset.email.toLowerCase()) &&
          !existingEmails.has(preset.email.toLowerCase()) &&
          !existingIds.has(preset._id.toLowerCase())
        ) {
          parsed.push(preset);
          updated = true;
        }
      }

      if (updated || !stored) {
        await storage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(parsed));
      }
      return parsed;
    } catch {
      const deletedSet = await this.getDeletedIdentifiers().catch(() => new Set<string>());
      return INITIAL_PRESET_USERS.filter(
        (p) => !deletedSet.has(p._id.toLowerCase()) && !deletedSet.has(p.email.toLowerCase()),
      );
    }
  }

  /**
   * Saves or updates a registered user in local persistent storage.
   */
  public static async saveUser(
    userData: {
      name: string;
      email: string;
      phone: string;
      password?: string;
      role: UserRole;
      branch?: string | null;
      canReceiveLeads?: boolean;
      isActive?: boolean;
    },
    explicitId?: string,
  ): Promise<RegisteredUserRecord> {
    const cleanEmail = userData.email.trim().toLowerCase();

    // If previously deleted, un-blacklist so new creation is valid
    try {
      const deletedSet = await this.getDeletedIdentifiers();
      if (deletedSet.has(cleanEmail) || (explicitId && deletedSet.has(explicitId.toLowerCase()))) {
        deletedSet.delete(cleanEmail);
        if (explicitId) deletedSet.delete(explicitId.toLowerCase());
        await storage.setItem(DELETED_USERS_KEY, JSON.stringify(Array.from(deletedSet)));
      }
    } catch {}

    const users = await this.getAllUsers();
    const existingIndex = users.findIndex((u) => u.email.toLowerCase() === cleanEmail);

    const now = new Date().toISOString();
    const newUserRecord: RegisteredUserRecord = {
      _id: explicitId || (existingIndex >= 0 ? users[existingIndex]._id : `u-${Date.now()}`),
      name: userData.name.trim(),
      email: cleanEmail,
      phone: userData.phone.trim(),
      password: userData.password,
      role: userData.role,
      branch: userData.branch || null,
      isActive: userData.isActive !== undefined ? userData.isActive : true,
      canReceiveLeads:
        userData.canReceiveLeads !== undefined
          ? userData.canReceiveLeads
          : userData.role === 'AGENT',
      createdAt: existingIndex >= 0 ? users[existingIndex].createdAt : now,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      users[existingIndex] = {
        ...users[existingIndex],
        ...newUserRecord,
        password: userData.password || users[existingIndex].password,
      };
    } else {
      users.push(newUserRecord);
    }

    await storage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(users));
    return newUserRecord;
  }

  /**
   * Finds a user by email.
   */
  public static async findByEmail(email: string): Promise<RegisteredUserRecord | null> {
    const cleanEmail = email.trim().toLowerCase();
    const users = await this.getAllUsers();
    return users.find((u) => u.email.toLowerCase() === cleanEmail) || null;
  }

  /**
   * Verifies credentials against local registry.
   */
  public static async verifyCredentials(
    email: string,
    password: string,
  ): Promise<RegisteredUserRecord | null> {
    const cleanEmail = email.trim().toLowerCase();
    const users = await this.getAllUsers();
    const user = users.find((u) => u.email.toLowerCase() === cleanEmail);

    if (!user) {
      return null;
    }

    if (!user.isActive) {
      throw new Error('This account has been deactivated.');
    }

    // Check exact password or allow common test patterns
    if (user.password && user.password !== password) {
      return null;
    }

    return user;
  }

  /**
   * Returns users scoped by branch. If branch is null/undefined, returns all.
   */
  public static async getUsersByBranch(
    branch?: string | null,
    role?: UserRole,
  ): Promise<RegisteredUserRecord[]> {
    const users = await this.getAllUsers();
    return users.filter((u) => {
      if (branch && u.branch !== branch) return false;
      if (role && u.role !== role) return false;
      return true;
    });
  }
}
