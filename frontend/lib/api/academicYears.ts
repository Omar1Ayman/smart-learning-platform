import { apiClient } from "@/lib/api/client";
import type { AcademicYear, Paginated } from "@/types";

export async function listAcademicYears(params?: {
  page?: number;
  page_size?: number;
}) {
  const { data } = await apiClient.get<Paginated<AcademicYear>>(
    "/academic-years/",
    { params }
  );
  return data;
}

export interface AcademicYearInput {
  name: string;
  start_date: string;
  end_date: string;
  is_active?: boolean;
}

export async function createAcademicYear(input: AcademicYearInput) {
  const { data } = await apiClient.post<AcademicYear>(
    "/academic-years/",
    input
  );
  return data;
}

export async function updateAcademicYear(
  id: string,
  input: Partial<AcademicYearInput>
) {
  const { data } = await apiClient.patch<AcademicYear>(
    `/academic-years/${id}/`,
    input
  );
  return data;
}

export async function deleteAcademicYear(id: string) {
  await apiClient.delete(`/academic-years/${id}/`);
}