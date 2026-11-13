import { apiClient } from "@/lib/api/client";
import type { Paginated } from "@/types";

export interface TeacherAssignment {
  id: string;
  teacher: string;
  teacher_email: string;
  teacher_name: string;
  course: string;
  course_name: string;
  groups: string[];
  group_names: string[];
  created_at?: string;
  updated_at?: string;
}

export async function listTeacherAssignments(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  teacher?: string;
  course?: string;
  ordering?: string;
}) {
  const { data } = await apiClient.get<Paginated<TeacherAssignment>>(
    "/teacher-assignments/",
    { params }
  );
  return data;
}

export interface TeacherAssignmentInput {
  teacher: string;
  course: string;
  groups?: string[];
}

export async function createTeacherAssignment(input: TeacherAssignmentInput) {
  const { data } = await apiClient.post<TeacherAssignment>(
    "/teacher-assignments/",
    input
  );
  return data;
}

export async function updateTeacherAssignment(
  id: string,
  input: Partial<TeacherAssignmentInput>
) {
  const { data } = await apiClient.patch<TeacherAssignment>(
    `/teacher-assignments/${id}/`,
    input
  );
  return data;
}

export async function deleteTeacherAssignment(id: string) {
  await apiClient.delete(`/teacher-assignments/${id}/`);
}