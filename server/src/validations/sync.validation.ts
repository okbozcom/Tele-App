import { z } from 'zod';
import { NotConnectedReasons } from '../models/activity.model';

export const batchSyncItemSchema = z.object({
  clientEventId: z.string().min(1, 'clientEventId is required'),
  leadId: z.string().min(1, 'leadId is required'),
  phone: z.string().optional().nullable(),
  direction: z.enum(['OUTGOING', 'INCOMING']).default('OUTGOING'),
  connected: z.boolean(),
  notConnectedReason: z.enum(NotConnectedReasons).optional().nullable(),
  stage: z.string().trim().default('New'),
  tag: z.string().trim().optional().nullable(),
  remark: z.string().trim().optional().nullable(),
  followUpAt: z.string().optional().nullable(),
  durationSeconds: z.number().int().min(0).default(0),
  callLogId: z.string().trim().optional().nullable(),
  classificationReason: z.string().trim().optional().nullable(),
  durationSource: z.enum(['DEVICE_CALL_LOG', 'APP_ESTIMATE']).default('APP_ESTIMATE').optional(),
  dispositionMismatch: z.boolean().default(false).optional(),
  noAttempt: z.boolean().default(false).optional(),
  clientTimestamp: z.string().optional().nullable(),
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        value: z.unknown(),
      }),
    )
    .default([]),
});

export const batchSyncSchema = z.object({
  body: z.object({
    events: z.array(batchSyncItemSchema).min(1, 'At least one event is required').max(50, 'Max 50 events per batch'),
  }),
});

export type BatchSyncItemInput = z.infer<typeof batchSyncItemSchema>;
export type BatchSyncInput = z.infer<typeof batchSyncSchema>['body'];
