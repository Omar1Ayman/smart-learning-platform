import { apiClient } from "@/lib/api/client";
import type { Paginated, Term } from "@/types";

export async function listTerms() {
  const { data } = await apiClient.get<Paginated<Term>>("/terms/");
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
