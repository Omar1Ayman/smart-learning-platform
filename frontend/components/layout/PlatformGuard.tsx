"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { bootstrapAuth } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import { Spinner } from "@/components/ui/States";

/**
 * Auth guard for /platform/* — requires is_platform_admin=True AND
 * tenant=null. Anyone else is bounced to /dashboard or /login.
 *
 * Deliberately separate from the tenant AuthGuard: the check is
 * `is_platform_admin`, not merely `is_authenticated`. A regular OWNER
 * reaching /platform must be rejected even if fully logged in.
 */
export function PlatformGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    bootstrapAuth();
  }, []);

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && user && !user.is_platform_admin) {
      router.replace("/dashboard");
    }
  }, [status, user, router]);

  if (status === "idle" || status === "checking") return <Spinner />;
  if (status !== "authenticated" || !user) return null;
  if (!user.is_platform_admin) return <Spinner />;
  return <>{children}</>;
}