import { apiClient } from "@/lib/api/client";
import type { TenantBranding, TenantSettings } from "@/types";

export async function getTenantSettings() {
  const { data } = await apiClient.get<TenantSettings>("/tenant/settings/");
  return data;
}

export async function updateTenantSettings(partial: Partial<TenantSettings>) {
  const { data } = await apiClient.patch<TenantSettings>("/tenant/settings/", partial);
  return data;
}

export async function getTenantBranding() {
  const { data } = await apiClient.get<TenantBranding>("/tenant/branding/");
  return data;
}

export async function updateTenantBranding(partial: Partial<TenantBranding>) {
  const { data } = await apiClient.patch<TenantBranding>("/tenant/branding/", partial);
  return data;
}