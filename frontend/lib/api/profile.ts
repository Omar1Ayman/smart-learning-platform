import { apiClient } from "@/lib/api/client";
import type { Profile } from "@/types";

export async function getProfile() {
  const { data } = await apiClient.get<Profile>("/auth/profile/");
  return data;
}

export interface ProfileUpdate {
  first_name?: string;
  last_name?: string;
}

export async function updateProfile(input: ProfileUpdate) {
  const { data } = await apiClient.patch<Profile>("/auth/profile/", input);
  return data;
}