"use client";

import { safeReturnTo } from "@/lib/auth/navigation";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "@/lib/auth/store";
import { Spinner } from "@/components/ui/States";

/**
 * Shared layout for all auth pages.
 *
 * FIX: only redirect when status is DEFINITIVELY "authenticated" — never
 * while "checking" or "idle". Redirecting during the checking phase (which
 * is what bootstrapAuth briefly sets) is what caused the login page to
 * bounce to /dashboard before the auth check completed, only for the
 * dashboard to bounce back to /login when a transient refresh failed.
 *
 * The reset-password page is exempt: a user might follow the link from
 * email while already signed in on another account.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    const isResetFlow = pathname === "/reset-password";
    if (isResetFlow) return;
    if (status === "authenticated" && user) {
      const requestedReturnTo = new URLSearchParams(
        window.location.search,
      ).get("returnTo");
      router.replace(
        safeReturnTo(requestedReturnTo, user) ??
          (user.is_platform_admin ? "/platform" : "/dashboard"),
      );
    }
  }, [status, pathname, router, user]);

  if (pathname !== "/reset-password" && (status === "idle" || status === "checking" || status === "authenticated")) {
    return <Spinner />;
  }
  return <>{children}</>;
}