"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "@/lib/auth/store";
import { Spinner } from "@/components/ui/States";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const accessToken = useAuthStore((s) => s.accessToken);
  const isPlatformAdmin = useAuthStore((s) => s.user?.is_platform_admin ?? false);

  useEffect(() => {
    if (status === "anonymous") {
      const returnTo =
        window.location.pathname + window.location.search + window.location.hash;
      router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && isPlatformAdmin) {
      router.replace("/platform");
    }
  }, [status, isPlatformAdmin, router]);

  if (status === "idle" || status === "checking") return <Spinner />;
  if (status !== "authenticated") return null;
  if (!accessToken) return <Spinner />;
  if (isPlatformAdmin) return <Spinner />;
  return <>{children}</>;
}