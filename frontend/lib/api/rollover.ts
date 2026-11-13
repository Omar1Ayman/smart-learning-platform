import { apiClient } from "@/lib/api/client";
import type {
  AcademicYear,
  ClosePreflight,
  PrepareNextYearInput,
  PrepareNextYearResponse,
  PromoteStudentsInput,
  PromoteStudentsResponse,
} from "@/types";

/**
 * Phase 1.10-1.12 — Rollover Wizard API.
 *
 * All endpoints are POST (except preflight) and require OWNER/ADMIN
 * permissions (enforced server-side by IsAdminForWriteActions).
 */

export async function getClosePreflight(yearId: string) {
  const { data } = await apiClient.get<ClosePreflight>(
    `/academic-years/${yearId}/close-preflight/`
  );
  return data;
}

export async function prepareNextYear(
  yearId: string,
  input: PrepareNextYearInput
) {
  const { data } = await apiClient.post<PrepareNextYearResponse>(
    `/academic-years/${yearId}/prepare-next/`,
    input
  );
  return data;
}

export async function promoteStudents(
  yearId: string,
  input: PromoteStudentsInput
) {
  const { data } = await apiClient.post<PromoteStudentsResponse>(
    `/academic-years/${yearId}/promote-students/`,
    input
  );
  return data;
}

export async function archiveYear(yearId: string) {
  const { data } = await apiClient.post<AcademicYear>(
    `/academic-years/${yearId}/archive/`
  );
  return data;
}

export async function activateYear(yearId: string) {
  const { data } = await apiClient.post<AcademicYear>(
    `/academic-years/${yearId}/activate/`
  );
  return data;
}