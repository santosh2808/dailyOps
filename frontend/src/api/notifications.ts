import api from "@/lib/api";
import type { AppNotification, NotificationSummary } from "@/types";

// In-app notifications — always the logged-in user's own (the backend scopes
// every route to them).

export async function getNotificationSummary() {
  const res = await api.get<NotificationSummary>("/api/v1/notifications/summary");
  return res.data;
}

export async function listNotifications(limit = 20) {
  const res = await api.get<{ items: AppNotification[]; unreadCount: number }>("/api/v1/notifications", {
    params: { limit },
  });
  return res.data;
}

export async function markNotificationRead(id: string) {
  const res = await api.patch<{ unreadCount: number }>(`/api/v1/notifications/${id}/read`);
  return res.data;
}

export async function markAllNotificationsRead() {
  const res = await api.post<{ unreadCount: number }>("/api/v1/notifications/read-all");
  return res.data;
}
