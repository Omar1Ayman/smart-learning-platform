"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { bootstrapAuth } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import { Spinner } from "@/components/ui/States";

/**
 * Route protection lives here, client-side, on purpose: the access token
 * is memory-only (never a JS-readable cookie), so Next.js edge middleware
 * has nothing to check. On mount we try a silent refresh from the httpOnly
 * cookie; only after that resolves do we know whether to render the
 * dashboard or bounce to /login.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    bootstrapAuth();
  }, []);

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  if (status === "idle" || status === "checking") {
    return <Spinner />;
  }
  if (status !== "authenticated") {
    return null;
  }
  return <>{children}</>;
}
