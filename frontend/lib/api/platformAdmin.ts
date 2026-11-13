import { apiClient } from "@/lib/api/client";
import type {
  CreateTenantInput,
  DemoRequest,
  DemoRequestStatus,
  Paginated,
  PlatformMetrics,
  PlatformTenantDetail,
  PlatformTenantListItem,
  PlatformTenantStatus,
} from "@/types";
import type { PlanFeatures } from "@/lib/api/billing";

export interface PlatformPlan {
  id: string;
  key: string;
  name: string;
  description: string;
  price_monthly: string;
  price_yearly: string;
  currency: string;
  is_active: boolean;
  is_public: boolean;
  display_order: number;
  max_students: number | null;
  max_teachers: number | null;
  max_storage_mb: number | null;
  max_assessments_per_month: number | null;
  features: Partial<PlanFeatures>;
}

export type PlatformSubscriptionStatus =
  | "IMPLICIT_FREE"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "PAUSED";

export interface PlatformBillingTenant {
  id: string;
  name: string;
  slug: string;
  status: PlatformTenantStatus;
  contact_email: string;
  plan_id: string | null;
  plan_key: string | null;
  plan_name: string | null;
  subscription_status: PlatformSubscriptionStatus;
  is_implicit: boolean;
  current_period_end: string | null;
  subscription_trial_end: string | null;
  feature_overrides: Record<string, boolean>;
  limit_overrides: Record<string, number | null>;
}

export interface PlatformUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: "OWNER" | "ADMIN" | "TEACHER" | "STUDENT" | "PARENT";
  is_active: boolean;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  date_joined: string;
  last_login: string | null;
}

export interface PlatformAuditLog {
  id: string;
  action: string;
  action_label: string;
  actor: string | null;
  actor_email: string | null;
  actor_role: string | null;
  object_type: string;
  object_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
  tenant_name: string | null;
  tenant_slug: string | null;
}

// ---------- Metrics ----------

export async function getPlatformMetrics() {
  const { data } = await apiClient.get<PlatformMetrics>("/platform/metrics/");
  return data;
}

// ---------- Tenants ----------

export async function listPlatformTenants(params?: {
  status?: PlatformTenantStatus;
  search?: string;
}) {
  const { data } = await apiClient.get<Paginated<PlatformTenantListItem>>(
    "/platform/tenants/",
    { params }
  );
  return data;
}

export async function getPlatformTenant(id: string) {
  const { data } = await apiClient.get<PlatformTenantDetail>(`/platform/tenants/${id}/`);
  return data;
}

export async function createPlatformTenant(input: CreateTenantInput) {
  const { data } = await apiClient.post<PlatformTenantDetail>("/platform/tenants/", input);
  return data;
}

export async function updateTenantStatus(
  id: string,
  status: PlatformTenantStatus,
  internal_notes?: string
) {
  const { data } = await apiClient.post<PlatformTenantDetail>(
    `/platform/tenants/${id}/update_status/`,
    { status, internal_notes }
  );
  return data;
}

export async function resetOwnerPassword(id: string, newPassword: string) {
  const { data } = await apiClient.post<{ detail: string }>(
    `/platform/tenants/${id}/reset_owner_password/`,
    { new_password: newPassword }
  );
  return data;
}

export async function listPlatformUsers(params?: {
  page?: number;
  search?: string;
  role?: PlatformUser["role"];
  is_active?: boolean;
}) {
  const { data } = await apiClient.get<Paginated<PlatformUser>>(
    "/platform/users/",
    { params },
  );
  return data;
}

export async function updatePlatformUserStatus(id: string, is_active: boolean) {
  const { data } = await apiClient.patch<PlatformUser>(
    `/platform/users/${id}/status/`,
    { is_active },
  );
  return data;
}

export async function listPlatformAuditLogs(params?: {
  page?: number;
  search?: string;
}) {
  const { data } = await apiClient.get<Paginated<PlatformAuditLog>>(
    "/platform/audit/",
    { params },
  );
  return data;
}

// ---------- Billing administration ----------

export async function listPlatformPlans() {
  const { data } = await apiClient.get<Paginated<PlatformPlan>>(
    "/platform/billing/plans/"
  );
  return data;
}

export async function createPlatformPlan(
  input: Omit<PlatformPlan, "id">,
) {
  const { data } = await apiClient.post<PlatformPlan>(
    "/platform/billing/plans/",
    input,
  );
  return data;
}

export async function updatePlatformPlan(
  id: string,
  input: Partial<Omit<PlatformPlan, "id">>
) {
  const { data } = await apiClient.patch<PlatformPlan>(
    `/platform/billing/plans/${id}/`,
    input
  );
  return data;
}

export async function deletePlatformPlan(id: string) {
  await apiClient.delete(`/platform/billing/plans/${id}/`);
}

export async function listPlatformBillingTenants(params?: {
  page?: number;
  search?: string;
  status?: PlatformTenantStatus;
}) {
  const { data } = await apiClient.get<Paginated<PlatformBillingTenant>>(
    "/platform/billing/tenants/",
    { params }
  );
  return data;
}

export async function updatePlatformSubscription(
  tenantId: string,
  input: {
    plan_key: string;
    status: Exclude<PlatformSubscriptionStatus, "IMPLICIT_FREE">;
    trial_days?: number;
  }
) {
  const { data } = await apiClient.patch<PlatformBillingTenant>(
    `/platform/billing/tenants/${tenantId}/subscription/`,
    input
  );
  return data;
}

// ---------- Demo Requests ----------

export async function listDemoRequests(params?: { status?: DemoRequestStatus }) {
  const { data } = await apiClient.get<Paginated<DemoRequest>>("/platform/demo-requests/", {
    params,
  });
  return data;
}

export async function updateDemoRequestStatus(
  id: string,
  status: DemoRequestStatus,
  notes?: string
) {
  const { data } = await apiClient.post<DemoRequest>(
    `/platform/demo-requests/${id}/update_status/`,
    { status, notes }
  );
  return data;
}

// ---------- Public ----------

export interface DemoRequestInput {
  school_name: string;
  contact_name: string;
  email: string;
  phone: string;
  num_students?: number;
  message?: string;
}

export async function submitDemoRequest(input: DemoRequestInput) {
  const { data } = await apiClient.post<{ id: string; detail: string }>(
    "/demo-requests/",
    input
  );
  return data;
}

// ---------- Helpers ----------

export function platformStatusLabel(s: PlatformTenantStatus): string {
  return {
    LEAD: "Lead",
    PENDING: "قيد المراجعة",
    TRIAL: "تجريبي",
    ACTIVE: "نشط",
    SUSPENDED: "معلّق",
    CHURNED: "منتهي",
  }[s];
}

export function platformStatusStyle(s: PlatformTenantStatus): string {
  return {
    LEAD: "bg-ink-50 text-ink-400",
    PENDING: "bg-accent/20 text-ink-700",
    TRIAL: "bg-blue-100 text-blue-700",
    ACTIVE: "bg-success/10 text-success",
    SUSPENDED: "bg-danger/10 text-danger",
    CHURNED: "bg-ink-50 text-ink-400",
  }[s];
}

export function demoStatusLabel(s: DemoRequestStatus): string {
  return {
    NEW: "جديد",
    CONTACTED: "تم التواصل",
    CONVERTED: "تم التحويل",
    DECLINED: "مرفوض",
  }[s];
}