import { apiClient } from "@/lib/api/client";
import type { Course, CourseDetail, Paginated } from "@/types";

export async function listCourses(params?: {
  grade?: string;
  subject?: string;
  academic_year?: string;
  term?: string;
  is_active?: boolean;
  page?: number;
}) {
  const { data } = await apiClient.get<Paginated<Course>>("/courses/", { params });
  return data;
}

export interface CourseInput {
  subject: string;
  grade: string;
  name: string;
  description?: string;
  academic_year: string;
  term?: string | null;
}

function normalizePayload(input: Partial<CourseInput>) {
  return {
    ...input,
    ...(input.term !== undefined ? { term: input.term || null } : {}),
  };
}

export async function createCourse(input: CourseInput) {
  const { data } = await apiClient.post<Course>(
    "/courses/",
    normalizePayload(input)
  );
  return data;
}

export async function updateCourse(id: string, input: Partial<CourseInput>) {
  const { data } = await apiClient.patch<Course>(
    `/courses/${id}/`,
    normalizePayload(input)
  );
  return data;
}

export async function deleteCourse(id: string) {
  await apiClient.delete(`/courses/${id}/`);
}

export async function getCourseDetail(id: string) {
  const { data } = await apiClient.get<CourseDetail>(`/courses/${id}/detail/`);
  return data;
}
/**
 * Wave C1 — duplicate a course with its full Chapter/Lesson tree.
 * Backend renames to "<name> (نسخة)" (or next available variant).
 */
export async function duplicateCourse(id: string) {
  const { data } = await apiClient.post<Course>(`/courses/${id}/duplicate/`);
  return data;
}