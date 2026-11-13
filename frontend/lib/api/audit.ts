import { apiClient } from "@/lib/api/client";
import type { AuditLogEntry, Paginated } from "@/types";

export interface AuditFilters {
  action?: string;
  actor?: string;
  object_type?: string;
  from?: string;
  to?: string;
  page?: number;
}

export async function listAuditLogs(filters: AuditFilters = {}) {
  const { data } = await apiClient.get<Paginated<AuditLogEntry>>("/audit-logs/", {
    params: filters,
  });
  return data;
}