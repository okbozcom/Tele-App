import { apiClient } from './client';
import { Task } from '../types';

export interface CreateTaskPayload {
  title: string;
  description?: string;
  leadId: string;
  assignedTo?: string;
  dueDate: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export const fetchTasks = async (
  filter: 'assigned' | 'reported' = 'assigned',
  status?: 'PENDING' | 'COMPLETED'
): Promise<Task[]> => {
  const params: any = { filter };
  if (status) params.status = status;
  const res = await apiClient.get<{ success: boolean; tasks: Task[] }>('/api/tasks', { params });
  return res.data.tasks || [];
};

export const createTask = async (payload: CreateTaskPayload): Promise<Task> => {
  const res = await apiClient.post<{ success: boolean; task: Task }>('/api/tasks', payload);
  return res.data.task;
};

export const updateTaskStatus = async (
  taskId: string,
  status: 'PENDING' | 'COMPLETED'
): Promise<Task> => {
  const res = await apiClient.patch<{ success: boolean; task: Task }>(
    `/api/tasks/${taskId}/status`,
    { status }
  );
  return res.data.task;
};
