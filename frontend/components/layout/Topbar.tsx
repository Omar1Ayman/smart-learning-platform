"use client";

import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import { Button } from "@/components/ui/Button";

export function Topbar() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  async function handleLogout() {
    try {
      await apiClient.post("/auth/logout/");
    } finally {
      clearAuth();
      router.replace("/login");
    }
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-line bg-white px-6">
      <div />
      <div className="flex items-center gap-3">
        {user && <span className="text-sm text-ink-700">{user.email}</span>}
        <Button variant="ghost" onClick={handleLogout}>
          تسجيل الخروج
        </Button>
      </div>
    </header>
  );
}
