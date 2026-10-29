const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');

const { LeadService } = require('../dist/services/lead.service');
const { SettingService } = require('../dist/services/setting.service');
const { AuditService } = require('../dist/services/audit.service');
const { Lead } = require('../dist/models/lead.model');
const { Campaign } = require('../dist/models/campaign.model');
const { Setting } = require('../dist/models/setting.model');
const { maskPhoneNumber } = require('../dist/utils/phoneUtils');
const { AppError } = require('../dist/utils/AppError');

describe('Security Masking & Dial Intent Unit / Integration Tests (Spec 4.9)', () => {
  beforeEach(() => {
    mock.method(AuditService, 'log', async () => {});
  });

  afterEach(() => {
    mock.restoreAll();
  });

  // 1. Phone number masking utility
  describe('maskPhoneNumber utility', () => {
    it('masks 10-digit Indian numbers obscuring middle digits', () => {
      const masked = maskPhoneNumber('9876543210');
      assert.equal(masked, '98765****0');
    });

    it('masks international format numbers keeping prefix and last digit', () => {
      const masked = maskPhoneNumber('+91 9876543210');
      assert.equal(masked.endsWith('0'), true);
      assert.equal(masked.includes('****'), true);
    });

    it('returns 4 asterisks for short inputs', () => {
      assert.equal(maskPhoneNumber('123'), '****');
    });

    it('handles empty or null safely', () => {
      assert.equal(maskPhoneNumber(''), '');
      assert.equal(maskPhoneNumber(null), '');
      assert.equal(maskPhoneNumber(undefined), '');
    });
  });

  // 2. Lead listing masking enforcement
  describe('LeadService.listCampaignLeads masking', () => {
    const mockCampaignId = new Types.ObjectId();
    const agentId = new Types.ObjectId();
    const adminId = new Types.ObjectId();

    const mockCampaign = {
      _id: mockCampaignId,
      name: 'Sales Campaign',
      managerId: new Types.ObjectId(),
      agentIds: [agentId],
    };

    const mockLead = {
      _id: new Types.ObjectId(),
      campaignId: mockCampaignId,
      name: 'Anand Kumar',
      phone: '9876543210',
      assignedTo: agentId,
      toObject() {
        return { ...this };
      },
    };

    it('masks phone for AGENT when maskContactNumber is true', async () => {
      mock.method(Campaign, 'findById', async () => mockCampaign);
      mock.method(SettingService, 'getSettings', async () => ({ maskContactNumber: true }));
      mock.method(Lead, 'find', () => ({
        populate: () => ({
          sort: () => ({
            skip: () => ({
              limit: async () => [{ ...mockLead, toObject: () => ({ ...mockLead }) }],
            }),
          }),
        }),
      }));
      mock.method(Lead, 'countDocuments', async () => 1);

      const agentRequester = {
        _id: agentId,
        role: 'AGENT',
        email: 'agent@example.com',
      };

      const result = await LeadService.listCampaignLeads(agentRequester, mockCampaignId.toString(), {});
      assert.equal(result.leads.length, 1);
      assert.equal(result.leads[0].phone, '98765****0');
      assert.equal(result.leads[0].isMasked, true);
    });

    it('leaves phone unmasked for ADMIN even when maskContactNumber is true', async () => {
      mock.method(Campaign, 'findById', async () => mockCampaign);
      mock.method(SettingService, 'getSettings', async () => ({ maskContactNumber: true }));
      mock.method(Lead, 'find', () => ({
        populate: () => ({
          sort: () => ({
            skip: () => ({
              limit: async () => [{ ...mockLead, toObject: () => ({ ...mockLead }) }],
            }),
          }),
        }),
      }));
      mock.method(Lead, 'countDocuments', async () => 1);

      const adminRequester = {
        _id: adminId,
        role: 'ADMIN',
        email: 'admin@example.com',
      };

      const result = await LeadService.listCampaignLeads(adminRequester, mockCampaignId.toString(), {});
      assert.equal(result.leads.length, 1);
      assert.equal(result.leads[0].phone, '9876543210');
      assert.equal(result.leads[0].isMasked, undefined);
    });

    it('leaves phone unmasked for AGENT when maskContactNumber is false', async () => {
      mock.method(Campaign, 'findById', async () => mockCampaign);
      mock.method(SettingService, 'getSettings', async () => ({ maskContactNumber: false }));
      mock.method(Lead, 'find', () => ({
        populate: () => ({
          sort: () => ({
            skip: () => ({
              limit: async () => [{ ...mockLead, toObject: () => ({ ...mockLead }) }],
            }),
          }),
        }),
      }));
      mock.method(Lead, 'countDocuments', async () => 1);

      const agentRequester = {
        _id: agentId,
        role: 'AGENT',
        email: 'agent@example.com',
      };

      const result = await LeadService.listCampaignLeads(agentRequester, mockCampaignId.toString(), {});
      assert.equal(result.leads.length, 1);
      assert.equal(result.leads[0].phone, '9876543210');
      assert.equal(result.leads[0].isMasked, undefined);
    });
  });

  // 3. Dial intent authorization
  describe('LeadService.getDialIntent authorization & token resolution', () => {
    const leadId = new Types.ObjectId();
    const assignedAgentId = new Types.ObjectId();
    const otherAgentId = new Types.ObjectId();

    const mockLead = {
      _id: leadId,
      name: 'Target Customer',
      phone: '9876543210',
      assignedTo: assignedAgentId,
      campaignId: new Types.ObjectId(),
    };

    it('returns unmasked dial number for assigned AGENT', async () => {
      mock.method(Lead, 'findById', async () => mockLead);

      const requester = {
        _id: assignedAgentId,
        role: 'AGENT',
        email: 'agent1@example.com',
      };

      const intent = await LeadService.getDialIntent(requester, leadId.toString());
      assert.equal(intent.dialNumber, '9876543210');
      assert.equal(intent.leadId, leadId.toString());
    });

    it('rejects an AGENT who is not assigned to the lead with 403 Forbidden', async () => {
      mock.method(Lead, 'findById', async () => mockLead);

      const requester = {
        _id: otherAgentId,
        role: 'AGENT',
        email: 'agent2@example.com',
      };

      await assert.rejects(
        () => LeadService.getDialIntent(requester, leadId.toString()),
        (err) => err instanceof AppError && err.statusCode === 403 && err.message.includes('only dial leads assigned')
      );
    });

    it('rejects invalid lead ID with 400 Bad Request', async () => {
      const requester = {
        _id: assignedAgentId,
        role: 'AGENT',
        email: 'agent1@example.com',
      };

      await assert.rejects(
        () => LeadService.getDialIntent(requester, 'invalid-id-format'),
        (err) => err instanceof AppError && err.statusCode === 400
      );
    });

    it('returns 404 when lead is not found', async () => {
      mock.method(Lead, 'findById', async () => null);

      const requester = {
        _id: assignedAgentId,
        role: 'AGENT',
        email: 'agent1@example.com',
      };

      await assert.rejects(
        () => LeadService.getDialIntent(requester, new Types.ObjectId().toString()),
        (err) => err instanceof AppError && err.statusCode === 404
      );
    });
  });

  // 4. CSV export masking
  describe('LeadService.exportMyLeadsToCsv masking', () => {
    const agentId = new Types.ObjectId();
    const adminId = new Types.ObjectId();

    const mockLead = {
      _id: new Types.ObjectId(),
      name: 'Ravi Teja',
      phone: '9123456780',
      email: 'ravi@example.com',
      stage: 'New',
      tag: 'HOT',
      status: 'OPEN',
      branch: 'Chennai',
      assignedTo: { name: 'Agent 1', email: 'agent1@example.com' },
      campaignId: { name: 'Summer Campaign' },
      createdAt: new Date('2026-01-01'),
      nextFollowUpAt: null,
    };

    it('masks phone in CSV export for AGENT when maskContactNumber is true', async () => {
      mock.method(SettingService, 'getSettings', async () => ({ maskContactNumber: true }));
      mock.method(Lead, 'find', () => ({
        populate: () => ({
          populate: () => ({
            sort: async () => [mockLead],
          }),
        }),
      }));

      const agentRequester = {
        _id: agentId,
        role: 'AGENT',
        email: 'agent@example.com',
      };

      const csv = await LeadService.exportMyLeadsToCsv(agentRequester, {});
      assert.equal(csv.includes('91234****0'), true);
      assert.equal(csv.includes('9123456780'), false);
    });

    it('preserves cleartext phone in CSV export for ADMIN even when maskContactNumber is true', async () => {
      mock.method(SettingService, 'getSettings', async () => ({ maskContactNumber: true }));
      mock.method(Lead, 'find', () => ({
        populate: () => ({
          populate: () => ({
            sort: async () => [mockLead],
          }),
        }),
      }));

      const adminRequester = {
        _id: adminId,
        role: 'ADMIN',
        email: 'admin@example.com',
      };

      const csv = await LeadService.exportMyLeadsToCsv(adminRequester, {});
      assert.equal(csv.includes('9123456780'), true);
      assert.equal(csv.includes('91234****0'), false);
    });
  });
});
