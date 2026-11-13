"use client";

import { useQuery } from "@tanstack/react-query";
import { getSetupStatus } from "@/lib/api/setup";
import { useAuthStore } from "@/lib/auth/store";


export function useSetupStatus() {
  const role = useAuthStore((s) => s.user?.role);
  const enabled = role === "OWNER" || role === "ADMIN";

  return useQuery({
    queryKey: ["setup-status"],
    queryFn: getSetupStatus,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    enabled,
  });
}