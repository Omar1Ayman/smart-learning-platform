import { apiClient } from "@/lib/api/client";
import type { GradeDetail, Paginated } from "@/types";

export interface Grade {
  id: string;
  stage: string;
  name: string;
  order: number;
}

export async function listGrades(params?: {
  page?: number;
  page_size?: number;
}) {
  const { data } = await apiClient.get<Paginated<Grade>>("/grades/", { params });
  return data;
}

export interface GradeInput {
  stage: string;
  name: string;
  order?: number;
}

export async function createGrade(input: GradeInput) {
  const { data } = await apiClient.post<Grade>("/grades/", input);
  return data;
}

export async function updateGrade(id: string, input: Partial<GradeInput>) {
  const { data } = await apiClient.patch<Grade>(`/grades/${id}/`, input);
  return data;
}

export async function deleteGrade(id: string) {
  await apiClient.delete(`/grades/${id}/`);
}

export async function getGradeDetail(id: string) {
  const { data } = await apiClient.get<GradeDetail>(`/grades/${id}/detail/`);
  return data;
}