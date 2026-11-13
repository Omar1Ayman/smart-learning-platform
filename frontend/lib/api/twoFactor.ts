import { apiClient } from "@/lib/api/client";
import type { TwoFactorSetupResponse } from "@/types";

export async function setupTwoFactor() {
  const { data } = await apiClient.post<TwoFactorSetupResponse>("/auth/2fa/setup/");
  return data;
}

export async function enableTwoFactor(code: string) {
  const { data } = await apiClient.post<{ detail: string }>("/auth/2fa/enable/", { code });
  return data;
}

export async function disableTwoFactor(password: string, code: string) {
  const { data } = await apiClient.post<{ detail: string }>("/auth/2fa/disable/", {
    password,
    code,
  });
  return data;
}

interface TwoFactorLoginResponse {
  access: string;
  // C-8: backend returns session_id from create_session() in TwoFactorLoginView.
  session_id?: string;
  tenant: { id: string; name: string; slug: string } | null;
  user: { id: string; email: string; role: string };
}

export async function verifyTwoFactorLogin(twofa_token: string, code: string) {
  const { data } = await apiClient.post<TwoFactorLoginResponse>("/auth/login/2fa/", {
    twofa_token,
    code,
  });
  return data;
}