import { apiClient } from "@/lib/api/client";
import type { Notification, Paginated } from "@/types";

export async function listNotifications(params?: {
  unreadOnly?: boolean;
  page?: number;
  /** Batch 12: filter by type. Comma-separated for multiple. */
  typeIn?: string;
}) {
  const { data } = await apiClient.get<Paginated<Notification>>(
    "/notifications/",
    {
      params: {
        ...(params?.unreadOnly ? { is_read: "false" } : {}),
        ...(params?.page ? { page: params.page } : {}),
        ...(params?.typeIn ? { type__in: params.typeIn } : {}),
      },
    }
  );
  return data;
}

export async function getUnreadCount() {
  const { data } = await apiClient.get<{ count: number }>(
    "/notifications/unread_count/"
  );
  return data.count;
}

export async function markNotificationRead(id: string) {
  const { data } = await apiClient.post<Notification>(
    `/notifications/${id}/read/`
  );
  return data;
}

/** Batch 12: undo an accidental mark-as-read. */
export async function markNotificationUnread(id: string) {
  const { data } = await apiClient.post<Notification>(
    `/notifications/${id}/mark_unread/`
  );
  return data;
}

export async function markAllNotificationsRead() {
  const { data } = await apiClient.post<{ marked_read: number }>(
    "/notifications/mark_all_read/"
  );
  return data;
}

/** Batch 12: bulk delete the caller's own notifications (max 100). */
export async function bulkDeleteNotifications(ids: string[]) {
  const { data } = await apiClient.post<{ deleted: number }>(
    "/notifications/bulk_delete/",
    { ids }
  );
  return data;
}