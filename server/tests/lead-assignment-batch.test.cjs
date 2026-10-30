const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');

const {
  LeadAssignmentService,
  AssignmentContext,
} = require('../dist/services/lead-assignment.service');
const { Lead } = require('../dist/models/lead.model');

describe('Lead Assignment & Distribution Batch Tests (Spec 4.6)', () => {
  const campaignId = new Types.ObjectId();
  const agent1Id = new Types.ObjectId();
  const agent2Id = new Types.ObjectId();

  const mockAgent1 = {
    _id: agent1Id,
    name: 'Agent One',
    role: 'AGENT',
    isActive: true,
    canReceiveLeads: true,
  };

  const mockAgent2 = {
    _id: agent2Id,
    name: 'Agent Two',
    role: 'AGENT',
    isActive: true,
    canReceiveLeads: true,
  };

  it('AssignmentContext pre-caches counts and balances candidates in-memory without extra DB queries', async () => {
    let aggregateCalls = 0;

    mock.method(Lead, 'aggregate', () => {
      aggregateCalls++;
      return Promise.resolve([
        { _id: agent1Id, count: 5 },
        { _id: agent2Id, count: 2 },
      ]);
    });

    const ctx = new AssignmentContext();
    await ctx.init(campaignId, [agent1Id, agent2Id]);

    // Initial aggregate should have been called once
    assert.equal(aggregateCalls, 1);

    // Agent 2 has lower count (2 < 5), so Agent 2 should be picked first
    const firstPick = ctx.pickBalanced([mockAgent1, mockAgent2]);
    assert.equal(firstPick.toString(), agent2Id.toString());

    // Agent 2 count is now 3. Next pick should still be Agent 2 (3 < 5)
    const secondPick = ctx.pickBalanced([mockAgent1, mockAgent2]);
    assert.equal(secondPick.toString(), agent2Id.toString());

    // Agent 2 count is now 4. Next pick is still Agent 2 (4 < 5)
    const thirdPick = ctx.pickBalanced([mockAgent1, mockAgent2]);
    assert.equal(thirdPick.toString(), agent2Id.toString());

    // Agent 2 count is now 5. Next pick: tied at 5, order preserved or equal
    const fourthPick = ctx.pickBalanced([mockAgent1, mockAgent2]);
    assert.ok(fourthPick);

    // ZERO additional aggregate calls were made during picks
    assert.equal(aggregateCalls, 1);

    mock.restoreAll();
  });

  it('AI / PULL distribution mode leaves leads unassigned in bucket', async () => {
    const aiCampaign = {
      _id: campaignId,
      name: 'Inbound Bucket',
      distributionMode: 'AI',
      agentIds: [agent1Id, agent2Id],
    };

    const assigned = await LeadAssignmentService.assignLead(aiCampaign, {});
    assert.equal(assigned, null);

    const pullCampaign = {
      _id: campaignId,
      name: 'Inbound Bucket 2',
      distributionMode: 'PULL',
      agentIds: [agent1Id, agent2Id],
    };

    const pullAssigned = await LeadAssignmentService.assignLead(pullCampaign, {});
    assert.equal(pullAssigned, null);
  });
});
