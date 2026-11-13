import { apiClient } from "@/lib/api/client";
import type { Paginated } from "@/types";

export interface Chapter {
  id: string;
  course: string;
  name: string;
  order: number;
}

export async function listChapters(params?: {
  course?: string;
  page?: number;
}) {
  const { data } = await apiClient.get<Paginated<Chapter>>("/chapters/", { params });
  return data;
}

export interface ChapterInput {
  course: string;
  name: string;
  order?: number;
}

export async function createChapter(input: ChapterInput) {
  const { data } = await apiClient.post<Chapter>("/chapters/", input);
  return data;
}

export async function updateChapter(id: string, input: Partial<ChapterInput>) {
  const { data } = await apiClient.patch<Chapter>(`/chapters/${id}/`, input);
  return data;
}

export async function deleteChapter(id: string) {
  await apiClient.delete(`/chapters/${id}/`);
}