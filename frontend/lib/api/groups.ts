import { apiClient } from "@/lib/api/client";
import type { Paginated } from "@/types";

export interface Group {
  id: string;
  grade: string;
  academic_year: string;
  name: string;
  capacity: number | null;
}

export async function listGroups(params?: { grade?: string }) {
  const { data } = await apiClient.get<Paginated<Group>>("/groups/", { params });
  return data;
}

export interface GroupInput {
  grade: string;
  academic_year: string;
  name: string;
  capacity?: number;
}

export async function createGroup(input: GroupInput) {
  const { data } = await apiClient.post<Group>("/groups/", input);
  return data;
}
