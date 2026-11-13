import { apiClient } from "@/lib/api/client";
import type { LessonDetail, Paginated } from "@/types";

export interface Lesson {
  id: string;
  chapter: string;
  name: string;
  order: number;
}

export async function listLessons(params?: {
  chapter?: string;
  page?: number;
}) {
  const { data } = await apiClient.get<Paginated<Lesson>>("/lessons/", {
    params,
  });
  return data;
}

export interface LessonInput {
  chapter: string;
  name: string;
  order?: number;
}

export async function createLesson(input: LessonInput) {
  const { data } = await apiClient.post<Lesson>("/lessons/", input);
  return data;
}

export async function updateLesson(id: string, input: Partial<LessonInput>) {
  const { data } = await apiClient.patch<Lesson>(`/lessons/${id}/`, input);
  return data;
}

export async function deleteLesson(id: string) {
  await apiClient.delete(`/lessons/${id}/`);
}

export async function getLessonDetail(id: string) {
  const { data } = await apiClient.get<LessonDetail>(`/lessons/${id}/detail/`);
  return data;
}