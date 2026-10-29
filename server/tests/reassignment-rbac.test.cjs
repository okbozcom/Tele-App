const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');

const { LeadService } = require('../dist/services/lead.service');
const { ActivityService } = require('../dist/services/activity.service');
const { Lead } = require('../dist/models/lead.model');
const { Campaign } = require('../dist/models/campaign.model');
const { User } = require('../dist/models/user.model');
const { Activity } = require('../dist/models/activity.model');
const { AuditService } = require('../dist/services/audit.service');
const { SettingService } = require('../dist/services/setting.service');
const { PipelineService } = require('../dist/services/pipeline.service');
const { AppError } = require('../dist/utils/AppError');

describe('Production RBAC & Service Authorization Integration Tests', () => {
  beforeEach(() => {
    mock.method(AuditService, 'log', async () => {});
    mock.method(SettingService, 'getSettings', async () => ({ allowDisposeWithoutFollowUp: true }));
    mock.method(PipelineService, 'getStage', async () => ({ name: 'Interested' }));
    mock.method(Activity, 'create', async (data) => ({ _id: new Types.ObjectId(), ...data }));
    mock.method(Activity, 'findOne', () => ({ sort: () => null }));
  });

  afterEach(() => {
    mock.restoreAll();
  });

  // -------------------------------------------------------------
  // 1. LeadService.reassignLead — Production Function Verification
  // -------------------------------------------------------------
  describe('LeadService.reassignLead', () => {
    it('rejects invalid leadId with 400 Bad Request', async () => {
      const requester = { _id: new Types.ObjectId(), role: 'ADMIN' };
      await assert.rejects(
        () => LeadService.reassignLead(requester, 'invalid-hex-id', '670000000000000000000001'),
        (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes('Invalid lead ID format')
      );
    });

    it('rejects invalid targetUserId with 400 Bad Request', async () => {
      const requester = { _id: new Types.ObjectId(), role: 'ADMIN' };
      const validLeadId = new Types.ObjectId().toString();
      await assert.rejects(
        () => LeadService.reassignLead(requester, validLeadId, 'invalid-user-id'),
        (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes('Invalid target user ID format')
      );
    });

    it('prevents an AGENT from reassigning someone else\'s lead (403 Forbidden)', async () => {
      const agentId = new Types.ObjectId();
      const otherAgentId = new Types.ObjectId();
      const requester = { _id: agentId, role: 'AGENT' };

      const leadDoc = {
        _id: new Types.ObjectId(),
        campaignId: new Types.ObjectId(),
        assignedTo: otherAgentId,
        save: async () => {},
      };
      const campaignDoc = { _id: leadDoc.campaignId, managerId: new Types.ObjectId() };

      mock.method(Lead, 'findById', async () => leadDoc);
      mock.method(Campaign, 'findById', async () => campaignDoc);

      await assert.rejects(
        () => LeadService.reassignLead(requester, leadDoc._id.toString(), new Types.ObjectId().toString()),
        (err) => err instanceof AppError && err.statusCode === 403 && err.message.includes('Forbidden')
      );
    });

    it('prevents a MANAGER from reassigning leads outside their managed campaigns (403 Forbidden)', async () => {
      const managerId = new Types.ObjectId();
      const otherManagerId = new Types.ObjectId();
      const requester = { _id: managerId, role: 'MANAGER' };

      const leadDoc = {
        _id: new Types.ObjectId(),
        campaignId: new Types.ObjectId(),
        assignedTo: new Types.ObjectId(),
        save: async () => {},
      };
      const campaignDoc = { _id: leadDoc.campaignId, managerId: otherManagerId };

      mock.method(Lead, 'findById', async () => leadDoc);
      mock.method(Campaign, 'findById', async () => campaignDoc);

      await assert.rejects(
        () => LeadService.reassignLead(requester, leadDoc._id.toString(), new Types.ObjectId().toString()),
        (err) => err instanceof AppError && err.statusCode === 403 && err.message.includes('Forbidden')
      );
    });

    it('rejects target user if inactive with 400 Bad Request', async () => {
      const adminId = new Types.ObjectId();
      const requester = { _id: adminId, role: 'ADMIN' };
      const leadDoc = {
        _id: new Types.ObjectId(),
        campaignId: new Types.ObjectId(),
        assignedTo: new Types.ObjectId(),
        save: async () => {},
      };
      const campaignDoc = { _id: leadDoc.campaignId, managerId: new Types.ObjectId() };
      const inactiveAdmin = { _id: new Types.ObjectId(), role: 'ADMIN', isActive: false };

      mock.method(Lead, 'findById', async () => leadDoc);
      mock.method(Campaign, 'findById', async () => campaignDoc);
      mock.method(User, 'findById', async () => inactiveAdmin);

      await assert.rejects(
        () => LeadService.reassignLead(requester, leadDoc._id.toString(), inactiveAdmin._id.toString()),
        (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes('active user')
      );
    });

    it('rejects target AGENT if canReceiveLeads is false with 400 Bad Request', async () => {
      const adminId = new Types.ObjectId();
      const requester = { _id: adminId, role: 'ADMIN' };
      const leadDoc = {
        _id: new Types.ObjectId(),
        campaignId: new Types.ObjectId(),
        assignedTo: new Types.ObjectId(),
        save: async () => {},
      };
      const campaignDoc = { _id: leadDoc.campaignId, managerId: new Types.ObjectId() };
      const busyAgent = { _id: new Types.ObjectId(), role: 'AGENT', isActive: true, canReceiveLeads: false };

      mock.method(Lead, 'findById', async () => leadDoc);
      mock.method(Campaign, 'findById', async () => campaignDoc);
      mock.method(User, 'findById', async () => busyAgent);

      await assert.rejects(
        () => LeadService.reassignLead(requester, leadDoc._id.toString(), busyAgent._id.toString()),
        (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes('canReceiveLeads')
      );
    });

    it('successfully reassigns lead to an active ADMIN when called by an AGENT for own lead', async () => {
      const agentId = new Types.ObjectId();
      const requester = { _id: agentId, role: 'AGENT', email: 'agent@hitalk.com' };
      const adminTarget = { _id: new Types.ObjectId(), role: 'ADMIN', isActive: true };

      let saved = false;
      const leadDoc = {
        _id: new Types.ObjectId(),
        campaignId: new Types.ObjectId(),
        assignedTo: agentId,
        save: async function () { saved = true; },
      };
      const campaignDoc = { _id: leadDoc.campaignId, managerId: new Types.ObjectId() };

      mock.method(Lead, 'findById', async () => leadDoc);
      mock.method(Campaign, 'findById', async () => campaignDoc);
      mock.method(User, 'findById', async () => adminTarget);

      const result = await LeadService.reassignLead(requester, leadDoc._id.toString(), adminTarget._id.toString());
      assert.equal(saved, true);
      assert.equal(result.assignedTo.toString(), adminTarget._id.toString());
    });
  });

  // -------------------------------------------------------------
  // 2. ActivityService.disposeLead — Full Reassignment Call Path
  // -------------------------------------------------------------
  describe('ActivityService.disposeLead Reassignment Flow', () => {
    it('prevents an unauthorized AGENT from disposing/reassigning someone else\'s lead (403 Forbidden)', async () => {
      const agentId = new Types.ObjectId();
      const otherAgentId = new Types.ObjectId();
      const requester = { _id: agentId, role: 'AGENT', email: 'agent1@hitalk.com' };

      const leadDoc = {
        _id: new Types.ObjectId(),
        campaignId: new Types.ObjectId(),
        assignedTo: otherAgentId,
        customProperties: new Map(),
        save: async () => {},
      };
      const campaignDoc = { _id: leadDoc.campaignId, pipelineId: new Types.ObjectId() };

      mock.method(Lead, 'findById', async () => leadDoc);
      mock.method(Campaign, 'findById', async () => campaignDoc);

      await assert.rejects(
        () => ActivityService.disposeLead(requester, leadDoc._id.toString(), {
          stage: 'Interested',
          connected: true,
          reassignToUserId: new Types.ObjectId().toString(),
        }),
        (err) => err instanceof AppError && err.statusCode === 403 && err.message.includes('Forbidden')
      );
    });

    it('rejects invalid reassignToUserId with 400 Bad Request during call disposition', async () => {
      const agentId = new Types.ObjectId();
      const requester = { _id: agentId, role: 'AGENT', email: 'agent1@hitalk.com' };

      const leadDoc = {
        _id: new Types.ObjectId(),
        campaignId: new Types.ObjectId(),
        assignedTo: agentId,
        customProperties: new Map(),
        save: async () => {},
      };
      const campaignDoc = { _id: leadDoc.campaignId, pipelineId: new Types.ObjectId() };

      mock.method(Lead, 'findById', async () => leadDoc);
      mock.method(Campaign, 'findById', async () => campaignDoc);

      await assert.rejects(
        () => ActivityService.disposeLead(requester, leadDoc._id.toString(), {
          stage: 'Interested',
          connected: true,
          reassignToUserId: 'invalid-user-format',
        }),
        (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes('Invalid reassignToUserId format')
      );
    });

    it('successfully reassigns lead to an active ADMIN during call disposition', async () => {
      const agentId = new Types.ObjectId();
      const adminTargetId = new Types.ObjectId();
      const requester = { _id: agentId, role: 'AGENT', email: 'agent1@hitalk.com' };

      const leadDoc = {
        _id: new Types.ObjectId(),
        campaignId: new Types.ObjectId(),
        assignedTo: agentId,
        customProperties: new Map(),
        save: async () => {},
      };
      const campaignDoc = { _id: leadDoc.campaignId, pipelineId: new Types.ObjectId() };
      const adminTarget = { _id: adminTargetId, role: 'ADMIN', isActive: true };

      mock.method(Lead, 'findById', async () => leadDoc);
      mock.method(Campaign, 'findById', async () => campaignDoc);
      mock.method(User, 'findById', async () => adminTarget);

      const result = await ActivityService.disposeLead(requester, leadDoc._id.toString(), {
        stage: 'Interested',
        connected: true,
        reassignToUserId: adminTargetId.toString(),
      });

      assert.equal(result.lead.assignedTo.toString(), adminTargetId.toString());
    });
  });

  // -------------------------------------------------------------
  // 3. LeadService.getMyLeads — Server-Side Query Scoping & Shape
  // -------------------------------------------------------------
  describe('LeadService.getMyLeads Server-Side Security & Aggregation Shape', () => {
    it('strictly isolates AGENT query scope ignoring any injected userId parameter', async () => {
      const agentId = new Types.ObjectId();
      const maliciousUserId = new Types.ObjectId().toString();
      const requester = { _id: agentId, role: 'AGENT' };

      let capturedPipeline = null;
      mock.method(Lead, 'aggregate', async (pipeline) => {
        capturedPipeline = pipeline;
        return [{ metadata: [{ total: 1 }], data: [{ _id: 'l1', name: 'Test Lead', assignedToId: agentId }] }];
      });

      await LeadService.getMyLeads(requester, { userId: maliciousUserId, type: 'ALL' });

      assert.ok(capturedPipeline, 'Aggregate pipeline must be invoked');
      const matchStage = capturedPipeline[0].$match;
      // Even though malicious userId was sent, matchStage must strictly equal agent's own ID
      assert.equal(matchStage.assignedTo.toString(), agentId.toString());
      assert.notEqual(matchStage.assignedTo.toString(), maliciousUserId);
    });

    it('rejects MANAGER querying an unmanaged campaign with 403 Forbidden', async () => {
      const managerId = new Types.ObjectId();
      const unmanagedCampaignId = new Types.ObjectId().toString();
      const requester = { _id: managerId, role: 'MANAGER' };

      mock.method(Campaign, 'find', async () => [{ _id: new Types.ObjectId() }]);

      await assert.rejects(
        () => LeadService.getMyLeads(requester, { campaignId: unmanagedCampaignId }),
        (err) => err instanceof AppError && err.statusCode === 403 && err.message.includes('Forbidden')
      );
    });

    it('rejects invalid query.userId format with 400 Bad Request', async () => {
      const adminId = new Types.ObjectId();
      const requester = { _id: adminId, role: 'ADMIN' };

      await assert.rejects(
        () => LeadService.getMyLeads(requester, { userId: 'not-a-valid-objectid' }),
        (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes('Invalid user ID format')
      );
    });

    it('confirms aggregation pipeline projects assignedToId and populated assignedTo structure', async () => {
      const adminId = new Types.ObjectId();
      const requester = { _id: adminId, role: 'ADMIN' };

      let capturedPipeline = null;
      mock.method(Lead, 'aggregate', async (pipeline) => {
        capturedPipeline = pipeline;
        return [{ metadata: [{ total: 0 }], data: [] }];
      });

      await LeadService.getMyLeads(requester, { type: 'ALL' });

      const facetStage = capturedPipeline.find((s) => s.$facet);
      assert.ok(facetStage, '$facet stage must exist');
      const projectStage = facetStage.$facet.data.find((s) => s.$project).$project;

      // Validate exact response shape fields required by mobile / web
      assert.ok(projectStage.assignedTo, 'assignedTo field must be projected');
      assert.ok(projectStage.assignedToId, 'assignedToId field must be explicitly projected');
      assert.ok(projectStage.campaign, 'campaign field must be projected');
    });

    it('applies search filter in getMyLeads when search parameter is provided', async () => {
      const adminId = new Types.ObjectId();
      const requester = { _id: adminId, role: 'ADMIN' };

      let capturedPipeline = null;
      mock.method(Lead, 'aggregate', async (pipeline) => {
        capturedPipeline = pipeline;
        return [{ metadata: [{ total: 1 }], data: [{ _id: 'l1', phone: '8754272093' }] }];
      });

      const res = await LeadService.getMyLeads(requester, { search: '8754272093', type: 'ALL' });

      assert.equal(res.total, 1);
      assert.ok(capturedPipeline);
      const matchStage = capturedPipeline[0].$match;
      assert.ok(matchStage.$or, '$or search conditions must be present in matchStage');
      assert.ok(matchStage.$or.some((c) => c.phone instanceof RegExp));
    });

    it('returns atomic tab counts via getMyLeadsCounts using $facet', async () => {
      const agentId = new Types.ObjectId();
      const requester = { _id: agentId, role: 'AGENT' };

      let capturedPipeline = null;
      mock.method(Lead, 'aggregate', async (pipeline) => {
        capturedPipeline = pipeline;
        return [
          {
            all: [{ count: 100 }],
            new: [{ count: 80 }],
            followup: [{ count: 10 }],
            notConnected: [{ count: 5 }],
            interested: [{ count: 3 }],
            notInterested: [{ count: 2 }],
          },
        ];
      });

      const counts = await LeadService.getMyLeadsCounts(requester, { type: 'ALL' });

      assert.equal(counts.all, 100);
      assert.equal(counts.new, 80);
      assert.equal(counts.followup, 10);
      assert.equal(counts.notConnected, 5);
      assert.equal(counts.interested, 3);
      assert.equal(counts.notInterested, 2);
      assert.ok(capturedPipeline);
      assert.ok(capturedPipeline[1].$facet);
    });
  });
});
