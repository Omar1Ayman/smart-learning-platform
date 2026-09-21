import { apiClient } from "@/lib/api/client";
import type { Paginated } from "@/types";

export interface Grade {
  id: string;
  stage: string;
  name: string;
  order: number;
}

export async function listGrades() {
  const { data } = await apiClient.get<Paginated<Grade>>("/grades/");
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
