import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const createLeadSchema = z.object({
  body: z.object({
    name: z.string({ required_error: 'Name is required' }).min(1).trim(),
    phone: z.string({ required_error: 'Phone number is required' }).min(5).trim(),
    email: z.string().email('Invalid email address').trim().toLowerCase().optional().or(z.literal('')),
    customProperties: z.record(z.string(), z.string()).optional(),
  }),
});

export const listCampaignLeadsQuerySchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid campaign ID format'),
  }),
  query: z.object({
    stage: z.string().optional(),
    tag: z.string().optional(),
    status: z.enum(['OPEN', 'CLOSED']).optional(),
    assignedTo: z.string().optional(),
    search: z.string().optional(),
    startDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    endDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    page: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 1)),
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 5000)),
  }),
});

export const myLeadsQuerySchema = z.object({
  query: z.object({
    type: z.enum(['NEW', 'FOLLOW_UP', 'NOT_CONNECTED', 'ALL']).default('ALL'),
    campaignId: z.string().regex(objectIdRegex, 'Invalid campaign ID format').optional(),
    userId: z.string().regex(objectIdRegex, 'Invalid user ID format').optional(),
    search: z.string().optional(),
    page: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 1)),
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 5000)),
  }),
});

export const reassignLeadSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid lead ID format'),
  }),
  body: z.object({
    userId: z.string().regex(objectIdRegex, 'Invalid target user ID format'),
  }),
});

export const bulkReassignSchema = z.object({
  body: z.object({
    fromUserId: z.string().regex(objectIdRegex, 'Invalid fromUserId format'),
    toUserId: z.string().regex(objectIdRegex, 'Invalid toUserId format'),
    campaignId: z.string().regex(objectIdRegex, 'Invalid campaignId format').optional(),
  }),
});

export const updateLeadSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid lead ID format'),
  }),
  body: z.object({
    name: z.string().min(1).trim().optional(),
    phone: z.string().min(5).trim().optional(),
    email: z.string().email().trim().toLowerCase().optional().or(z.literal('')),
  }),
});

export const getNextLeadSchema = z.object({
  body: z.object({
    mode: z.enum(['PRIORITY', 'CAMPAIGN', 'MY_LEADS', 'FILTER']).default('PRIORITY'),
    campaignId: z.string().regex(objectIdRegex, 'Invalid campaign ID format').optional(),
    statusQueue: z.enum(['ALL', 'NEW', 'FOLLOW_UP', 'NOT_CONNECTED', 'INTERESTED']).optional(),
    stage: z.string().optional(),
    tag: z.string().optional(),
    excludeLeadIds: z.array(z.string().regex(objectIdRegex)).optional(),
    leaseSeconds: z.number().min(10).max(600).optional().default(120),
  }),
});

export const bulkUpdateSchema = z.object({
  body: z.object({
    leadIds: z.array(z.string().regex(objectIdRegex, 'Invalid lead ID format')).min(1, 'At least one lead ID required'),
    stage: z.string().trim().optional(),
    tag: z.string().trim().optional(),
    status: z.enum(['OPEN', 'CLOSED']).optional(),
  }),
});

export const bulkMoveSchema = z.object({
  body: z.object({
    leadIds: z.array(z.string().regex(objectIdRegex, 'Invalid lead ID format')).min(1, 'At least one lead ID required'),
    targetCampaignId: z.string().regex(objectIdRegex, 'Invalid target campaign ID format'),
  }),
});

export const bulkCopySchema = z.object({
  body: z.object({
    leadIds: z.array(z.string().regex(objectIdRegex, 'Invalid lead ID format')).min(1, 'At least one lead ID required'),
    targetCampaignId: z.string().regex(objectIdRegex, 'Invalid target campaign ID format'),
  }),
});

export const bulkCloseSchema = z.object({
  body: z.object({
    leadIds: z.array(z.string().regex(objectIdRegex, 'Invalid lead ID format')).min(1, 'At least one lead ID required'),
    reason: z.string().trim().optional(),
  }),
});

export const bulkDeleteSchema = z.object({
  body: z.object({
    leadIds: z.array(z.string().regex(objectIdRegex, 'Invalid lead ID format')).min(1, 'At least one lead ID required'),
    confirmation: z.literal('DELETE', {
      errorMap: () => ({ message: 'Confirmation text must be exactly "DELETE"' }),
    }),
  }),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>['body'];
export type ListCampaignLeadsQuery = z.infer<typeof listCampaignLeadsQuerySchema>['query'];
export type MyLeadsQuery = z.infer<typeof myLeadsQuerySchema>['query'];
export type ReassignLeadInput = z.infer<typeof reassignLeadSchema>['body'];
export type BulkReassignInput = z.infer<typeof bulkReassignSchema>['body'];
export type BulkUpdateInput = z.infer<typeof bulkUpdateSchema>['body'];
export type BulkMoveInput = z.infer<typeof bulkMoveSchema>['body'];
export type BulkCopyInput = z.infer<typeof bulkCopySchema>['body'];
export type BulkCloseInput = z.infer<typeof bulkCloseSchema>['body'];
export type BulkDeleteInput = z.infer<typeof bulkDeleteSchema>['body'];
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>['body'];
export type GetNextLeadInput = z.infer<typeof getNextLeadSchema>['body'];
