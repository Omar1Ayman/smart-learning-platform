"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth/store";
import type { Role } from "@/types";

// Context-aware navigation per role — spec #55.
const NAV_BY_ROLE: Record<Role, { href: string; label: string }[]> = {
  OWNER: [
    { href: "/dashboard", label: "الرئيسية" },
    { href: "/academic-years", label: "السنوات الدراسية" },
    { href: "/terms", label: "الترمات" },
    { href: "/courses", label: "الكورسات" },
    { href: "/team", label: "الفريق" },
    { href: "/teacher-assignments", label: "تكليفات المعلمين" },
    { href: "/enrollments", label: "التسجيلات" },
  ],
  ADMIN: [
    { href: "/dashboard", label: "الرئيسية" },
    { href: "/academic-years", label: "السنوات الدراسية" },
    { href: "/terms", label: "الترمات" },
    { href: "/courses", label: "الكورسات" },
    { href: "/team", label: "الفريق" },
    { href: "/teacher-assignments", label: "تكليفات المعلمين" },
    { href: "/enrollments", label: "التسجيلات" },
  ],
  TEACHER: [
    { href: "/dashboard", label: "الرئيسية" },
    { href: "/academic-years", label: "السنوات الدراسية" },
    { href: "/enrollments", label: "طلابي" },
  ],
  STUDENT: [
    { href: "/dashboard", label: "الرئيسية" },
    { href: "/academic-years", label: "السنوات الدراسية" },
    { href: "/enrollments", label: "تسجيلي" },
  ],
};

export function Sidebar() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role) ?? "STUDENT";
  const tenantName = useAuthStore((s) => s.user?.tenant?.name);
  const items = NAV_BY_ROLE[role];

  return (
    <aside className="flex h-full w-64 flex-col border-e border-line bg-white">
      <div className="border-b border-line px-5 py-5">
        <p className="font-display text-base font-bold text-ink">منصة التعلم الذكية</p>
        {tenantName && <p className="mt-0.5 text-xs text-ink-400">{tenantName}</p>}
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-ink text-white" : "text-ink-700 hover:bg-ink-50"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
