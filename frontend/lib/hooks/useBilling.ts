"use client";

import { useQuery } from "@tanstack/react-query";
import { getMyFeatures, getMyPlan, getMyUsage } from "@/lib/api/billing";
import { useAuthStore } from "@/lib/auth/store";

/**
 * Full billing summary for the current tenant.
 * Returns { plan, status, trial, features, limits }.
 *
 * Cached for 60s — plan changes are rare and the UI doesn't need
 * to be instantly reactive to a backend upgrade.
 */
export function useBilling() {
  const isAuth = useAuthStore((s) => s.status === "authenticated");
  return useQuery({
    queryKey: ["billing", "me"],
    queryFn: getMyPlan,
    enabled: isAuth,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Usage for each limit (current / max).
 * Refetches every 5 min — usage can change as users add students.
 */
export function useUsage() {
  const isAuth = useAuthStore((s) => s.status === "authenticated");
  return useQuery({
    queryKey: ["billing", "usage"],
    queryFn: getMyUsage,
    enabled: isAuth,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}

/**
 * Check a single feature flag.
 * Returns false while loading, so the UI hides gated features by default.
 *
 * Usage:
 *   const canBulkGrade = useFeature("bulk_grading");
 *   if (!canBulkGrade) return <UpgradePrompt />;
 */
export function useFeature(key: string): boolean {
  const isAuth = useAuthStore((s) => s.status === "authenticated");
  const { data } = useQuery({
    queryKey: ["billing", "features"],
    queryFn: getMyFeatures,
    enabled: isAuth,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  return data?.features[key] ?? false;
}

/**
 * Check if a limit is reached (current >= max).
 * `max === null` means unlimited → always false.
 *
 * Usage:
 *   const studentsLimit = useLimitReached("max_students");
 *   <Button disabled={studentsLimit}>+ إضافة طالب</Button>
 */
export function useLimitReached(key: string): boolean {
  const { data } = useUsage();
  if (!data) return false;
  const item = data[key as keyof typeof data];
  if (!item) return false;
  if (item.max === null) return false;
  return item.current >= item.max;
}