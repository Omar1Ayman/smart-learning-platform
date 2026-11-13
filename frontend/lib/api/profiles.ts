import { apiClient } from "@/lib/api/client";
import type { StudentDetail, TeacherDetail } from "@/types";

export async function getStudentDetail(id: string) {
  const { data } = await apiClient.get<StudentDetail>(`/students/${id}/`);
  return data;
}

export async function getTeacherDetail(id: string) {
  const { data } = await apiClient.get<TeacherDetail>(`/teachers/${id}/`);
  return data;
}