import { apiClient } from "@/lib/api/client";
import type {
  Enrollment,
  EnrollmentStatus,
  Paginated,
  PromotionRequest,
  PromotionResponse,
} from "@/types";

export type { EnrollmentStatus };

export async function listEnrollments(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  academic_year?: string;
  group?: string;
  grade?: string;
  term?: string;
  status?: EnrollmentStatus;
  ordering?: string;
}) {
  const { grade, ...rest } = params ?? {};
  const { data } = await apiClient.get<Paginated<Enrollment>>("/enrollments/", {
    params: {
      ...rest,
      // backend filter is `group__grade`, map frontend `grade` to it
      ...(grade ? { group__grade: grade } : {}),
    },
  });
  return data;
}

export interface EnrollmentInput {
  student: string;
  group: string;
  term?: string | null;
  status?: EnrollmentStatus;
}

export async function createEnrollment(input: EnrollmentInput) {
  const payload = { ...input, term: input.term || null };
  const { data } = await apiClient.post<Enrollment>("/enrollments/", payload);
  return data;
}

export async function updateEnrollment(
  id: string,
  input: Partial<EnrollmentInput>
) {
  const payload: Record<string, unknown> = { ...input };
  if ("term" in input) payload.term = input.term || null;
  const { data } = await apiClient.patch<Enrollment>(
    `/enrollments/${id}/`,
    payload
  );
  return data;
}

export async function deleteEnrollment(id: string) {
  await apiClient.delete(`/enrollments/${id}/`);
}

export async function promoteEnrollments(payload: PromotionRequest) {
  const { data } = await apiClient.post<PromotionResponse>(
    "/enrollments/promote/",
    payload
  );
  return data;
}

/**
 * Phase 1.14-1.15 — Move a student from their current term enrollment
 * to a new term. Same grade, different group.
 */
export async function transitionTerm(
  enrollmentId: string,
  input: { target_term: string; target_group: string }
) {
  const { data } = await apiClient.post<Enrollment>(
    `/enrollments/${enrollmentId}/transition-term/`,
    input
  );
  return data;
}