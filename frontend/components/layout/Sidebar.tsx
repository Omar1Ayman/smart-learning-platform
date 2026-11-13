"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth/store";
import type { Role } from "@/types";
import { useSetupStatus } from "@/lib/hooks/useSetupStatus";
import {
  Award, Bell, Book, BarChart, Calendar, ClipboardList, FileText,
  GraduationCap, Home, Link as LinkIcon, Settings, Shield, Target,
  Upload, User, Users,
} from "@/components/ui/icons";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

function createAdminNavigation(canViewReports: boolean): NavGroup[] {
  return [
    { items: [{ href: "/dashboard", label: "الرئيسية", icon: <Home size={16} /> }] },
    {
      label: "التعليم والتقييم",
      items: [
        { href: "/assessments", label: "الامتحانات", icon: <ClipboardList size={16} /> },
        { href: "/banks", label: "بنك الأسئلة", icon: <FileText size={16} /> },
        { href: "/content", label: "المكتبة التعليمية", icon: <Book size={16} /> },
      ],
    },
    {
      label: "الهيكل الدراسي",
      items: [
        { href: "/academic-years", label: "السنوات الدراسية", icon: <Award size={16} /> },
        { href: "/terms", label: "الترمات", icon: <Calendar size={16} /> },
        { href: "/stages", label: "المراحل", icon: <GraduationCap size={16} /> },
        { href: "/grades", label: "الصفوف", icon: <GraduationCap size={16} /> },
        { href: "/subjects", label: "المواد", icon: <Book size={16} /> },
        { href: "/groups", label: "المجموعات", icon: <Users size={16} /> },
        { href: "/courses", label: "المقررات", icon: <Book size={16} /> },
      ],
    },
    {
      label: "إدارة المستخدمين",
      items: [
        { href: "/team", label: "الفريق", icon: <Users size={16} /> },
        { href: "/students", label: "الطلاب", icon: <User size={16} /> },
        { href: "/teacher-assignments", label: "تكليفات المعلمين", icon: <LinkIcon size={16} /> },
        { href: "/enrollments", label: "التسجيلات", icon: <ClipboardList size={16} /> },
        { href: "/promotion", label: "ترقية الطلاب", icon: <Upload size={16} /> },
      ],
    },
    {
      label: "المتابعة",
      items: [
        { href: "/attendance", label: "الحضور والغياب", icon: <Target size={16} /> },
        ...(canViewReports
          ? [{ href: "/reports", label: "التقارير", icon: <BarChart size={16} /> }]
          : []),
        { href: "/notifications", label: "الإشعارات", icon: <Bell size={16} /> },
      ],
    },
    {
      label: "إعدادات النظام",
      items: [{ href: "/settings/security", label: "الأمان", icon: <Shield size={16} /> }],
    },
  ];
}

const NAV_BY_ROLE: Record<Role, NavGroup[]> = {
  OWNER: createAdminNavigation(true),
  ADMIN: createAdminNavigation(false),

  TEACHER: [
    { items: [{ href: "/dashboard", label: "الرئيسية", icon: <Home size={16} /> }] },
    {
      label: "التدريس والتقييم",
      items: [
        { href: "/assessments", label: "الامتحانات", icon: <ClipboardList size={16} /> },
        { href: "/attendance", label: "الحضور والغياب", icon: <Target size={16} /> },
        { href: "/banks", label: "بنك الأسئلة", icon: <FileText size={16} /> },
        { href: "/content", label: "المكتبة التعليمية", icon: <Book size={16} /> },
      ],
    },
    { label: "متابعة الطلاب", items: [{ href: "/enrollments", label: "قائمة الطلاب", icon: <Users size={16} /> }] },
    {
      label: "النظام",
      items: [{ href: "/notifications", label: "الإشعارات", icon: <Bell size={16} /> }],
    },
    {
      label: "إعدادات الحساب",
      items: [{ href: "/settings/security", label: "الأمان", icon: <Shield size={16} /> }],
    },
  ],

  STUDENT: [
    { items: [{ href: "/dashboard", label: "الرئيسية", icon: <Home size={16} /> }] },
    {
      label: "دراستي",
      items: [
        { href: "/assessments", label: "الامتحانات", icon: <ClipboardList size={16} /> },
        { href: "/content", label: "المكتبة التعليمية", icon: <Book size={16} /> },
        { href: "/enrollments", label: "تسجيلي الدراسي", icon: <User size={16} /> },
      ],
    },
    {
      label: "النظام",
      items: [{ href: "/notifications", label: "الإشعارات", icon: <Bell size={16} /> }],
    },
  ],

  PARENT: [
    { items: [{ href: "/parent", label: "أبنائي", icon: <Users size={16} /> }] },
    { items: [{ href: "/notifications", label: "الإشعارات", icon: <Bell size={16} /> }] },
    {
      label: "إعدادات الحساب",
      items: [
        { href: "/settings/security", label: "الأمان", icon: <Shield size={16} /> },
        { href: "/settings/sessions", label: "الجلسات", icon: <Settings size={16} /> },
      ],
    },
  ],
};

export function Sidebar() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role) ?? "STUDENT";
  const tenantName = useAuthStore((s) => s.user?.tenant?.name);
  const groups = NAV_BY_ROLE[role];
  const { data: setup } = useSetupStatus();

  const STEP_BY_HREF: Record<string, string> = {
    "/grades": "grade",
    "/groups": "group",
    "/courses": "course",
    "/team": "teacher",
    "/teacher-assignments": "teacher_assignment",
    "/enrollments": "enrollment",
    "/terms": "term",
  };

  function isBlocked(href: string): boolean {
    if (!setup) return false;
    const key = STEP_BY_HREF[href];
    if (!key) return false;
    const step = setup.steps.find((s) => s.key === key);
    return !!step?.blocked_by;
  }

  return (
    <aside className="sticky top-0 flex flex-col w-64 h-screen shrink-0 border-e border-line bg-paper-elevated">
      <div className="px-5 py-5 border-b border-line">
        <div className="flex items-center gap-2">
          <span className="grid w-8 h-8 text-sm font-bold text-white rounded-lg place-items-center bg-ink dark:bg-accent dark:text-[#111827]">
            ت
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate font-display text-ink">
              منصة التعلم الذكية
            </p>
            {tenantName && (
              <p className="truncate text-[10px] text-ink-400">{tenantName}</p>
            )}
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? "mt-4" : ""}>
            {group.label && (
              <p className="mb-1 px-3 text-[11px] font-semibold text-ink-500">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                const blocked = isBlocked(item.href) && !active;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-accent/10 font-semibold text-accent-dark dark:bg-accent/15 dark:text-accent-light"
                        : "text-ink-700 hover:bg-paper-muted dark:text-ink-300"
                    }`}
                  >
                    <span
                      className={`shrink-0 ${
                        active ? "text-current" : "text-ink-400"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className="flex-1 font-medium truncate">{item.label}</span>
                    {blocked && (
                      <span className="text-xs opacity-50" title="أكمل الخطوات السابقة أولًا">
                        🔒
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 py-2 border-t border-line">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-ink-400">
            © {new Date().getFullYear()} منصة التعلم
          </p>
        </div>
      </div>
    </aside>
  );
}