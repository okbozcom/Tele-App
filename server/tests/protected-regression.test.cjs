const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');

const { AuthService } = require('../dist/services/auth.service');
const { UserService } = require('../dist/services/user.service');
const { SettingService } = require('../dist/services/setting.service');
const { LeadService } = require('../dist/services/lead.service');
const { CampaignService } = require('../dist/services/campaign.service');
const { PipelineService } = require('../dist/services/pipeline.service');

const { User } = require('../dist/models/user.model');
const { Lead } = require('../dist/models/lead.model');
const { Campaign } = require('../dist/models/campaign.model');
const { Setting } = require('../dist/models/setting.model');
const { TaggedLead } = require('../dist/models/tagged-lead.model');
const { Pipeline } = require('../dist/models/pipeline.model');
const { Activity } = require('../dist/models/activity.model');
const { AuditService } = require('../dist/services/audit.service');
const { AppError } = require('../dist/utils/AppError');

describe('Protected Features Regression Suite (P1 - P6)', () => {
  beforeEach(() => {
    mock.method(AuditService, 'log', async () => {});
    mock.method(Activity, 'create', async (doc) => ({ _id: new Types.ObjectId(), ...doc }));
  });

  afterEach(() => {
    mock.restoreAll();
  });

  // -------------------------------------------------------------
  // P1: Sign-in Page & Authentication Contract
  // -------------------------------------------------------------
  describe('P1: Sign-in Page & Authentication Contract', () => {
    it('rejects login when user does not exist (401)', async () => {
      mock.method(User, 'findOne', () => ({
        select: () => null,
      }));

      await assert.rejects(
        () => AuthService.login({ email: 'unknown@example.com', password: 'Password123!' }),
        (err) => err instanceof AppError && err.statusCode === 401 && err.message.includes('Invalid email or password')
      );
    });

    it('rejects login when user is deactivated (401)', async () => {
      mock.method(User, 'findOne', () => ({
        select: () => ({
          _id: new Types.ObjectId(),
          email: 'deactivated@example.com',
          isActive: false,
          comparePassword: async () => true,
        }),
      }));

      await assert.rejects(
        () => AuthService.login({ email: 'deactivated@example.com', password: 'Password123!' }),
        (err) => err instanceof AppError && err.statusCode === 401 && err.message.includes('deactivated')
      );
    });

    it('rejects login when password does not match (401)', async () => {
      mock.method(User, 'findOne', () => ({
        select: () => ({
          _id: new Types.ObjectId(),
          email: 'user@example.com',
          isActive: true,
          comparePassword: async () => false,
        }),
      }));

      await assert.rejects(
        () => AuthService.login({ email: 'user@example.com', password: 'WrongPassword!' }),
        (err) => err instanceof AppError && err.statusCode === 401 && err.message.includes('Invalid email or password')
      );
    });

    it('returns valid token and user object upon successful credentials', async () => {
      process.env.JWT_SECRET = 'test_jwt_secret_key_parity_neodove';
      const fakeUser = {
        _id: new Types.ObjectId(),
        email: 'agent@hitalk.in',
        role: 'AGENT',
        isActive: true,
        tokenVersion: 1,
        comparePassword: async () => true,
      };

      mock.method(User, 'findOne', () => ({
        select: () => fakeUser,
      }));

      const res = await AuthService.login({ email: 'agent@hitalk.in', password: 'CorrectPassword123' });
      assert.ok(res.token, 'Token must be present in response');
      assert.equal(res.user.email, 'agent@hitalk.in');
      assert.equal(res.user.role, 'AGENT');
    });
  });

  // -------------------------------------------------------------
  // P2: Branch-wise Creation of Agents and Managers & Safeguards
  // -------------------------------------------------------------
  describe('P2: Branch-wise Team Management & Branch Safeguards', () => {
    it('prevents a MANAGER from creating non-AGENT users (403)', async () => {
      const managerRequester = {
        _id: new Types.ObjectId(),
        role: 'MANAGER',
        branch: 'Chennai',
      };

      await assert.rejects(
        () =>
          UserService.createUser(managerRequester, {
            name: 'Sub Manager',
            email: 'submgr@example.com',
            password: 'Password123!',
            role: 'MANAGER',
            branch: 'Chennai',
          }),
        (err) => err instanceof AppError && err.statusCode === 403 && err.message.includes('Managers can only create AGENT users')
      );
    });

    it('locks newly created agent to manager branch when created by MANAGER', async () => {
      const managerId = new Types.ObjectId();
      const managerRequester = {
        _id: managerId,
        role: 'MANAGER',
        branch: 'Coimbatore',
        email: 'mgr@example.com',
      };

      mock.method(User, 'findOne', async () => null);
      mock.method(User, 'create', async (doc) => ({
        _id: new Types.ObjectId(),
        ...doc,
      }));

      const created = await UserService.createUser(managerRequester, {
        name: 'New Agent',
        email: 'agent1@example.com',
        password: 'Password123!',
        role: 'AGENT',
        branch: 'InjectedDifferentBranch', // Attempted injection
      });

      // Manager's branch Coimbatore must override any attempted branch injection
      assert.equal(created.branch, 'Coimbatore', 'Agent branch must be locked to Manager branch');
      assert.equal(created.role, 'AGENT');
    });

    it('prevents deleting the only active administrator (400)', async () => {
      const adminId = new Types.ObjectId();
      const adminRequester = {
        _id: new Types.ObjectId(),
        role: 'ADMIN',
        email: 'admin2@example.com',
      };

      mock.method(User, 'findById', async () => ({
        _id: adminId,
        role: 'ADMIN',
        isActive: true,
      }));
      mock.method(User, 'countDocuments', async () => 1);

      await assert.rejects(
        () => UserService.deleteUser(adminRequester, adminId.toString()),
        (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes('Cannot delete the only active administrator')
      );
    });

    it('safely reassigns open leads to active branch agent when agent is deleted', async () => {
      const agentId = new Types.ObjectId();
      const survivorAgentId = new Types.ObjectId();
      const adminRequester = {
        _id: new Types.ObjectId(),
        role: 'ADMIN',
        email: 'admin@example.com',
      };

      mock.method(User, 'findById', async () => ({
        _id: agentId,
        role: 'AGENT',
        branch: 'Madurai',
        isActive: true,
      }));

      mock.method(User, 'find', async () => [
        { _id: survivorAgentId, role: 'AGENT', branch: 'Madurai', isActive: true },
      ]);

      let updateManyCalled = false;
      mock.method(Lead, 'updateMany', async (filter, update) => {
        updateManyCalled = true;
        assert.equal(filter.assignedTo.toString(), agentId.toString());
        assert.equal(filter.status, 'OPEN');
        assert.equal(update.$set.assignedTo.toString(), survivorAgentId.toString());
        return { modifiedCount: 15 };
      });

      mock.method(Campaign, 'updateMany', async () => ({ modifiedCount: 1 }));
      mock.method(User, 'findByIdAndDelete', async () => ({ _id: agentId }));

      const result = await UserService.deleteUser(adminRequester, agentId.toString());
      assert.equal(result.success, true);
      assert.equal(result.reassignedCount, 15);
      assert.equal(updateManyCalled, true);
    });
  });

  // -------------------------------------------------------------
  // P3: Settings Integrity
  // -------------------------------------------------------------
  describe('P3: Settings Page Integrity', () => {
    it('preserves core settings fields and defaults', async () => {
      mock.method(Setting, 'findOne', async () => ({
        allowDisposeWithoutFollowUp: false,
        followUpMandatoryForNotConnected: true,
        autoLeadDistribution: true,
        reassignAfterHours: 24,
      }));

      const settings = await SettingService.getSettings();
      assert.equal(typeof settings.allowDisposeWithoutFollowUp, 'boolean');
      assert.equal(typeof settings.followUpMandatoryForNotConnected, 'boolean');
      assert.equal(typeof settings.autoLeadDistribution, 'boolean');
      assert.equal(typeof settings.reassignAfterHours, 'number');
    });

    it('updates system settings correctly while preserving all fields', async () => {
      const existingDoc = {
        allowDisposeWithoutFollowUp: false,
        followUpMandatoryForNotConnected: false,
        autoLeadDistribution: true,
        reassignAfterHours: 24,
        save: async function () { return this; },
      };

      mock.method(Setting, 'findOne', async () => existingDoc);

      const updated = await SettingService.updateSettings({
        allowDisposeWithoutFollowUp: true,
        followUpMandatoryForNotConnected: true,
      });

      assert.equal(updated.allowDisposeWithoutFollowUp, true);
      assert.equal(updated.followUpMandatoryForNotConnected, true);
      assert.equal(updated.autoLeadDistribution, true);
    });
  });

  // -------------------------------------------------------------
  // P4: Agents Edit Own Leads Contact Info
  // -------------------------------------------------------------
  describe('P4: Agents Editing Own Leads Name & Phone', () => {
    it('allows an AGENT to update name and phone of their own assigned lead', async () => {
      const agentId = new Types.ObjectId();
      const leadId = new Types.ObjectId();
      const requester = {
        _id: agentId,
        role: 'AGENT',
      };

      const leadDoc = {
        _id: leadId,
        assignedTo: agentId,
        name: 'Old Customer Name',
        phone: '9876543210',
        save: async function () {
          return this;
        },
      };

      mock.method(Lead, 'findById', async () => leadDoc);

      const updated = await LeadService.updateLead(requester, leadId.toString(), {
        name: 'Updated Name',
        phone: '9876543211',
      });

      assert.equal(updated.name, 'Updated Name');
      assert.equal(updated.phone, '9876543211');
    });

    it('strictly forbids an AGENT from editing a lead assigned to another user (403)', async () => {
      const agentId = new Types.ObjectId();
      const otherUserId = new Types.ObjectId();
      const leadId = new Types.ObjectId();
      const requester = {
        _id: agentId,
        role: 'AGENT',
      };

      mock.method(Lead, 'findById', async () => ({
        _id: leadId,
        assignedTo: otherUserId,
        name: 'Target Customer',
        phone: '9876543210',
      }));

      await assert.rejects(
        () =>
          LeadService.updateLead(requester, leadId.toString(), {
            name: 'Hacked Name',
          }),
        (err) => err instanceof AppError && err.statusCode === 403 && err.message.includes('only update leads assigned to you')
      );
    });
  });

  // -------------------------------------------------------------
  // P5: Tag/Assign Leads to Admin & Manager
  // -------------------------------------------------------------
  describe('P5: Tagging Leads to Admin and Manager', () => {
    it('allows an AGENT to tag an assigned lead to MANAGER with reason and note', async () => {
      const agentId = new Types.ObjectId();
      const leadId = new Types.ObjectId();
      const requester = {
        _id: agentId,
        role: 'AGENT',
        branch: 'Chennai',
      };

      mock.method(Lead, 'findById', async () => ({
        _id: leadId,
        assignedTo: agentId,
        name: 'VIP Client',
        phone: '9988776655',
        campaignId: new Types.ObjectId(),
      }));

      mock.method(TaggedLead, 'create', async (doc) => ({
        _id: new Types.ObjectId(),
        ...doc,
        status: 'PENDING',
      }));

      const tagged = await LeadService.tagLeadToManager(requester, {
        leadId: leadId.toString(),
        customerName: 'VIP Client',
        customerPhone: '9988776655',
        targetRole: 'MANAGER',
        reason: 'ESCALATION',
        note: 'Customer requested senior manager callback for bulk purchase',
      });

      assert.ok(tagged._id);
      assert.equal(tagged.targetRole, 'MANAGER');
      assert.equal(tagged.reason, 'ESCALATION');
    });

    it('rejects tagging when leadId format is invalid (400)', async () => {
      const requester = {
        _id: new Types.ObjectId(),
        role: 'AGENT',
      };

      await assert.rejects(
        () =>
          LeadService.tagLeadToManager(requester, {
            leadId: 'invalid-lead-id',
            targetRole: 'ADMIN',
          }),
        (err) => err instanceof AppError && err.statusCode === 400
      );
    });
  });

  // -------------------------------------------------------------
  // P6: Admin Creates Campaigns Branch-wise
  // -------------------------------------------------------------
  describe('P6: Admin Campaign Creation & Branch Binding', () => {
    it('creates campaign with branch binding and validated agents', async () => {
      const adminId = new Types.ObjectId();
      const agentId = new Types.ObjectId();
      const managerId = new Types.ObjectId();
      const pipelineId = new Types.ObjectId();
      const requester = {
        _id: adminId,
        role: 'ADMIN',
      };

      mock.method(Pipeline, 'findById', async () => ({ _id: pipelineId, name: 'Sales Pipeline' }));
      mock.method(User, 'find', async () => [
        { _id: agentId, role: 'AGENT', isActive: true, name: 'Active Agent', email: 'agent@hitalk.in' },
      ]);
      mock.method(User, 'findOne', async () => ({
        _id: managerId,
        role: 'MANAGER',
        branch: 'Salem',
        isActive: true,
      }));
      mock.method(Campaign, 'create', async (doc) => ({
        _id: new Types.ObjectId(),
        ...doc,
      }));

      const campaign = await CampaignService.createCampaign(requester, {
        name: 'Diwali Mega Campaign',
        pipelineId: pipelineId.toString(),
        branch: 'Salem',
        agentIds: [agentId.toString()],
        distributionMode: 'EQUAL',
        conditionalRules: [],
        priority: 'HIGH',
        duplicateMode: 'ALLOW',
      });

      assert.ok(campaign._id);
      assert.equal(campaign.name, 'Diwali Mega Campaign');
      assert.equal(campaign.branch, 'Salem');
      assert.equal(campaign.distributionMode, 'EQUAL');
    });

    it('prevents a MANAGER from creating campaigns outside their own branch (locks to manager branch)', async () => {
      const managerId = new Types.ObjectId();
      const agentId = new Types.ObjectId();
      const pipelineId = new Types.ObjectId();
      const managerRequester = {
        _id: managerId,
        role: 'MANAGER',
        branch: 'Tirunelveli',
      };

      mock.method(Pipeline, 'findById', async () => ({ _id: pipelineId }));
      mock.method(User, 'find', async () => [
        { _id: agentId, role: 'AGENT', isActive: true, name: 'Branch Agent', email: 'b_agent@hitalk.in' },
      ]);

      mock.method(Campaign, 'create', async (doc) => ({
        _id: new Types.ObjectId(),
        ...doc,
      }));

      const campaign = await CampaignService.createCampaign(managerRequester, {
        name: 'Local Branch Campaign',
        pipelineId: pipelineId.toString(),
        branch: 'Chennai', // Injected outside branch
        agentIds: [agentId.toString()],
        distributionMode: 'EQUAL',
        conditionalRules: [],
        priority: 'MEDIUM',
        duplicateMode: 'ALLOW',
      });

      // Campaign branch must be locked to Manager's branch 'Tirunelveli'
      assert.equal(campaign.branch, 'Tirunelveli', 'Campaign branch must be locked to manager branch');
    });

    it('rejects campaign creation if assigned pipeline does not exist (400)', async () => {
      const adminRequester = {
        _id: new Types.ObjectId(),
        role: 'ADMIN',
      };

      mock.method(Pipeline, 'findById', async () => null);

      await assert.rejects(
        () =>
          CampaignService.createCampaign(adminRequester, {
            name: 'Invalid Campaign',
            pipelineId: new Types.ObjectId().toString(),
            agentIds: [],
            distributionMode: 'EQUAL',
            conditionalRules: [],
            priority: 'LOW',
            duplicateMode: 'ALLOW',
          }),
        (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes('Specified pipeline does not exist')
      );
    });
  });
});
