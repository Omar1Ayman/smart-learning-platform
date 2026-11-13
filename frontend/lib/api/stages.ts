import { apiClient } from "@/lib/api/client";
import type { Paginated, StageDetail } from "@/types";

export interface Stage {
  id: string;
  name: string;
  order: number;
}

export async function listStages(params?: { page?: number }) {
  const { data } = await apiClient.get<Paginated<Stage>>("/stages/", { params });
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

export async function updateStage(id: string, input: Partial<StageInput>) {
  const { data } = await apiClient.patch<Stage>(`/stages/${id}/`, input);
  return data;
}

export async function deleteStage(id: string) {
  await apiClient.delete(`/stages/${id}/`);
}

export async function getStageDetail(id: string) {
  const { data } = await apiClient.get<StageDetail>(`/stages/${id}/detail/`);
  return data;
}