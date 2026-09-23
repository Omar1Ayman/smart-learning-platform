import { apiClient } from "@/lib/api/client";
import type { Paginated } from "@/types";

export interface TeacherAssignment {
  id: string;
  teacher: string;
  course: string;
  groups: string[];
}

export async function listTeacherAssignments() {
  const { data } = await apiClient.get<Paginated<TeacherAssignment>>("/teacher-assignments/");
  return data;
}

export interface TeacherAssignmentInput {
  teacher: string;
  course: string;
  groups?: string[];
}

export async function createTeacherAssignment(input: TeacherAssignmentInput) {
  const { data } = await apiClient.post<TeacherAssignment>("/teacher-assignments/", input);
  return data;
}
