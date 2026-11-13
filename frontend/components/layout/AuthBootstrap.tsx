"use client";

import { useEffect, useRef } from "react";
import { bootstrapAuth } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";

export function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const { status, accessToken } = useAuthStore.getState();
    if (status === "idle" || (!accessToken && status !== "authenticated")) {
      void bootstrapAuth();
    }
  }, []);

  return <>{children}</>;
}
