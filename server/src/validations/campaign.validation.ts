import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const questionTypeEnum = z.enum([
  'TEXT',
  'SHORT_ANSWER',
  'NUMBER',
  'LONG_ANSWER',
  'DATE',
  'TIME',
  'MULTIPLE_CHOICE',
  'CHECKBOX',
  'DROPDOWN',
]);

const engagementQuestionInputSchema = z.object({
  id: z.string({ required_error: 'Question ID is required' }).min(1).trim(),
  type: questionTypeEnum,
  label: z.string({ required_error: 'Question label is required' }).min(1).trim(),
  options: z.array(z.string().trim()).default([]),
  required: z.boolean().default(false),
});

const conditionalRuleInputSchema = z.object({
  field: z.string({ required_error: 'Rule field is required' }).min(1).trim(),
  value: z.string({ required_error: 'Rule value is required' }).min(1).trim(),
  agentIds: z
    .array(z.string().regex(objectIdRegex, 'Invalid agent ID format'))
    .min(1, 'Rule must assign at least one agent'),
});

export const createCampaignSchema = z.object({
  body: z
    .object({
      name: z
        .string({ required_error: 'Campaign name is required' })
        .min(1, 'Campaign name cannot be empty')
        .trim(),
      pipelineId: z.string().regex(objectIdRegex, 'Invalid pipeline ID format'),
      managerId: z.string().regex(objectIdRegex, 'Invalid manager ID format').optional(),
      branch: z.string().trim().optional().nullable(),
      agentIds: z
        .array(z.string().regex(objectIdRegex, 'Invalid agent ID format'))
        .default([]),
      distributionMode: z.enum(['EQUAL', 'CONDITIONAL']).default('EQUAL'),
      conditionalRules: z.array(conditionalRuleInputSchema).default([]),
      fallbackAgentId: z
        .string()
        .regex(objectIdRegex, 'Invalid fallback agent ID format')
        .optional()
        .nullable(),
      priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
      duplicateMode: z.enum(['SKIP', 'MERGE', 'CREATE_NEW']).default('SKIP'),
      engagementForm: z.array(engagementQuestionInputSchema).default([]),
      isActive: z.boolean().default(true),
    })
    .superRefine((data, ctx) => {
      if (data.distributionMode === 'CONDITIONAL') {
        if (!data.conditionalRules || data.conditionalRules.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'conditionalRules are required when distributionMode is CONDITIONAL',
            path: ['conditionalRules'],
          });
        }
        if (!data.fallbackAgentId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'fallbackAgentId is required when distributionMode is CONDITIONAL',
            path: ['fallbackAgentId'],
          });
        }
      }
    }),
});

export const updateCampaignSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid campaign ID format'),
  }),
  body: z
    .object({
      name: z.string().min(1, 'Campaign name cannot be empty').trim().optional(),
      pipelineId: z.string().regex(objectIdRegex, 'Invalid pipeline ID format').optional(),
      managerId: z.string().regex(objectIdRegex, 'Invalid manager ID format').optional(),
      branch: z.string().trim().optional().nullable(),
      agentIds: z.array(z.string().regex(objectIdRegex, 'Invalid agent ID format')).optional(),
      distributionMode: z.enum(['EQUAL', 'CONDITIONAL']).optional(),
      conditionalRules: z.array(conditionalRuleInputSchema).optional(),
      fallbackAgentId: z
        .string()
        .regex(objectIdRegex, 'Invalid fallback agent ID format')
        .optional()
        .nullable(),
      priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
      duplicateMode: z.enum(['SKIP', 'MERGE', 'CREATE_NEW']).optional(),
      engagementForm: z.array(engagementQuestionInputSchema).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update',
    })
    .superRefine((data, ctx) => {
      if (data.distributionMode === 'CONDITIONAL') {
        if (data.conditionalRules && data.conditionalRules.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'conditionalRules cannot be empty when distributionMode is CONDITIONAL',
            path: ['conditionalRules'],
          });
        }
      }
    }),
});

export const copyCampaignSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid campaign ID format'),
  }),
  body: z
    .object({
      name: z.string().min(1).trim().optional(),
    })
    .optional(),
});

export const campaignIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid campaign ID format'),
  }),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>['body'];
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>['body'];
export type CopyCampaignInput = z.infer<typeof copyCampaignSchema>['body'];
