import { z } from 'zod';

export const updateSettingSchema = z.object({
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

export type UpdateSettingInput = z.infer<typeof updateSettingSchema>['body'];
