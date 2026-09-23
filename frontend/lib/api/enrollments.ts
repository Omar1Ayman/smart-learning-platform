import { apiClient } from "@/lib/api/client";
import type { Paginated } from "@/types";

export type EnrollmentStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED" | "TRANSFERRED" | "GRADUATED" | "ARCHIVED";

export interface Enrollment {
  id: string;
  student: string;
  group: string;
  academic_year: string;
  status: EnrollmentStatus;
  enrolled_at: string;
}

export async function listEnrollments() {
  const { data } = await apiClient.get<Paginated<Enrollment>>("/enrollments/");
  return data;
}

export interface EnrollmentInput {
  student: string;
  group: string;
}

export async function createEnrollment(input: EnrollmentInput) {
  const { data } = await apiClient.post<Enrollment>("/enrollments/", input);
  return data;
}
