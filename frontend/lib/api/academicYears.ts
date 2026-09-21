import { apiClient } from "@/lib/api/client";
import type { AcademicYear, Paginated } from "@/types";

export async function listAcademicYears() {
  const { data } = await apiClient.get<Paginated<AcademicYear>>("/academic-years/");
  return data;
}

export interface AcademicYearInput {
  name: string;
  start_date: string;
  end_date: string;
  is_active?: boolean;
}

export async function createAcademicYear(input: AcademicYearInput) {
  const { data } = await apiClient.post<AcademicYear>("/academic-years/", input);
  return data;
}
