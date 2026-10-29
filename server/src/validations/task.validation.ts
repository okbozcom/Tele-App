import { z } from 'zod';

export const createTaskSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Title is required').max(200),
    description: z.string().max(1000).optional(),
    leadId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Lead ID'),
    assignedTo: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Assigned User ID').optional(),
    dueDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  }),
});

export const updateTaskStatusSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid Task ID'),
  }),
  body: z.object({
    status: z.enum(['PENDING', 'COMPLETED']),
  }),
});

export const getTasksSchema = z.object({
  query: z.object({
    filter: z.enum(['assigned', 'reported']).optional(),
    status: z.enum(['PENDING', 'COMPLETED']).optional(),
  }),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>['body'];
export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>['body'];
