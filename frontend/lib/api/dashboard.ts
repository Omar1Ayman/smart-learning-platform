import { apiClient } from "@/lib/api/client";
import type { AdminDashboard, StudentDashboard, TeacherDashboard } from "@/types";

/**
 * Wave D0c-3a — dashboard endpoints accept `days` (7/14/30/90).
 * Backend normalizes invalid values to the per-view default.
 */
export type DashboardRange = 7 | 14 | 30 | 90;

export async function getAdminDashboard(days: DashboardRange = 7) {
  const { data } = await apiClient.get<AdminDashboard>("/dashboard/admin/", {
    params: { days },
  });
  return data;
}

export async function getTeacherDashboard(days: DashboardRange = 30) {
  const { data } = await apiClient.get<TeacherDashboard>("/dashboard/teacher/", {
    params: { days },
  });
  return data;
}

export async function getStudentDashboard(days: DashboardRange = 30) {
  const { data } = await apiClient.get<StudentDashboard>("/dashboard/student/", {
    params: { days },
  });
  return data;
}
import type { AdminReports } from "@/types";

/**
 * Batch 18: tenant-wide operational reports (OWNER/ADMIN only).
 * Returns aggregated attendance, exam, and teacher-activity data
 * over the given range.
 */
export async function getAdminReports(days: DashboardRange = 7) {
  const { data } = await apiClient.get<AdminReports>("/dashboard/reports/", {
    params: { days },
  });
  return data;
}