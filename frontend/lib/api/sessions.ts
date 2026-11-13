import { apiClient } from "@/lib/api/client";
import type { SessionsResponse } from "@/types";

export async function listSessions(currentSessionId?: string) {
  const { data } = await apiClient.get<SessionsResponse>("/auth/sessions/", {
    params: currentSessionId ? { current: currentSessionId } : undefined,
  });
  return data;
}

export async function revokeSession(sessionId: string) {
  const { data } = await apiClient.post<{ detail: string }>(
    `/auth/sessions/${sessionId}/revoke/`
  );
  return data;
}

export async function revokeAllSessions() {
  const { data } = await apiClient.post<{ detail: string }>(
    "/auth/sessions/revoke-all/"
  );
  return data;
}

export interface ChangePasswordInput {
  current_password: string;
  new_password: string;
  confirm_password: string;
  current_jti?: string;
}

export async function changePassword(input: ChangePasswordInput) {
  const { data } = await apiClient.post<{ detail: string; other_sessions_revoked: number }>(
    "/auth/change-password/",
    input
  );
  return data;
}