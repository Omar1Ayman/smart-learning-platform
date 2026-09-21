import { apiClient } from "@/lib/api/client";
import type { Paginated } from "@/types";

export interface Subject {
  id: string;
  name: string;
  code: string;
}

export async function listSubjects() {
  const { data } = await apiClient.get<Paginated<Subject>>("/subjects/");
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
