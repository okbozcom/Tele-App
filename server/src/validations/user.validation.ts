import { z } from 'zod';

export const createUserSchema = z.object({
  body: z.object({
    name: z.string({ required_error: 'Name is required' }).min(1, 'Name cannot be empty').trim(),
    email: z
      .string({ required_error: 'Email is required' })
      .email('Invalid email address')
      .trim()
      .toLowerCase(),
    phone: z.string({ required_error: 'Phone is required' }).min(5, 'Invalid phone number').trim(),
    password: z
      .string({ required_error: 'Password is required' })
      .min(6, 'Password must be at least 6 characters long'),
    role: z.enum(['ADMIN', 'MANAGER', 'AGENT'], {
      required_error: 'Role must be ADMIN, MANAGER, or AGENT',
    }),
    branch: z.string().trim().optional().nullable(),
    managerId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid manager ID format')
      .optional()
      .nullable(),
    isActive: z.boolean().optional(),
    canReceiveLeads: z.boolean().optional(),
  }),
});

export const updateUserSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID format'),
  }),
  body: z
    .object({
      name: z.string().min(1, 'Name cannot be empty').trim().optional(),
      phone: z.string().min(5, 'Invalid phone number').trim().optional(),
      role: z.enum(['ADMIN', 'MANAGER', 'AGENT']).optional(),
      branch: z.string().trim().optional().nullable(),
      isActive: z.boolean().optional(),
      canReceiveLeads: z.boolean().optional(),
      managerId: z
        .string()
        .regex(/^[0-9a-fA-F]{24}$/, 'Invalid manager ID format')
        .optional()
        .nullable(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update',
    }),
});

export const resetPasswordSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID format'),
  }),
  body: z
    .object({
      password: z.string().min(6, 'Password must be at least 6 characters long').optional(),
      newPassword: z.string().min(6, 'New password must be at least 6 characters long').optional(),
    })
    .refine((data) => Boolean(data.password || data.newPassword), {
      message: 'Either password or newPassword must be provided',
    }),
});

export const userIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID format'),
  }),
});

export const bulkCreateUsersSchema = z.object({
  body: z
    .array(
      z.object({
        name: z.string({ required_error: 'Name is required' }).min(1).trim(),
        email: z
          .string({ required_error: 'Email is required' })
          .email('Invalid email address')
          .trim()
          .toLowerCase(),
        phone: z.string({ required_error: 'Phone is required' }).min(5).trim(),
        password: z
          .string({ required_error: 'Password is required' })
          .min(6, 'Password must be at least 6 characters long'),
        role: z.enum(['ADMIN', 'MANAGER', 'AGENT'], {
          required_error: 'Role must be ADMIN, MANAGER, or AGENT',
        }),
        branch: z.string().trim().optional().nullable(),
        managerId: z
          .string()
          .regex(/^[0-9a-fA-F]{24}$/, 'Invalid manager ID format')
          .optional()
          .nullable(),
        isActive: z.boolean().optional(),
        canReceiveLeads: z.boolean().optional(),
      }),
    )
    .min(1, 'At least one user must be provided in bulk creation'),
});

export const listUsersQuerySchema = z.object({
  query: z.object({
    role: z.enum(['ADMIN', 'MANAGER', 'AGENT']).optional(),
    branch: z.string().trim().optional(),
    isActive: z
      .enum(['true', 'false'])
      .optional()
      .transform((val) => (val === undefined ? undefined : val === 'true')),
  }),
});

export type CreateUserInput = z.infer<typeof createUserSchema>['body'];
export type UpdateUserInput = z.infer<typeof updateUserSchema>['body'];
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>['body'];
export type BulkCreateUsersInput = z.infer<typeof bulkCreateUsersSchema>['body'];
export type ListUsersQueryInput = z.infer<typeof listUsersQuerySchema>['query'];
