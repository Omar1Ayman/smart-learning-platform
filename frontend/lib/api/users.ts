import { apiClient } from "@/lib/api/client";
import type { Paginated, Role } from "@/types";

export interface TenantUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  is_active: boolean;
}

export async function listUsers(role?: Role) {
  const { data } = await apiClient.get<Paginated<TenantUser>>("/users/", {
    params: role ? { role } : undefined,
  });
  return data;
}

export interface UserInput {
  email: string;
  password: string;
  role: "ADMIN" | "TEACHER" | "STUDENT";
  first_name?: string;
  last_name?: string;
}

export async function createUser(input: UserInput) {
  const { data } = await apiClient.post<TenantUser>("/users/", input);
  return data;
}
