import { apiClient } from "@/lib/api/client";
import type { Paginated } from "@/types";

export interface Stage {
  id: string;
  name: string;
  order: number;
}

export async function listStages() {
  const { data } = await apiClient.get<Paginated<Stage>>("/stages/");
  return data;
}

export interface StageInput {
  name: string;
  order?: number;
}

export async function createStage(input: StageInput) {
  const { data } = await apiClient.post<Stage>("/stages/", input);
  return data;
}
