const { describe, it, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');

const { LeadService } = require('../dist/services/lead.service');
const { SettingService } = require('../dist/services/setting.service');
const { Lead } = require('../dist/models/lead.model');
const { Setting } = require('../dist/models/setting.model');
const { Campaign } = require('../dist/models/campaign.model');

describe('Admin Lead Priority Order & Cursor Retrieval Tests (NeoDove Spec 4.2)', () => {
  const agentId = new Types.ObjectId();
  const mockAgent = {
    _id: agentId,
    email: 'agent@hitalk.in',
    role: 'AGENT',
    branch: 'Chennai',
  };

  afterEach(() => {
    mock.restoreAll();
  });

  it('updates leadPriorityOrder via SettingService.updateSettings', async () => {
    const customOrder = ['NEW_UNCONTACTED', 'TODAY_FOLLOWUPS', 'OVERDUE_FOLLOWUPS'];
    const fakeDoc = {
      leadPriorityOrder: ['OVERDUE_FOLLOWUPS'],
      save: mock.fn(async () => fakeDoc),
    };

    mock.method(Setting, 'findOne', async () => fakeDoc);

    const updated = await SettingService.updateSettings({
      leadPriorityOrder: customOrder,
    });

    assert.deepEqual(updated.leadPriorityOrder, customOrder);
    assert.equal(fakeDoc.save.mock.callCount(), 1);
  });

  it('evaluates priority passes according to custom leadPriorityOrder', async () => {
    const customOrder = ['NEW_UNCONTACTED', 'OVERDUE_FOLLOWUPS'];
    
    mock.method(SettingService, 'getSettings', async () => ({
      leadPriorityOrder: customOrder,
      maskContactNumber: false,
    }));

    const capturedFilters = [];
    const newLeadId = new Types.ObjectId();

    mock.method(Lead, 'findOneAndUpdate', (filter) => {
      capturedFilters.push(filter);
      // If it's searching for NEW_UNCONTACTED (attemptCount === 0)
      if (filter.attemptCount === 0 && filter.lastContactedAt === null) {
        return {
          populate: () => ({
            populate: () => Promise.resolve({
              _id: newLeadId,
              name: 'Fresh Lead',
              phone: '9876543210',
              attemptCount: 0,
            }),
          }),
        };
      }
      return {
        populate: () => ({
          populate: () => Promise.resolve(null),
        }),
      };
    });

    mock.method(Lead, 'countDocuments', async () => 5);

    const result = await LeadService.getNextLead(mockAgent, { mode: 'PRIORITY' });

    assert.ok(result.lead);
    assert.equal(result.lead.name, 'Fresh Lead');
    // First query checked should have been NEW_UNCONTACTED
    assert.equal(capturedFilters[0].attemptCount, 0);
    assert.equal(capturedFilters[0].lastContactedAt, null);
  });

  it('falls back to default priority order when leadPriorityOrder is empty', async () => {
    mock.method(SettingService, 'getSettings', async () => ({
      leadPriorityOrder: [],
      maskContactNumber: false,
    }));

    const capturedFilters = [];
    mock.method(Lead, 'findOneAndUpdate', (filter) => {
      capturedFilters.push(filter);
      return {
        populate: () => ({
          populate: () => Promise.resolve(null),
        }),
      };
    });

    mock.method(Lead, 'countDocuments', async () => 0);

    const result = await LeadService.getNextLead(mockAgent, { mode: 'PRIORITY' });

    assert.equal(result.lead, null);
    // Should have checked OVERDUE_FOLLOWUPS first in default list
    assert.ok(capturedFilters.length > 0);
    assert.ok(capturedFilters[0].nextFollowUpAt);
  });

  it('falls back to general query when priority passes find no match', async () => {
    mock.method(SettingService, 'getSettings', async () => ({
      leadPriorityOrder: ['OVERDUE_FOLLOWUPS'],
      maskContactNumber: false,
    }));

    let callCount = 0;
    const fallbackId = new Types.ObjectId();

    mock.method(Lead, 'findOneAndUpdate', () => {
      callCount++;
      // Return null on first passes, match on general fallback
      if (callCount >= 2) {
        return {
          populate: () => ({
            populate: () => Promise.resolve({
              _id: fallbackId,
              name: 'General Lead',
              phone: '9123456789',
            }),
          }),
        };
      }
      return {
        populate: () => ({
          populate: () => Promise.resolve(null),
        }),
      };
    });

    mock.method(Lead, 'countDocuments', async () => 1);

    const result = await LeadService.getNextLead(mockAgent, { mode: 'PRIORITY' });

    assert.ok(result.lead);
    assert.equal(result.lead.name, 'General Lead');
    assert.ok(callCount >= 2);
  });
});
