"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Command, Search } from "@/components/ui/icons";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import { useCommandPalette } from "@/lib/hooks/useCommandPalette";
import { initialsFromName } from "@/lib/utils/initials";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { YearSwitcher } from "./YearSwitcher";

function displayName(
  firstName?: string | null,
  lastName?: string | null,
  email?: string
): string {
  const full = [firstName, lastName].filter(Boolean).join(" ").trim();
  return full || email?.split("@")[0] || "";
}

export function Topbar() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const openPalette = useCommandPalette((s) => s.openPalette);

  async function handleLogout() {
    try {
      await apiClient.post("/auth/logout/");
    } finally {
      clearAuth();
      router.replace("/login");
    }
  }

  const name = user
    ? displayName(user.first_name, user.last_name, user.email)
    : "";

  return (
    <header className="flex items-center justify-between h-16 gap-3 px-4 border-b border-line bg-paper-elevated sm:px-6">
      <button
        onClick={openPalette}
        className="flex items-center gap-2 rounded-lg border border-line bg-paper-muted px-3 py-1.5 text-sm text-ink-400 transition-colors hover:border-line-strong hover:bg-paper-elevated hover:text-ink"
        aria-label="فتح البحث السريع"
      >
        <Search size={16} />
        <span className="hidden sm:inline">ابحث...</span>
        <kbd className="hidden items-center gap-0.5 rounded border border-line bg-paper-elevated px-1.5 py-0.5 text-[10px] font-mono text-ink-400 sm:flex">
          <Command size={10} />K
        </kbd>
      </button>

      <div className="flex items-center gap-1 sm:gap-2">
        <YearSwitcher />
        <ThemeToggle />
        <NotificationBell />

        {user && (
          <Link
            href="/settings/profile"
            className="flex items-center gap-2 px-2 py-1 transition-colors rounded-lg hover:bg-paper-muted"
          >
            <span className="inline-flex items-center justify-center w-8 h-8 text-xs font-bold text-white rounded-full bg-ink dark:bg-accent dark:text-[#111827] sm:h-9 sm:w-9 sm:text-sm">
              {initialsFromName(name)}
            </span>
            <span className="hidden text-sm font-medium text-ink sm:inline">
              {name}
            </span>
          </Link>
        )}

        <Button
          variant="ghost"
          onClick={handleLogout}
          className="text-xs sm:text-sm"
        >
          خروج
        </Button>
      </div>
    </header>
  );
}