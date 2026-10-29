const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');

const { TaskService } = require('../dist/services/task.service');
const { Task } = require('../dist/models/task.model');
const { Lead } = require('../dist/models/lead.model');
const { User } = require('../dist/models/user.model');

describe('Task Module Unit & Permission Tests (Spec 4.10)', () => {
  const agentId = new Types.ObjectId().toString();
  const managerId = new Types.ObjectId().toString();
  const leadId = new Types.ObjectId().toString();
  const branchId = new Types.ObjectId().toString();

  it('creates task successfully linked to lead with assignee and reporter', async () => {
    mock.method(Lead, 'findById', () => Promise.resolve({
      _id: leadId,
      name: 'Ramesh Kumar',
      phone: '9876543210',
    }));

    mock.method(User, 'findById', (id) => {
      if (id.toString() === agentId.toString()) {
        return Promise.resolve({
          _id: agentId,
          name: 'Agent Anand',
          role: 'AGENT',
          branch: branchId,
        });
      }
      return Promise.resolve(null);
    });

    let savedData = null;
    mock.method(Task.prototype, 'save', function () {
      savedData = this;
      return Promise.resolve(this);
    });

    const task = await TaskService.createTask(agentId, 'AGENT', branchId, {
      title: 'Send brochure and pricing sheet',
      description: 'Customer requested via WhatsApp',
      leadId: leadId,
      dueDate: new Date().toISOString(),
      priority: 'HIGH',
    });

    assert.ok(task);
    assert.equal(savedData.title, 'Send brochure and pricing sheet');
    assert.equal(savedData.leadName, 'Ramesh Kumar');
    assert.equal(savedData.assignedTo.toString(), agentId);
    assert.equal(savedData.reportedBy.toString(), agentId);
    assert.equal(savedData.priority, 'HIGH');
    assert.equal(savedData.status, 'PENDING');

    mock.restoreAll();
  });

  it('filters tasks by assignedTo and reportedBy correctly', async () => {
    let capturedQuery = null;
    mock.method(Task, 'find', (query) => {
      capturedQuery = query;
      return {
        sort: () => ({
          lean: () => Promise.resolve([
            { _id: new Types.ObjectId(), title: 'Task 1', status: 'PENDING' }
          ]),
        }),
      };
    });

    // Test assigned filter
    await TaskService.getTasks(agentId, 'assigned', 'PENDING');
    assert.equal(capturedQuery.assignedTo.toString(), agentId);
    assert.equal(capturedQuery.status, 'PENDING');

    // Test reported filter
    await TaskService.getTasks(managerId, 'reported');
    assert.equal(capturedQuery.reportedBy.toString(), managerId);
    assert.equal(capturedQuery.status, undefined);

    mock.restoreAll();
  });

  it('updates task status to COMPLETED and sets completedAt', async () => {
    const mockTask = {
      _id: new Types.ObjectId(),
      assignedTo: agentId,
      reportedBy: managerId,
      status: 'PENDING',
      completedAt: null,
      save: function () {
        return Promise.resolve(this);
      },
    };

    mock.method(Task, 'findById', () => Promise.resolve(mockTask));

    const updated = await TaskService.updateTaskStatus(
      mockTask._id.toString(),
      agentId,
      'AGENT',
      'COMPLETED'
    );

    assert.equal(updated.status, 'COMPLETED');
    assert.ok(updated.completedAt instanceof Date);

    mock.restoreAll();
  });
});
