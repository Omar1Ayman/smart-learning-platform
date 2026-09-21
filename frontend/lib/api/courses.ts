import { apiClient } from "@/lib/api/client";
import type { Paginated } from "@/types";

export interface Course {
  id: string;
  subject: string;
  grade: string;
  name: string;
  description: string;
  is_active: boolean;
}

export async function listCourses() {
  const { data } = await apiClient.get<Paginated<Course>>("/courses/");
  return data;
}

export interface CourseInput {
  subject: string;
  grade: string;
  name: string;
  description?: string;
}

export async function createCourse(input: CourseInput) {
  const { data } = await apiClient.post<Course>("/courses/", input);
  return data;
}
