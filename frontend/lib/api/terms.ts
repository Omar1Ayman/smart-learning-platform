import { apiClient } from "@/lib/api/client";
import type { Paginated, Term } from "@/types";

export async function listTerms(params?: {
  academic_year?: string;
  page?: number;
}) {
  const { data } = await apiClient.get<Paginated<Term>>("/terms/", { params });
  return data;
}

export interface TermInput {
  academic_year: string;
  name: string;
  start_date: string;
  end_date: string;
  order: number;
}

export async function createTerm(input: TermInput) {
  const { data } = await apiClient.post<Term>("/terms/", input);
  return data;
}

export async function updateTerm(id: string, input: Partial<TermInput>) {
  const { data } = await apiClient.patch<Term>(`/terms/${id}/`, input);
  return data;
}

export async function deleteTerm(id: string) {
  await apiClient.delete(`/terms/${id}/`);
}