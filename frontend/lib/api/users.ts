import { apiClient } from "@/lib/api/client";
import type { Paginated, Role } from "@/types";

export interface TenantUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  is_active: boolean;
  password_setup_pending?: boolean;
  student_code?: string;
  parent_name?: string;
  parent_email?: string;
  parent_phone?: string;
  created_at?: string;
}

export async function listUsers(
  role?: Role,
  params?: {
    page?: number;
    page_size?: number;
    roleIn?: string;
    search?: string;
    is_active?: boolean;
    grade?: string;
    group?: string;
    course?: string;
    ordering?: string;
  }
) {
  const { data } = await apiClient.get<Paginated<TenantUser>>("/users/", {
    params: {
      ...(role ? { role } : {}),
      ...(params?.roleIn ? { role__in: params.roleIn } : {}),
      ...(params?.search ? { search: params.search } : {}),
      ...(params?.is_active !== undefined ? { is_active: params.is_active } : {}),
      ...(params?.page ? { page: params.page } : {}),
      ...(params?.page_size ? { page_size: params.page_size } : {}),
      ...(params?.ordering ? { ordering: params.ordering } : {}),

      // --- الإصلاح هنا: تمرير الفلاتر للباك إند ---
      ...(params?.grade ? { grade: params.grade } : {}),
      ...(params?.group ? { group: params.group } : {}),
      ...(params?.course ? { course: params.course } : {}),
    },
  });
  return data;
}

export interface UserInput {
  email: string;
  role: "ADMIN" | "TEACHER" | "STUDENT" | "PARENT";
  first_name?: string;
  last_name?: string;
  parent_name?: string;
  parent_email?: string;
  parent_phone?: string;
}

export async function createUser(input: UserInput) {
  const { data } = await apiClient.post<TenantUser>("/users/", input);
  return data;
}

export interface UserUpdateInput {
  first_name?: string;
  last_name?: string;
  is_active?: boolean;
}

export async function updateUser(id: string, input: UserUpdateInput) {
  const { data } = await apiClient.patch<TenantUser>(`/users/${id}/`, input);
  return data;
}

export async function deleteUser(id: string) {
  await apiClient.delete(`/users/${id}/`);
}