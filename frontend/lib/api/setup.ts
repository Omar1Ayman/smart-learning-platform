import { apiClient } from "@/lib/api/client";
import type { SetupStatus } from "@/types";

export async function getSetupStatus() {
  const { data } = await apiClient.get<SetupStatus>("/setup-status/");
  return data;
}