"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Menu, Settings, UserRound, X, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import {
  ClipboardList,
  FileText,
  GraduationCap,
  Home,
  Users,
} from "@/components/ui/icons";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
}

const NAV: NavItem[] = [
  { href: "/platform", label: "الرئيسية", icon: <Home size={16} />, exact: true },
  { href: "/platform/tenants", label: "المؤسسات", icon: <GraduationCap size={16} /> },
  { href: "/platform/billing", label: "الباقات والأسعار", icon: <FileText size={16} /> },
  { href: "/platform/demo-requests", label: "طلبات العرض", icon: <FileText size={16} /> },
  { href: "/platform/users", label: "المستخدمون", icon: <Users size={16} /> },
  { href: "/platform/audit", label: "السجلات", icon: <ClipboardList size={16} /> },
];

export function PlatformNav() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    try {
      await apiClient.post("/auth/logout/");
    } finally {
      clearAuth();
      router.replace("/login");
    }
  }

  function isActive(item: NavItem) {
    return item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");
  }

  function closeMobileMenu() {
    setMobileOpen(false);
  }

  return (
    <div className="w-full shrink-0 md:w-64">
      <aside className="sticky top-0 hidden h-screen flex-col border-e border-line bg-paper-elevated md:flex">
        <div className="border-b border-line px-5 py-5">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-sm font-bold text-paper">
              م
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-bold text-ink">إدارة المنصة</p>
              <p className="truncate text-[10px] text-ink-400"> {user?.email ?? "—"}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <p className="mb-1 px-3 text-[10px] font-medium uppercase tracking-wider text-ink-400">
            الإدارة
          </p>
          <div className="space-y-0.5">
            {NAV.map((item) => (
              <PlatformNavLink
                key={item.href}
                item={item}
                active={isActive(item)}
              />
            ))}
          </div>

          <AccountLinks
            pathname={pathname}
            onLogout={() => void handleLogout()}
          />
        </nav>

        {/* <div className="border-t border-line px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-ink-400">الإصدار 1.0</p>
            <ThemeToggle />
          </div>
        </div> */}
      </aside>

      <div className="sticky top-0 z-40 border-b border-line bg-paper-elevated md:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink text-sm font-bold text-paper">
            م
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink">إدارة المنصة</p>
            <p className="truncate text-[10px] text-ink-400">{user?.email ?? "—"}</p>
          </div>
          <ThemeToggle />
          <button
            type="button"
            aria-label={mobileOpen ? "إغلاق القائمة" : "فتح القائمة"}
            aria-expanded={mobileOpen}
            aria-controls="platform-mobile-navigation"
            onClick={() => setMobileOpen((open) => !open)}
            className="grid h-10 w-10 place-items-center rounded-lg text-ink hover:bg-ink-50"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {mobileOpen && (
          <nav id="platform-mobile-navigation" className="max-h-[75vh] overflow-y-auto border-t border-line px-3 py-3">
            <div className="space-y-1">
              {NAV.map((item) => (
                <PlatformNavLink
                  key={item.href}
                  item={item}
                  active={isActive(item)}
                  onClick={closeMobileMenu}
                />
              ))}
            </div>
            <AccountLinks
              pathname={pathname}
              onLogout={() => {
                closeMobileMenu();
                void handleLogout();
              }}
              onNavigate={closeMobileMenu}
            />
          </nav>
        )}
      </div>
    </div>
  );
}

function PlatformNavLink({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-ink text-white dark:bg-accent dark:text-[#111827]"
          : "text-ink hover:bg-paper-muted"
      }`}
    >
      <span className={`shrink-0 ${active ? "text-current" : "text-ink-400"}`}>
        {item.icon}
      </span>
      <span className="flex-1 truncate font-medium">{item.label}</span>
    </Link>
  );
}

function AccountLinks({
  pathname,
  onLogout,
  onNavigate,
}: {
  pathname: string;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  const accountItems = [
    { href: "/platform/profile", label: "الملف الشخصي", icon: <UserRound size={16} /> },
    { href: "/platform/settings", label: "الإعدادات", icon: <Settings size={16} /> },
  ];

  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="mb-1 px-3 text-[10px] font-medium uppercase tracking-wider text-ink-400">
        الحساب
      </p>
      <div className="space-y-0.5">
        {accountItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-ink text-white dark:bg-accent dark:text-[#111827]"
                  : "text-ink hover:bg-paper-muted"
              }`}
            >
              <span className={active ? "text-current" : "text-ink-400"}>{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-ink-50"
        >
          <LogOut size={16} className="text-ink-400" />
          <span className="font-medium">تسجيل الخروج</span>
        </button>
      </div>
    </div>
  );
}
