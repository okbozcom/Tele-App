import { apiClient } from './client';

export interface AppNotification {
  _id: string;
  userId: string;
  title: string;
  message: string;
  type: 'FOLLOW_UP' | 'LEAD_TAGGED' | 'BREAK_EXCEEDED' | 'ASSIGNMENT' | 'SYSTEM';
  leadId?: {
    _id: string;
    name: string;
    phone: string;
    stage?: string;
    tag?: string;
  } | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  status: string;
  notifications: AppNotification[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
}

export const fetchUserNotifications = async (params?: {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}): Promise<NotificationsResponse> => {
  const response = await apiClient.get<NotificationsResponse>('/api/notifications', {
    params,
  });
  return response.data;
};

export const fetchUnreadNotificationsCount = async (): Promise<number> => {
  const response = await apiClient.get<{ status: string; unreadCount: number }>(
    '/api/notifications/unread-count',
  );
  return response.data.unreadCount;
};

export const markNotificationAsRead = async (
  id: string,
): Promise<{ status: string; notification: AppNotification }> => {
  const response = await apiClient.patch<{ status: string; notification: AppNotification }>(
    `/api/notifications/${id}/read`,
  );
  return response.data;
};

export const markAllNotificationsAsRead = async (): Promise<{
  status: string;
  modifiedCount: number;
}> => {
  const response = await apiClient.patch<{ status: string; modifiedCount: number }>(
    '/api/notifications/read-all',
  );
  return response.data;
};
