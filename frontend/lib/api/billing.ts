import { apiClient } from "@/lib/api/client";

// ============================================================================
// Types
// ============================================================================

export interface PlanFeatures {
  bulk_grading: boolean;
  advanced_analytics: boolean;
  parent_portal: boolean;
  custom_branding: boolean;
  bulk_import: boolean;
  attendance: boolean;
  api_access: boolean;
  priority_support: boolean;
  [key: string]: boolean;
}

export interface PlanLimits {
  max_students: number | null;
  max_teachers: number | null;
  max_storage_mb: number | null;
  max_assessments_per_month: number | null;
  [key: string]: number | null;
}

export interface Plan {
  id: string;
  key: string;
  name: string;
  description: string;
  price_monthly: string;
  price_yearly: string;
  currency: string;
  display_order: number;
  features: PlanFeatures;
  limits: PlanLimits;
}

export interface SubscriptionTrial {
  is_in_trial: boolean;
  ends_at: string | null;
}

export interface MyPlan {
  plan: Plan;
  status:
    | "IMPLICIT_FREE"
    | "TRIALING"
    | "ACTIVE"
    | "PAST_DUE"
    | "CANCELED"
    | "PAUSED";
  is_implicit: boolean;
  trial: SubscriptionTrial;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  features: PlanFeatures;
  limits: PlanLimits;
}

export interface UsageItem {
  current: number;
  max: number | null;
  unit: string;
}

export interface Usage {
  max_students: UsageItem;
  max_teachers: UsageItem;
  max_storage_mb: UsageItem;
  max_assessments_per_month: UsageItem;
}

// ============================================================================
// API
// ============================================================================

export async function listPublicPlans(): Promise<Plan[]> {
  const { data } = await apiClient.get<Plan[]>("/billing/plans/");
  return data;
}

export async function getMyPlan(): Promise<MyPlan> {
  const { data } = await apiClient.get<MyPlan>("/billing/me/");
  return data;
}

export async function getMyUsage(): Promise<Usage> {
  const { data } = await apiClient.get<Usage>("/billing/usage/");
  return data;
}

export async function getMyFeatures(): Promise<{ features: PlanFeatures }> {
  const { data } = await apiClient.get<{ features: PlanFeatures }>(
    "/billing/features/"
  );
  return data;
}