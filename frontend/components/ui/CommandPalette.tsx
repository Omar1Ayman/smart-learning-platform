"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Award,
  BarChart,
  Bell,
  Book,
  ClipboardList,
  GraduationCap,
  Home,
  Plus,
  Search,
  Settings,
  User,
  Users,
} from "@/components/ui/icons";
import { listCourses } from "@/lib/api/courses";
import { listStaffAssessments } from "@/lib/api/assessments";
import { listUsers } from "@/lib/api/users";
import { useAuthStore } from "@/lib/auth/store";
import { useCommandPalette } from "@/lib/hooks/useCommandPalette";
import { useKeyboardShortcut } from "@/lib/hooks/useKeyboardShortcut";
import type { Role } from "@/types";

type Category = {
  heading: string;
  items: CommandItem[];
};

type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  onSelect: () => void;
  keywords?: string;
};

const NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: React.ReactNode;
  roles: Role[];
}> = [
  { href: "/dashboard", label: "لوحة التحكم", icon: <Home size={16} />, roles: ["OWNER", "ADMIN", "TEACHER", "STUDENT"] },
  { href: "/assessments", label: "الامتحانات", icon: <ClipboardList size={16} />, roles: ["OWNER", "ADMIN", "TEACHER", "STUDENT"] },
  { href: "/courses", label: "المواد الدراسية", icon: <Book size={16} />, roles: ["OWNER", "ADMIN"] },
  { href: "/stages", label: "المراحل", icon: <GraduationCap size={16} />, roles: ["OWNER", "ADMIN"] },
  { href: "/grades", label: "الصفوف", icon: <GraduationCap size={16} />, roles: ["OWNER", "ADMIN"] },
  { href: "/groups", label: "المجموعات", icon: <Users size={16} />, roles: ["OWNER", "ADMIN"] },
  { href: "/subjects", label: "المواد", icon: <Book size={16} />, roles: ["OWNER", "ADMIN"] },
  { href: "/academic-years", label: "السنوات الدراسية", icon: <Award size={16} />, roles: ["OWNER", "ADMIN", "TEACHER"] },
  { href: "/terms", label: "الترمات", icon: <Award size={16} />, roles: ["OWNER", "ADMIN"] },
  { href: "/content", label: "المحتوى", icon: <Book size={16} />, roles: ["OWNER", "ADMIN", "TEACHER", "STUDENT"] },
  { href: "/questions", label: "الأسئلة", icon: <ClipboardList size={16} />, roles: ["OWNER", "ADMIN", "TEACHER"] },
  { href: "/team", label: "الفريق", icon: <Users size={16} />, roles: ["OWNER", "ADMIN"] },
  { href: "/enrollments", label: "التسجيلات", icon: <User size={16} />, roles: ["OWNER", "ADMIN", "TEACHER", "STUDENT"] },
  { href: "/teacher-assignments", label: "تكليفات المعلمين", icon: <Users size={16} />, roles: ["OWNER", "ADMIN"] },
  { href: "/notifications", label: "الإشعارات", icon: <Bell size={16} />, roles: ["OWNER", "ADMIN", "TEACHER", "STUDENT"] },
  { href: "/settings/security", label: "الأمان", icon: <Settings size={16} />, roles: ["OWNER", "ADMIN", "TEACHER", "STUDENT"] },
  { href: "/settings/tenant", label: "إعدادات المؤسسة", icon: <Settings size={16} />, roles: ["OWNER"] },
  { href: "/settings/audit", label: "سجل الأحداث", icon: <BarChart size={16} />, roles: ["OWNER", "ADMIN", "TEACHER"] },
];

export function CommandPalette() {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const canViewAuditLog = useAuthStore((s) => s.user?.can_view_audit_log);
  const { open, closePalette, togglePalette } = useCommandPalette();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Global Cmd+K / Ctrl+K
  useKeyboardShortcut("k", togglePalette, { meta: true });

  // Fetch data only when palette is open
  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => listUsers(),
    enabled: open,
  });
  const { data: courses } = useQuery({
    queryKey: ["courses"],
    queryFn: () => listCourses(),
    enabled: open && (role === "OWNER" || role === "ADMIN"),
  });
  const { data: assessments } = useQuery({
    queryKey: ["staff-assessments"],
    queryFn: () => listStaffAssessments(),
    enabled: open && (role === "OWNER" || role === "ADMIN" || role === "TEACHER"),
  });

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
    } else {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePalette();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closePalette]);

  const navigate = useCallback(
    (path: string) => {
      closePalette();
      router.push(path);
    },
    [closePalette, router]
  );

  const categories: Category[] = useMemo(() => {
    const q = query.trim().toLowerCase();

    // ----- Navigation -----
    const navItems: CommandItem[] = NAV_ITEMS.filter((n) =>
      n.href === "/settings/audit"
        ? canViewAuditLog === true
        : role
          ? n.roles.includes(role)
          : false
    ).map((n) => ({
      id: `nav-${n.href}`,
      label: n.label,
      icon: n.icon,
      onSelect: () => navigate(n.href),
      keywords: n.href,
    }));

    // ----- Quick Create (role-dependent) -----
    const createItems: CommandItem[] = [];
    if (role === "OWNER" || role === "ADMIN") {
      createItems.push(
        { id: "create-stage", label: "إضافة مرحلة", icon: <Plus size={16} />, onSelect: () => navigate("/stages?create=1") },
        { id: "create-grade", label: "إضافة صف", icon: <Plus size={16} />, onSelect: () => navigate("/grades?create=1") },
        { id: "create-subject", label: "إضافة مادة", icon: <Plus size={16} />, onSelect: () => navigate("/subjects?create=1") },
        { id: "create-group", label: "إضافة مجموعة", icon: <Plus size={16} />, onSelect: () => navigate("/groups?create=1") },
        { id: "create-course", label: "إضافة مادة دراسية", icon: <Plus size={16} />, onSelect: () => navigate("/courses?create=1") },
        { id: "create-user", label: "إضافة عضو للفريق", icon: <Plus size={16} />, onSelect: () => navigate("/team?create=1") },
      );
    }
    if (role === "OWNER" || role === "ADMIN" || role === "TEACHER") {
      createItems.push({
        id: "create-assessment",
        label: "إنشاء امتحان",
        icon: <Plus size={16} />,
        onSelect: () => navigate("/assessments/new"),
      });
    }

    // ----- Students (search by name/email) -----
    const students: CommandItem[] =
      role === "OWNER" || role === "ADMIN" || role === "TEACHER"
        ? (users?.results ?? [])
            .filter((u) => u.role === "STUDENT")
            .filter((u) => !q || `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(q))
            .slice(0, 5)
            .map((u) => ({
              id: `student-${u.id}`,
              label:
                [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
                u.email,
              hint: u.email,
              icon: <User size={16} />,
              onSelect: () => navigate(`/students/${u.id}`),
              keywords: u.email,
            }))
        : [];

    // ----- Teachers -----
    const teachers: CommandItem[] =
      role === "OWNER" || role === "ADMIN"
        ? (users?.results ?? [])
            .filter((u) => u.role === "TEACHER")
            .filter((u) => !q || `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(q))
            .slice(0, 5)
            .map((u) => ({
              id: `teacher-${u.id}`,
              label:
                [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
                u.email,
              hint: u.email,
              icon: <Users size={16} />,
              onSelect: () => navigate(`/team/${u.id}`),
              keywords: u.email,
            }))
        : [];

    // ----- Courses -----
    const courseItems: CommandItem[] = (courses?.results ?? [])
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.subject_name ?? "").toLowerCase().includes(q))
      .slice(0, 5)
      .map((c) => ({
        id: `course-${c.id}`,
        label: c.name,
        hint: `${c.grade_name} · ${c.subject_name}`,
        icon: <Book size={16} />,
        onSelect: () => navigate(`/courses/${c.id}`),
        keywords: `${c.subject_name} ${c.grade_name}`,
      }));

    // ----- Assessments -----
    const assessmentItems: CommandItem[] = (assessments?.results ?? [])
      .filter((a) => !q || a.title.toLowerCase().includes(q))
      .slice(0, 5)
      .map((a) => ({
        id: `assessment-${a.id}`,
        label: a.title,
        hint: a.status === "DRAFT" ? "مسودة" : "منشور",
        icon: <ClipboardList size={16} />,
        onSelect: () => navigate(`/assessments/${a.id}/edit`),
      }));

    function filterItems(items: CommandItem[]) {
      if (!q) return items;
      return items.filter(
        (i) =>
          i.label.toLowerCase().includes(q) ||
          (i.keywords ?? "").toLowerCase().includes(q) ||
          (i.hint ?? "").toLowerCase().includes(q)
      );
    }

    const out: Category[] = [];

    const filteredNav = filterItems(navItems);
    if (filteredNav.length > 0) {
      out.push({ heading: "التنقل", items: filteredNav });
    }
    const filteredCreate = filterItems(createItems);
    if (filteredCreate.length > 0) {
      out.push({ heading: "إجراءات سريعة", items: filteredCreate });
    }
    if (students.length > 0) out.push({ heading: "الطلاب", items: students });
    if (teachers.length > 0) out.push({ heading: "المعلمون", items: teachers });
    if (courseItems.length > 0) out.push({ heading: "المواد الدراسية", items: courseItems });
    if (assessmentItems.length > 0) out.push({ heading: "الامتحانات", items: assessmentItems });

    return out;
  }, [query, role, canViewAuditLog, users, courses, assessments, navigate]);

  const flatItems = useMemo(() => categories.flatMap((c) => c.items), [categories]);

  // Clamp active index when results change
  useEffect(() => {
    if (activeIndex >= flatItems.length) {
      setActiveIndex(Math.max(0, flatItems.length - 1));
    }
  }, [flatItems.length, activeIndex]);

  // Scroll active item into view
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>(
      `[data-cmd-index="${activeIndex}"]`
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      flatItems[activeIndex]?.onSelect();
    }
  }

  if (!open || typeof document === "undefined") return null;

  // Flatten with index for keyboard nav
  let flatIdx = 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[50] flex items-start justify-center bg-black/40 p-4 pt-[10vh] backdrop-blur-sm"
      onClick={closePalette}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-2xl overflow-hidden border bg-paper-elevated rounded-card-lg border-line shadow-modal animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
          <Search size={18} className="text-ink-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="ابحث عن صفحة، طالب، كورس، أو امتحان..."
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-ink-400"
          />
          <kbd className="hidden rounded border border-line bg-paper-muted px-1.5 py-0.5 text-[10px] font-mono text-ink-400 sm:inline-block">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
          {categories.length === 0 ? (
            <div className="px-4 py-8 text-sm text-center text-ink-400">
              <Search size={32} className="mx-auto mb-2 text-ink-300" />
              {query ? "لا توجد نتائج مطابقة" : "ابحث أو اختر إجراءً"}
            </div>
          ) : (
            categories.map((cat) => (
              <div key={cat.heading} className="px-2 py-1">
                <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-ink-400">
                  {cat.heading}
                </p>
                {cat.items.map((item) => {
                  const idx = flatIdx++;
                  const active = idx === activeIndex;
                  return (
                    <button
                      key={item.id}
                      data-cmd-index={idx}
                      onClick={item.onSelect}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm transition-colors ${
                        active
                          ? "bg-ink text-white dark:bg-accent dark:text-[#111827]"
                          : "text-ink hover:bg-paper-muted"
                      }`}
                    >
                      <span className={active ? "text-white" : "text-ink-400"}>
                        {item.icon}
                      </span>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.hint && (
                        <span
                          className={`truncate text-xs ${
                            active ? "text-white/70" : "text-ink-400"
                          }`}
                        >
                          {item.hint}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-line bg-paper-muted px-4 py-2 text-[11px] text-ink-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-line bg-paper-elevated px-1 py-0.5 font-mono">↑</kbd>
              <kbd className="rounded border border-line bg-paper-elevated px-1 py-0.5 font-mono">↓</kbd>
              للتنقل
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-line bg-paper-elevated px-1 py-0.5 font-mono">↵</kbd>
              للفتح
            </span>
          </div>
          <span>اضغط ⌘K أو Ctrl+K في أي وقت</span>
        </div>
      </div>
    </div>,
    document.body
  );
}