import { apiClient } from "@/lib/api/client";
import type { Paginated } from "@/types";

export interface Subject {
  id: string;
  name: string;
  code: string;
  courses_count: number;
}

export async function listSubjects(params?: { page?: number }) {
  const { data } = await apiClient.get<Paginated<Subject>>("/subjects/", { params });
  return data;
}

export interface SubjectInput {
  name: string;
  code?: string;
}

export async function createSubject(input: SubjectInput) {
  const { data } = await apiClient.post<Subject>("/subjects/", input);
  return data;
}

export async function updateSubject(id: string, input: Partial<SubjectInput>) {
  const { data } = await apiClient.patch<Subject>(`/subjects/${id}/`, input);
  return data;
}

export async function deleteSubject(id: string) {
  await apiClient.delete(`/subjects/${id}/`);
}