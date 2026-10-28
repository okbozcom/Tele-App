const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');

// Mirror updateSettingSchema
const updateSettingSchema = z.object({
  body: z
    .object({
      allowDisposeWithoutFollowUp: z.boolean().optional(),
      followUpMandatoryForNotConnected: z.boolean().optional(),
      autoLeadDistribution: z.boolean().optional(),
      reassignAfterHours: z.number().int().min(1, 'reassignAfterHours must be at least 1 hour').optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one setting field must be provided for update',
    }),
});

// Mirror createBranchSchema
const createBranchSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Branch name must be at least 2 characters'),
    code: z.string().trim().max(10).optional(),
    address: z.string().trim().max(255).optional(),
  }),
});

describe('Branch & Organization Settings Validation Unit Tests', () => {
  it('accepts valid setting updates with autoLeadDistribution', () => {
    const validPayload = {
      body: {
        allowDisposeWithoutFollowUp: true,
        followUpMandatoryForNotConnected: false,
        autoLeadDistribution: true,
        reassignAfterHours: 48,
      },
    };
    const result = updateSettingSchema.safeParse(validPayload);
    assert.equal(result.success, true);
    assert.equal(result.data.body.autoLeadDistribution, true);
  });

  it('accepts partial setting updates', () => {
    const partialPayload = {
      body: {
        autoLeadDistribution: false,
      },
    };
    const result = updateSettingSchema.safeParse(partialPayload);
    assert.equal(result.success, true);
    assert.equal(result.data.body.autoLeadDistribution, false);
  });

  it('rejects empty setting update object', () => {
    const emptyPayload = {
      body: {},
    };
    const result = updateSettingSchema.safeParse(emptyPayload);
    assert.equal(result.success, false);
  });

  it('validates branch creation name requirements', () => {
    const validBranch = {
      body: {
        name: 'Coimbatore',
        code: 'CBE',
        address: 'Gandhipuram, Coimbatore',
      },
    };
    assert.equal(createBranchSchema.safeParse(validBranch).success, true);

    const invalidShortName = {
      body: {
        name: 'A',
      },
    };
    assert.equal(createBranchSchema.safeParse(invalidShortName).success, false);
  });
});
