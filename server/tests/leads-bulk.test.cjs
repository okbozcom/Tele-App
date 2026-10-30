const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');

const { LeadService } = require('../dist/services/lead.service');
const { AuditService } = require('../dist/services/audit.service');
const { Lead } = require('../dist/models/lead.model');
const { Campaign } = require('../dist/models/campaign.model');
const { AppError } = require('../dist/utils/AppError');

describe('Leads Bulk Actions Unit / Integration Tests (NeoDove Spec 4.6)', () => {
  beforeEach(() => {
    mock.method(AuditService, 'log', async () => {});
  });

  afterEach(() => {
    mock.restoreAll();
  });

  // 1. Bulk Update
  describe('LeadService.bulkUpdate', () => {
    it('updates stage, tag, and status for selected leads', async () => {
      mock.method(Lead, 'updateMany', async (filter, update) => {
        assert.equal(filter._id.$in.length, 2);
        assert.equal(update.$set.stage, 'Follow Up');
        assert.equal(update.$set.tag, 'HIGH_PRIORITY');
        assert.equal(update.$set.status, 'OPEN');
        return { modifiedCount: 2 };
      });

      const requester = {
        _id: new Types.ObjectId(),
        role: 'ADMIN',
        email: 'admin@example.com',
      };

      const result = await LeadService.bulkUpdate(requester, {
        leadIds: [new Types.ObjectId().toString(), new Types.ObjectId().toString()],
        stage: 'Follow Up',
        tag: 'HIGH_PRIORITY',
        status: 'OPEN',
      });

      assert.equal(result.modifiedCount, 2);
    });

    it('returns 0 modifiedCount when no updates are provided', async () => {
      const requester = {
        _id: new Types.ObjectId(),
        role: 'ADMIN',
        email: 'admin@example.com',
      };

      const result = await LeadService.bulkUpdate(requester, {
        leadIds: [new Types.ObjectId().toString()],
      });

      assert.equal(result.modifiedCount, 0);
    });
  });

  // 2. Bulk Move
  describe('LeadService.bulkMove', () => {
    const targetCampaignId = new Types.ObjectId();
    const mockTargetCampaign = {
      _id: targetCampaignId,
      name: 'Q2 Targeted Outreach',
      branch: 'Chennai',
      managerId: new Types.ObjectId(),
    };

    it('moves leads to target campaign successfully for ADMIN', async () => {
      mock.method(Campaign, 'findById', async () => mockTargetCampaign);
      mock.method(Lead, 'updateMany', async (filter, update) => {
        assert.equal(update.$set.campaignId.toString(), targetCampaignId.toString());
        assert.equal(update.$set.branch, 'Chennai');
        return { modifiedCount: 3 };
      });

      const requester = {
        _id: new Types.ObjectId(),
        role: 'ADMIN',
        email: 'admin@example.com',
      };

      const result = await LeadService.bulkMove(requester, {
        leadIds: [new Types.ObjectId().toString(), new Types.ObjectId().toString(), new Types.ObjectId().toString()],
        targetCampaignId: targetCampaignId.toString(),
      });

      assert.equal(result.modifiedCount, 3);
    });

    it('rejects move if target campaign does not exist (404)', async () => {
      mock.method(Campaign, 'findById', async () => null);

      const requester = {
        _id: new Types.ObjectId(),
        role: 'ADMIN',
        email: 'admin@example.com',
      };

      await assert.rejects(
        () =>
          LeadService.bulkMove(requester, {
            leadIds: [new Types.ObjectId().toString()],
            targetCampaignId: new Types.ObjectId().toString(),
          }),
        (err) => err instanceof AppError && err.statusCode === 404
      );
    });

    it('rejects move if MANAGER does not manage the target campaign (403)', async () => {
      mock.method(Campaign, 'findById', async () => mockTargetCampaign);

      const managerRequester = {
        _id: new Types.ObjectId(), // Different manager
        role: 'MANAGER',
        branch: 'Bangalore', // Different branch
        email: 'manager@example.com',
      };

      await assert.rejects(
        () =>
          LeadService.bulkMove(managerRequester, {
            leadIds: [new Types.ObjectId().toString()],
            targetCampaignId: targetCampaignId.toString(),
          }),
        (err) => err instanceof AppError && err.statusCode === 403 && err.message.includes('do not manage')
      );
    });
  });

  // 3. Bulk Copy
  describe('LeadService.bulkCopy', () => {
    const targetCampaignId = new Types.ObjectId();
    const mockTargetCampaign = {
      _id: targetCampaignId,
      name: 'Archive Copy Campaign',
      branch: 'Mumbai',
      managerId: new Types.ObjectId(),
    };

    it('duplicates leads into target campaign with reset state', async () => {
      mock.method(Campaign, 'findById', async () => mockTargetCampaign);
      mock.method(Lead, 'find', async () => [
        {
          name: 'Lead Alpha',
          phone: '9876543210',
          email: 'alpha@example.com',
          branch: 'Mumbai',
          tag: 'VIP',
          customProperties: new Map([['industry', 'Retail']]),
        },
      ]);
      mock.method(Lead, 'insertMany', async (docs) => {
        assert.equal(docs.length, 1);
        assert.equal(docs[0].campaignId.toString(), targetCampaignId.toString());
        assert.equal(docs[0].name, 'Lead Alpha');
        assert.equal(docs[0].source, 'BULK_COPY');
        assert.equal(docs[0].status, 'OPEN');
        assert.equal(docs[0].attemptCount, 0);
        return docs;
      });

      const requester = {
        _id: new Types.ObjectId(),
        role: 'ADMIN',
        email: 'admin@example.com',
      };

      const result = await LeadService.bulkCopy(requester, {
        leadIds: [new Types.ObjectId().toString()],
        targetCampaignId: targetCampaignId.toString(),
      });

      assert.equal(result.copiedCount, 1);
    });
  });

  // 4. Bulk Close
  describe('LeadService.bulkClose', () => {
    it('closes leads with status CLOSED and provided reason', async () => {
      mock.method(Lead, 'updateMany', async (filter, update) => {
        assert.equal(update.$set.status, 'CLOSED');
        assert.equal(update.$set.stage, 'Archived by Admin');
        return { modifiedCount: 5 };
      });

      const requester = {
        _id: new Types.ObjectId(),
        role: 'ADMIN',
        email: 'admin@example.com',
      };

      const result = await LeadService.bulkClose(requester, {
        leadIds: [new Types.ObjectId().toString()],
        reason: 'Archived by Admin',
      });

      assert.equal(result.closedCount, 5);
    });
  });

  // 5. Bulk Delete
  describe('LeadService.bulkDelete', () => {
    it('deletes leads when requester is ADMIN and confirmation is DELETE', async () => {
      mock.method(Lead, 'deleteMany', async (filter) => {
        assert.equal(filter._id.$in.length, 2);
        return { deletedCount: 2 };
      });

      const adminRequester = {
        _id: new Types.ObjectId(),
        role: 'ADMIN',
        email: 'admin@example.com',
      };

      const result = await LeadService.bulkDelete(adminRequester, {
        leadIds: [new Types.ObjectId().toString(), new Types.ObjectId().toString()],
        confirmation: 'DELETE',
      });

      assert.equal(result.deletedCount, 2);
    });

    it('rejects bulk delete if requester is MANAGER (403)', async () => {
      const managerRequester = {
        _id: new Types.ObjectId(),
        role: 'MANAGER',
        email: 'mgr@example.com',
      };

      await assert.rejects(
        () =>
          LeadService.bulkDelete(managerRequester, {
            leadIds: [new Types.ObjectId().toString()],
            confirmation: 'DELETE',
          }),
        (err) => err instanceof AppError && err.statusCode === 403 && err.message.includes('Only administrators')
      );
    });

    it('rejects bulk delete if confirmation string is not exactly DELETE (400)', async () => {
      const adminRequester = {
        _id: new Types.ObjectId(),
        role: 'ADMIN',
        email: 'admin@example.com',
      };

      await assert.rejects(
        () =>
          LeadService.bulkDelete(adminRequester, {
            leadIds: [new Types.ObjectId().toString()],
            confirmation: 'delete',
          }),
        (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes('Confirmation text must be exactly "DELETE"')
      );
    });
  });
});
