"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, UserRound } from "lucide-react";
import { useAuthStore } from "@/lib/auth/store";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

const PAGE_LABELS = [
  { href: "/platform/tenants", label: "المؤسسات" },
  { href: "/platform/billing", label: "الباقات والأسعار" },
  { href: "/platform/demo-requests", label: "طلبات العرض" },
  { href: "/platform/users", label: "المستخدمون" },
  { href: "/platform/audit", label: "السجلات" },
  { href: "/platform/profile", label: "الملف الشخصي" },
  { href: "/platform/settings", label: "الإعدادات" },
];

export function PlatformTopbar() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const currentPage =
    PAGE_LABELS.find(
      (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
    )?.label ?? "لوحة إدارة المنصة";

  return (
    <header className="sticky top-0 z-30 hidden items-center justify-between border-b border-line bg-paper-elevated/95 px-6 py-3 backdrop-blur md:flex">
      <div>
        <p className="text-sm font-bold text-ink">{currentPage}</p>
        <p className="text-xs text-ink-400">إدارة وتشغيل المنصة</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="max-w-56 truncate px-2 text-xs text-ink-500">
          {user?.email ?? ""}
        </span>
        <Link
          href="/platform/profile"
          aria-label="الملف الشخصي"
          title="الملف الشخصي"
          className="grid h-9 w-9 place-items-center rounded-lg text-ink-400 hover:bg-paper-muted hover:text-ink"
        >
          <UserRound size={18} />
        </Link>
        <Link
          href="/platform/settings"
          aria-label="الإعدادات"
          title="الإعدادات"
          className="grid h-9 w-9 place-items-center rounded-lg text-ink-400 hover:bg-paper-muted hover:text-ink"
        >
          <Settings size={18} />
        </Link>
        <ThemeToggle />

      </div>
    </header>
  );
}
