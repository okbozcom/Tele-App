import { z } from 'zod';

export const updateSettingSchema = z.object({
  body: z
    .object({
      allowDisposeWithoutFollowUp: z.boolean().optional(),
      followUpMandatoryForNotConnected: z.boolean().optional(),
      autoLeadDistribution: z.boolean().optional(),
      reassignAfterHours: z.number().int().min(1, 'reassignAfterHours must be at least 1 hour').optional(),
      breakNotificationThresholdMinutes: z.number().int().min(1).max(120).optional(),
      enableAutoCallDialing: z.boolean().optional(),
      autoCallDialingDelaySeconds: z.number().int().min(1).max(30).optional(),
      maskContactNumber: z.boolean().optional(),
      displayStartCallingButton: z.boolean().optional(),
      allowCallRecordingPlayback: z.boolean().optional(),
      preferredSimSlot: z.number().int().min(0).max(1).nullable().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one setting field must be provided for update',
    }),
});

export type UpdateSettingInput = z.infer<typeof updateSettingSchema>['body'];
