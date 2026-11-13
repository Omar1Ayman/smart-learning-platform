import { apiClient } from "@/lib/api/client";
import type { GroupDetail, Paginated } from "@/types";

export interface Group {
  id: string;
  grade: string;
  academic_year: string;
  name: string;
  capacity: number | null;
    students_count: number;   
  teachers_count: number;   
}

export async function listGroups(params?: {
  grade?: string;
  academic_year?: string;
  page?: number;
  page_size?: number;
}) {
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

export async function updateGroup(id: string, input: Partial<GroupInput>) {
  const { data } = await apiClient.patch<Group>(`/groups/${id}/`, input);
  return data;
}

export async function deleteGroup(id: string) {
  await apiClient.delete(`/groups/${id}/`);
}

export async function getGroupDetail(id: string) {
  const { data } = await apiClient.get<GroupDetail>(`/groups/${id}/detail/`);
  return data;
}