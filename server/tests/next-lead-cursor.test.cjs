const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');

// Mock models and test LeadService.getNextLead
const { LeadService } = require('../dist/services/lead.service');
const { Lead } = require('../dist/models/lead.model');
const { Campaign } = require('../dist/models/campaign.model');

describe('Next Lead Cursor & Atomic Lease Lock Unit / Integration Tests', () => {
  const agentId = new Types.ObjectId();
  const mockAgent = {
    _id: agentId,
    email: 'agent@hitalk.in',
    role: 'AGENT',
    branch: 'Chennai',
  };

  it('strictly excludes closed and suppressed stages (CONVERTED, LOST, Not Interested)', async () => {
    let capturedFilter = null;

    mock.method(Lead, 'findOneAndUpdate', (filter) => {
      capturedFilter = filter;
      return {
        populate: () => ({
          populate: () => Promise.resolve(null),
        }),
      };
    });

    mock.method(Lead, 'countDocuments', () => Promise.resolve(0));

    const result = await LeadService.getNextLead(mockAgent, { mode: 'PRIORITY' });

    assert.equal(result.lead, null);
    assert.ok(capturedFilter);
    assert.deepEqual(capturedFilter.status, { $ne: 'CLOSED' });
    assert.ok(capturedFilter.stage.$nin.includes('CONVERTED'));
    assert.ok(capturedFilter.stage.$nin.includes('LOST'));
    assert.ok(capturedFilter.stage.$nin.includes('Not Interested'));

    mock.restoreAll();
  });

  it('atomically sets lockedAt and lockedBy during retrieval', async () => {
    const leadId = new Types.ObjectId();
    let capturedUpdate = null;

    mock.method(Lead, 'findOneAndUpdate', (_filter, update) => {
      capturedUpdate = update;
      return {
        populate: () => ({
          populate: () =>
            Promise.resolve({
              _id: leadId,
              name: 'John Prospect',
              phone: '9876543210',
              stage: 'New',
              status: 'OPEN',
            }),
        }),
      };
    });

    mock.method(Lead, 'countDocuments', () => Promise.resolve(1));

    const result = await LeadService.getNextLead(mockAgent, { mode: 'PRIORITY' });

    assert.ok(result.lead);
    assert.equal(result.lead.name, 'John Prospect');
    assert.ok(capturedUpdate.$set.lockedAt instanceof Date);
    assert.equal(capturedUpdate.$set.lockedBy.toString(), agentId.toString());

    mock.restoreAll();
  });

  it('safely releases lease lock on unlockLead', async () => {
    const leadId = new Types.ObjectId();
    let updateCalledWith = null;

    mock.method(Lead, 'updateOne', (filter, update) => {
      updateCalledWith = { filter, update };
      return Promise.resolve({ modifiedCount: 1 });
    });

    const res = await LeadService.unlockLead(mockAgent, leadId.toString());

    assert.equal(res, true);
    assert.ok(updateCalledWith);
    assert.equal(updateCalledWith.update.$set.lockedAt, null);
    assert.equal(updateCalledWith.update.$set.lockedBy, null);

    mock.restoreAll();
  });
});
