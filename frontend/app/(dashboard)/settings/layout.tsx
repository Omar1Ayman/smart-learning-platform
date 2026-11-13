"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth/store";

const TABS = [
  { href: "/settings/profile", label: "الملف الشخصي", icon: "👤", roles: ["OWNER", "ADMIN", "TEACHER", "STUDENT", "PARENT"] },
  { href: "/settings/security", label: "الأمان", icon: "🔒", roles: ["OWNER", "ADMIN", "TEACHER", "STUDENT", "PARENT"] },
  { href: "/settings/sessions", label: "الجلسات", icon: "💻", roles: ["OWNER", "ADMIN", "TEACHER", "STUDENT", "PARENT"] },
  { href: "/settings/tenant", label: "إعدادات المؤسسة", icon: "🏢", roles: ["OWNER", "ADMIN"] },     
  { href: "/settings/audit", label: "سجل الأحداث", icon: "📋", roles: ["OWNER", "ADMIN", "TEACHER"] },
  { href: "/settings/data", label: "البيانات", icon: "🗄️", roles: ["OWNER", "ADMIN"] },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role);
  const canViewAuditLog = useAuthStore((s) => s.user?.can_view_audit_log);

  const visible = TABS.filter((t) =>
    t.href === "/settings/audit"
      ? canViewAuditLog === true
      : !role || t.roles.includes(role)
  );

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        
        {/* القائمة الجانبية */}
        <aside className="w-full lg:w-64 shrink-0">
          <div className="lg:sticky lg:top-24 flex flex-col gap-1 rounded-2xl border border-line bg-paper-elevated p-2 shadow-sm">
            <h2 className="px-3 pt-2 pb-3 text-xs font-bold uppercase tracking-wider text-ink-400">
              الإعدادات
            </h2>
            {visible.map((t) => {
              const active = pathname === t.href || pathname.startsWith(t.href + "/");
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    active 
                      ? "bg-ink text-white shadow-md dark:bg-accent dark:text-[#111827]" 
                      : "text-ink-600 hover:bg-ink-50 hover:text-ink"
                  }`}
                >
                  <span className={`text-lg ${active ? "opacity-100" : "opacity-60"}`}>
                    {t.icon}
                  </span>
                  {t.label}
                </Link>
              );
            })}
          </div>
        </aside>

        {/* مساحة المحتوى */}
        <main className="min-w-0 flex-1">
          {children}
        </main>
        
      </div>
    </div>
  );
}