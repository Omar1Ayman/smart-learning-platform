
"use client";

import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ListPage } from "@/components/ui/ListPage";
import { SortableTh } from "@/components/ui/SortableTh";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ViewToggle } from "@/components/ui/ViewToggle";

import { UserEditForm } from "@/components/users/UserEditForm";
import { UserForm } from "@/components/users/UserForm";

import { listCourses } from "@/lib/api/courses";
import {
  createUser,
  deleteUser,
  listUsers,
  updateUser,
  type UserUpdateInput,
} from "@/lib/api/users";

import { useCanWrite } from "@/lib/auth/useCanWrite";
import { useAuthStore } from "@/lib/auth/store";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useTableSort } from "@/lib/hooks/useTableSort";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { useViewMode } from "@/lib/hooks/useViewMode";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type { UserFormValues } from "@/lib/validation/schemas";

// ============================================================================
// Types
// ============================================================================

const PAGE_SIZE = 50;

type StaffRole = "OWNER" | "ADMIN" | "TEACHER";
type RoleFilter = StaffRole | "ALL";

interface TeamRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: StaffRole;
  is_active: boolean;
  assignments_count?: number;
}

interface MetricCardProps {
  label: string;
  value: number;
  description: string;
  icon: string;
  accent: "blue" | "green" | "violet";
}

// ============================================================================
// Constants
// ============================================================================

const ROLE_SHORT_LABELS: Record<StaffRole, string> = {
  OWNER: "مالك",
  ADMIN: "مسؤول",
  TEACHER: "معلّم",
};

const ROLE_STYLES: Record<StaffRole, string> = {
  OWNER:
    "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/20",
  ADMIN:
    "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/20",
  TEACHER:
    "bg-ink-50 text-ink-600 ring-1 ring-inset ring-line dark:bg-white/5 dark:text-ink-300",
};

// ============================================================================
// Small Components
// ============================================================================

function MetricCard({
  label,
  value,
  description,
  icon,
  accent,
}: MetricCardProps) {
  const accentStyles = {
    blue: {
      icon: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300",
      border: "hover:border-blue-200 dark:hover:border-blue-500/30",
    },
    green: {
      icon: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
      border: "hover:border-emerald-200 dark:hover:border-emerald-500/30",
    },
    violet: {
      icon: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300",
      border: "hover:border-violet-200 dark:hover:border-violet-500/30",
    },
  };

  const styles = accentStyles[accent];

  return (
    <div
      className={`card group min-w-0 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover ${styles.border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-400 sm:text-sm">
            {label}
          </p>

          <p className="mt-2 text-2xl font-bold tracking-tight text-ink tabular-nums sm:text-3xl">
            {value.toLocaleString("ar-EG")}
          </p>
        </div>

        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg transition-transform duration-200 group-hover:scale-110 ${styles.icon}`}
          aria-hidden="true"
        >
          {icon}
        </div>
      </div>

      <p className="mt-3 truncate text-[11px] text-ink-400 sm:text-xs">
        {description}
      </p>
    </div>
  );
}

function MemberAvatar({
  name,
  size = "normal",
}: {
  name: string;
  size?: "normal" | "large";
}) {
  const dimensions =
    size === "large" ? "h-12 w-12 text-base" : "h-10 w-10 text-sm";

  return (
    <div
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-ink to-ink-600 font-bold text-white shadow-sm ${dimensions}`}
    >
      {name.trim().charAt(0).toUpperCase() || "؟"}
    </div>
  );
}

function RoleBadge({ role }: { role: StaffRole }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${ROLE_STYLES[role]}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          role === "OWNER"
            ? "bg-violet-500"
            : role === "ADMIN"
              ? "bg-blue-500"
              : "bg-ink-400"
        }`}
      />
      {ROLE_SHORT_LABELS[role]}
    </span>
  );
}

function MemberStatus({ active }: { active: boolean }) {
  return (
    <StatusBadge
      variant={active ? "success" : "danger"}
      withDot
    >
      {active ? "نشط" : "معطّل"}
    </StatusBadge>
  );
}

function TeamSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="hidden md:block">
        <div className="flex gap-4 border-b border-line bg-ink-50/50 px-5 py-4">
          {[35, 15, 15, 15, 5].map((width, index) => (
            <div
              key={index}
              className="h-3 animate-pulse rounded bg-ink-100 dark:bg-white/10"
              style={{ width: `${width}%` }}
            />
          ))}
        </div>

        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-0"
          >
            <div className="h-10 w-10 animate-pulse rounded-xl bg-ink-100 dark:bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-36 animate-pulse rounded bg-ink-100 dark:bg-white/10" />
              <div className="h-2.5 w-48 animate-pulse rounded bg-ink-50 dark:bg-white/5" />
            </div>
            <div className="h-6 w-16 animate-pulse rounded-full bg-ink-100 dark:bg-white/10" />
            <div className="h-6 w-16 animate-pulse rounded-full bg-ink-100 dark:bg-white/10" />
            <div className="h-6 w-6 animate-pulse rounded bg-ink-100 dark:bg-white/10" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 p-3 md:hidden">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-xl border border-line p-3"
          >
            <div className="h-11 w-11 animate-pulse rounded-xl bg-ink-100 dark:bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-32 animate-pulse rounded bg-ink-100 dark:bg-white/10" />
              <div className="h-2.5 w-40 animate-pulse rounded bg-ink-50 dark:bg-white/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function TeamPage() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const canWrite = useCanWrite();
  const currentUser = useAuthStore((s) => s.user);

  // --------------------------------------------------------------------------
  // URL Filters
  // --------------------------------------------------------------------------

  const [searchUrl, setSearchUrl] = useUrlState("q", "");
  const [roleFilterStr, setRoleFilterStr] = useUrlState("role", "ALL");
  const [activeOnlyStr, setActiveOnlyStr] = useUrlState("active", "");
  const [courseFilter, setCourseFilter] = useUrlState("course", "");

  const validRoles: RoleFilter[] = [
    "ALL",
    "OWNER",
    "ADMIN",
    "TEACHER",
  ];

  const roleFilter: RoleFilter = validRoles.includes(
    roleFilterStr as RoleFilter,
  )
    ? (roleFilterStr as RoleFilter)
    : "ALL";

  const activeOnly = activeOnlyStr === "1";

  const [searchInput, setSearchInput] = useState(searchUrl);
  const debouncedSearch = useDebouncedValue(searchInput, 350);

  const [viewMode, setViewMode] = useViewMode("table");
  const { ordering, field: sortField, dir: sortDir, toggle: toggleSort } =
    useTableSort("role");

  useEffect(() => {
    setSearchInput(searchUrl);
  }, [searchUrl]);

  useEffect(() => {
    if (debouncedSearch !== searchUrl) {
      setSearchUrl(debouncedSearch);
    }
  }, [debouncedSearch, searchUrl, setSearchUrl]);

  // --------------------------------------------------------------------------
  // Courses
  // --------------------------------------------------------------------------

  const { data: courses } = useQuery({
    queryKey: ["courses"],
    queryFn: () => listCourses(),
    staleTime: 60_000,
  });

  const courseOptions = useMemo(
    () =>
      (courses?.results ?? [])
        .map((course) => ({
          value: course.id,
          label: `${course.grade_name} · ${course.subject_name} — ${course.name}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "ar")),
    [courses],
  );

  // --------------------------------------------------------------------------
  // Team Query
  // --------------------------------------------------------------------------

  const q = useInfiniteQuery({
    queryKey: [
      "team",
      "staff",
      debouncedSearch,
      roleFilter,
      activeOnly,
      courseFilter,
      ordering,
    ],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listUsers(undefined, {
        roleIn:
          roleFilter === "ALL"
            ? "OWNER,ADMIN,TEACHER"
            : roleFilter,
        page: pageParam,
        page_size: PAGE_SIZE,
        search: debouncedSearch || undefined,
        is_active: activeOnly ? true : undefined,
        course: courseFilter || undefined,
        ordering,
      }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.next ? allPages.length + 1 : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const allItems = useMemo(
    () =>
      (q.data?.pages ?? []).flatMap(
        (page) => page.results ?? [],
      ) as unknown as TeamRow[],
    [q.data],
  );

  const totalCount = q.data?.pages?.[0]?.count ?? 0;

  const remainingCount = Math.max(0, totalCount - allItems.length);

  const isRefreshing = q.isFetching && !q.isFetchingNextPage;

  // --------------------------------------------------------------------------
  // Permissions
  // --------------------------------------------------------------------------

  const isSelf = (user: TeamRow) => currentUser?.id === user.id;

  const canAssignRole = (role: StaffRole): boolean => {
    if (!currentUser) return false;

    if (currentUser.role === "OWNER") {
      return role === "ADMIN" || role === "TEACHER";
    }

    if (currentUser.role === "ADMIN") {
      return role === "TEACHER";
    }

    return false;
  };

  const canAct = (user: TeamRow) =>
    canWrite &&
    !isSelf(user) &&
    user.role !== "OWNER" &&
    canAssignRole(user.role);

  const rowInteractive = (user: TeamRow) =>
    user.role === "TEACHER" || canAct(user);

  // --------------------------------------------------------------------------
  // Modals and Actions
  // --------------------------------------------------------------------------

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TeamRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamRow | null>(null);

  const [busyDelete, setBusyDelete] = useState(false);
  const [busyToggleId, setBusyToggleId] = useState<string | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["team", "staff"],
    });

  async function handleCreate(values: UserFormValues) {
    const role = values.role as StaffRole;

    if (
      (role !== "ADMIN" && role !== "TEACHER") ||
      !canAssignRole(role)
    ) {
      throw new Error("دور غير صالح أو غير مسموح.");
    }

    await createUser({ ...values, role });

    await invalidate();

    toastSuccess("تمت إضافة العضو وإرسال دعوة تفعيل إلى بريده الإلكتروني");
    setCreateOpen(false);
  }

  async function handleUpdate(values: UserUpdateInput) {
    if (!editTarget || !canAct(editTarget)) return;

    await updateUser(editTarget.id, values);

    await invalidate();

    toastSuccess("تم تحديث بيانات العضو");
    setEditTarget(null);
  }

  async function handleToggleActive(user: TeamRow) {
    if (!canAct(user) || busyToggleId) return;

    setBusyToggleId(user.id);

    try {
      await updateUser(user.id, {
        is_active: !user.is_active,
      });

      await invalidate();

      toastSuccess(
        user.is_active
          ? "تم تعطيل العضو"
          : "تم تفعيل العضو",
      );
    } catch (error) {
      toastError(error, "تعذّر تحديث حالة العضو.");
    } finally {
      setBusyToggleId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || !canAct(deleteTarget)) return;

    setBusyDelete(true);

    try {
      await deleteUser(deleteTarget.id);

      await invalidate();

      toastSuccess("تم حذف العضو بنجاح");
      setDeleteTarget(null);
    } catch (error) {
      toastError(error, "تعذّر حذف العضو.");
    } finally {
      setBusyDelete(false);
    }
  }

  function handleRowActivate(user: TeamRow) {
    if (user.role === "TEACHER") {
      router.push(`/team/${user.id}`);
      return;
    }

    if (canAct(user)) {
      setEditTarget(user);
    }
  }

  function handleRowKeyDown(
    event: React.KeyboardEvent<HTMLTableRowElement | HTMLLIElement>,
    user: TeamRow,
  ) {
    if (!rowInteractive(user)) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleRowActivate(user);
    }
  }

  const rowActions = (user: TeamRow) => [
    ...(user.role === "TEACHER"
      ? [
          {
            label: "عرض الملف الشخصي",
            onClick: () => router.push(`/team/${user.id}`),
          },
        ]
      : []),

    {
      label: "تعديل البيانات",
      onClick: () => setEditTarget(user),
    },

    {
      label:
        busyToggleId === user.id
          ? "جارٍ التحديث..."
          : user.is_active
            ? "تعطيل العضو"
            : "تفعيل العضو",
      onClick: () => handleToggleActive(user),
    },

    {
      label: "حذف العضو",
      variant: "danger" as const,
      onClick: () => setDeleteTarget(user),
    },
  ];

  // --------------------------------------------------------------------------
  // Filters
  // --------------------------------------------------------------------------

  const filtersActive = Boolean(
    searchInput ||
      roleFilter !== "ALL" ||
      activeOnly ||
      courseFilter,
  );

  const clearFilters = () => {
    setSearchInput("");
    setSearchUrl("");
    setRoleFilterStr("ALL");
    setActiveOnlyStr("");
    setCourseFilter("");
  };

  const description =
    totalCount === 0
      ? "إدارة المعلمين والمسؤولين في مؤسستك التعليمية"
      : filtersActive
        ? `${totalCount.toLocaleString("ar-EG")} نتيجة مطابقة`
        : `${totalCount.toLocaleString("ar-EG")} عضو في الفريق`;

  // --------------------------------------------------------------------------
  // Tabs
  // --------------------------------------------------------------------------

  const tabs = [
    { key: "ALL", label: "الكل" },
    { key: "OWNER", label: "المالك" },
    { key: "ADMIN", label: "المسؤولون" },
    { key: "TEACHER", label: "المعلمون" },
  ];

  function handleTabChange(key: string) {
    setRoleFilterStr(key);

    if (key !== "TEACHER" && key !== "ALL") {
      setCourseFilter("");
    }
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <>
      <ListPage
        title="الفريق"
        description={description}
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-elevated px-2.5 py-1 text-[11px] font-semibold text-ink-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            إدارة الفريق
          </span>
        }
        actions={
          canWrite ? (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <Link href="/students" className="flex-1 sm:flex-none">
                <Button variant="secondary" block>
                  الطلاب ←
                </Button>
              </Link>

              <Button
                onClick={() => setCreateOpen(true)}
                block
              >
                <span className="me-1.5 text-lg leading-none">+</span>
                إضافة عضو
              </Button>
            </div>
          ) : undefined
        }
        tabs={tabs}
        activeTab={roleFilter}
        onTabChange={handleTabChange}
        searchable
        searchValue={searchInput}
        searchPlaceholder="ابحث بالاسم أو البريد الإلكتروني..."
        onSearchChange={setSearchInput}
        filters={[
          ...(roleFilter === "TEACHER" || roleFilter === "ALL"
            ? [
                {
                  key: "course",
                  label: "المقررات",
                  value: courseFilter,
                  options: courseOptions,
                  onChange: setCourseFilter,
                },
              ]
            : []),
          {
            key: "active",
            label: "الحالة",
            value: activeOnly ? "1" : "",
            options: [
              {
                value: "1",
                label: "النشطون فقط",
              },
            ],
            onChange: setActiveOnlyStr,
          },
        ]}
        hasActiveFilter={filtersActive}
        onClearFilters={clearFilters}
        isLoading={q.isLoading}
        isError={q.isError}
        errorMessage="تعذّر تحميل بيانات الفريق."
        onRetry={() => q.refetch()}
        isEmpty={totalCount === 0}
        emptyIcon="👥"
        emptyTitle={
          filtersActive
            ? "لا توجد نتائج مطابقة"
            : "ابدأ ببناء فريقك"
        }
        emptyDescription={
          filtersActive
            ? "لم نعثر على أعضاء بهذه المواصفات. جرّب تعديل البحث أو إزالة بعض الفلاتر."
            : "أضف المعلمين والمسؤولين وابدأ في إدارة مؤسستك التعليمية."
        }
        emptyAction={
          filtersActive ? (
            <Button variant="secondary" onClick={clearFilters}>
              مسح الفلاتر
            </Button>
          ) : canWrite ? (
            <Button onClick={() => setCreateOpen(true)}>
              + إضافة أول عضو
            </Button>
          ) : undefined
        }
      >
        {/* ================================================================
            Overview
        ================================================================= */}

        <section
          aria-label="ملخص نتائج الفريق"
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          <MetricCard
            label="إجمالي النتائج"
            value={totalCount}
            description="عدد الأعضاء المطابقين للفلاتر الحالية"
            icon="👥"
            accent="blue"
          />

          <MetricCard
            label="تم تحميلهم"
            value={allItems.length}
            description="الأعضاء المحمّلون حاليًا"
            icon="✓"
            accent="green"
          />

          <MetricCard
            label="متبقي للتحميل"
            value={remainingCount}
            description="الأعضاء الذين لم يتم تحميلهم بعد"
            icon="↧"
            accent="violet"
          />
        </section>

        {/* ================================================================
            Table Header
        ================================================================= */}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">
              أعضاء الفريق
            </h2>

            <p className="mt-1 text-xs text-ink-400">
              إدارة بيانات وصلاحيات أعضاء المؤسسة
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isRefreshing && (
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                تحديث النتائج...
              </span>
            )}

            <span className="rounded-lg bg-ink-50 px-3 py-1.5 text-xs font-semibold text-ink-600 dark:bg-white/5 dark:text-ink-300">
              {totalCount.toLocaleString("ar-EG")} عضو
            </span>

            <ViewToggle value={viewMode} onChange={setViewMode} />
          </div>
        </div>

        {/* ================================================================
            Loading
        ================================================================= */}

        {q.isLoading ? (
          <TeamSkeleton />
        ) : (
          <>
            {/* ============================================================
                Desktop Table
            ============================================================ */}

            <div className={viewMode === "cards" ? "hidden" : "card hidden overflow-hidden md:block"}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-sm">
                  <thead>
                    <tr className="border-b border-line bg-ink-50/70 text-ink-500 dark:bg-white/[0.025]">
                      <SortableTh
                        field="first_name"
                        sortField={sortField}
                        sortDir={sortDir}
                        onToggle={toggleSort}
                        className="px-5"
                      >
                        العضو
                      </SortableTh>

                      <SortableTh
                        field="role"
                        sortField={sortField}
                        sortDir={sortDir}
                        onToggle={toggleSort}
                      >
                        الدور
                      </SortableTh>

                      <th
                        scope="col"
                        className="px-4 py-4 text-start text-xs font-semibold"
                      >
                        التكليفات
                      </th>

                      <SortableTh
                        field="is_active"
                        sortField={sortField}
                        sortDir={sortDir}
                        onToggle={toggleSort}
                      >
                        الحالة
                      </SortableTh>

                      <th
                        scope="col"
                        className="w-14 px-3 py-4 text-center text-xs font-semibold"
                      >
                        <span className="sr-only">الإجراءات</span>
                        ⋯
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-line">
                    {allItems.map((user) => {
                      const fullName =
                        [user.first_name, user.last_name]
                          .filter(Boolean)
                          .join(" ") || "بدون اسم";

                      const interactive = rowInteractive(user);

                      return (
                        <tr
                          key={user.id}
                          onClick={() =>
                            interactive && handleRowActivate(user)
                          }
                          onKeyDown={(event) =>
                            handleRowKeyDown(event, user)
                          }
                          tabIndex={interactive ? 0 : undefined}
                          role={interactive ? "link" : undefined}
                          aria-label={
                            interactive
                              ? `فتح بيانات ${fullName}`
                              : undefined
                          }
                          className={`group transition-colors ${
                            interactive
                              ? "cursor-pointer hover:bg-ink-50/70 focus-visible:bg-ink-50/70 dark:hover:bg-white/[0.025]"
                              : "hover:bg-ink-50/40 dark:hover:bg-white/[0.015]"
                          }`}
                        >
                          {/* Member */}

                          <td className="px-5 py-4">
                            <div className="flex min-w-0 items-center gap-3">
                              <MemberAvatar name={fullName} />

                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="max-w-[230px] truncate font-semibold text-ink transition-colors group-hover:text-accent">
                                    {fullName}
                                  </p>

                                  {isSelf(user) && (
                                    <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent-dark dark:text-accent">
                                      أنت
                                    </span>
                                  )}
                                </div>

                                <p className="mt-1 max-w-[250px] truncate text-xs text-ink-400">
                                  {user.email}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Role */}

                          <td className="px-4 py-4">
                            <RoleBadge role={user.role} />
                          </td>

                          {/* Assignments */}

                          <td className="px-4 py-4">
                            {user.role === "TEACHER" ? (
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent/5 px-2.5 py-1.5 text-xs font-semibold text-accent-dark dark:text-accent">
                                <span aria-hidden="true">📚</span>
                                {(user.assignments_count ?? 0).toLocaleString("ar-EG")}
                                <span>مقرر</span>
                              </span>
                            ) : (
                              <span className="text-ink-300">—</span>
                            )}
                          </td>

                          {/* Status */}

                          <td className="px-4 py-4">
                            <MemberStatus active={user.is_active} />
                          </td>

                          {/* Actions */}

                          <td className="px-3 py-4">
                            <div
                              className="flex justify-center"
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => event.stopPropagation()}
                            >
                              {canAct(user) && (
                                <ActionMenu items={rowActions(user)} />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Table Footer */}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-ink-50/30 px-5 py-3 dark:bg-white/[0.015]">
                <p className="text-xs text-ink-400">
                  عرض{" "}
                  <span className="font-semibold text-ink">
                    {allItems.length.toLocaleString("ar-EG")}
                  </span>{" "}
                  من{" "}
                  <span className="font-semibold text-ink">
                    {totalCount.toLocaleString("ar-EG")}
                  </span>{" "}
                  عضو
                </p>

                {q.hasNextPage && (
                  <span className="text-xs text-ink-400">
                    توجد نتائج إضافية
                  </span>
                )}
              </div>
            </div>

            {/* ============================================================
                Mobile / Cards View
            ============================================================ */}

            <ul
              className={`flex flex-col gap-3 ${
                viewMode === "cards" ? "md:grid md:grid-cols-2 xl:grid-cols-3" : "md:hidden"
              }`}
            >
              {allItems.map((user) => {
                const fullName =
                  [user.first_name, user.last_name]
                    .filter(Boolean)
                    .join(" ") || "بدون اسم";

                const interactive = rowInteractive(user);

                return (
                  <li
                    key={user.id}
                    onClick={() =>
                      interactive && handleRowActivate(user)
                    }
                    onKeyDown={(event) =>
                      handleRowKeyDown(event, user)
                    }
                    tabIndex={interactive ? 0 : undefined}
                    role={interactive ? "link" : undefined}
                    aria-label={
                      interactive
                        ? `فتح بيانات ${fullName}`
                        : undefined
                    }
                    className={`card overflow-hidden p-4 transition-all ${
                      interactive
                        ? "cursor-pointer active:scale-[0.99] hover:border-ink-300"
                        : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <MemberAvatar name={fullName} size="large" />

                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-bold text-ink">
                            {fullName}
                          </p>

                          {isSelf(user) && (
                            <span className="shrink-0 rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent-dark dark:text-accent">
                              أنت
                            </span>
                          )}
                        </div>

                        <p
                          dir="ltr"
                          className="mt-1 truncate text-start text-xs text-ink-400"
                        >
                          {user.email}
                        </p>
                      </div>

                      {canAct(user) && (
                        <div
                          className="shrink-0"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <ActionMenu items={rowActions(user)} />
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                      <RoleBadge role={user.role} />

                      <MemberStatus active={user.is_active} />

                      {user.role === "TEACHER" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent/5 px-2.5 py-1 text-[11px] font-semibold text-accent-dark dark:text-accent">
                          📚
                          {(user.assignments_count ?? 0).toLocaleString("ar-EG")}
                          مقرر
                        </span>
                      )}
                    </div>

                    {interactive && (
                      <div className="mt-3 flex items-center justify-end gap-1 text-[11px] font-medium text-ink-400">
                        عرض التفاصيل
                        <span aria-hidden="true">←</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {/* ================================================================
            Load More
        ================================================================= */}

        {!q.isLoading && q.hasNextPage && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Button
              variant="secondary"
              onClick={() => q.fetchNextPage()}
              disabled={
                q.isFetchingNextPage ||
                q.isPlaceholderData
              }
            >
              {q.isFetchingNextPage ? (
                <>
                  <span className="me-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  جارٍ تحميل المزيد...
                </>
              ) : (
                `عرض المزيد (${remainingCount.toLocaleString("ar-EG")} متبقٍ)`
              )}
            </Button>

            <p className="text-xs text-ink-400">
              تم تحميل {allItems.length.toLocaleString("ar-EG")} من{" "}
              {totalCount.toLocaleString("ar-EG")} عضو
            </p>
          </div>
        )}

        {/* ================================================================
            Background Refresh Error
        ================================================================= */}

        {q.isError && q.data && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-500/20 dark:bg-red-500/5">
            <p className="text-xs text-red-700 dark:text-red-300">
              تعذّر تحديث بعض البيانات. قد تكون النتائج المعروضة قديمة.
            </p>

            <Button
              size="sm"
              variant="secondary"
              onClick={() => q.refetch()}
            >
              إعادة المحاولة
            </Button>
          </div>
        )}
      </ListPage>

      {/* ================================================================
          Create Modal
      ================================================================= */}

      {canWrite && (
        <QuickCreateModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          title="إضافة عضو جديد للفريق"
        >
          <UserForm
            onSubmit={handleCreate}
            onCancel={() => setCreateOpen(false)}
          />
        </QuickCreateModal>
      )}

      {/* ================================================================
          Edit Modal
      ================================================================= */}

      {canWrite && editTarget && (
        <QuickCreateModal
          open
          onClose={() => setEditTarget(null)}
          title="تعديل بيانات العضو"
        >
          <div className="mb-4 rounded-xl border border-line bg-ink-50/50 p-3 dark:bg-white/[0.025]">
            <p className="text-xs text-ink-400">
              العضو المحدد
            </p>

            <p className="mt-1 truncate text-sm font-semibold text-ink">
              {editTarget.email}
            </p>

            <div className="mt-2">
              <RoleBadge role={editTarget.role} />
            </div>
          </div>

          <UserEditForm
            onSubmit={handleUpdate}
            onCancel={() => setEditTarget(null)}
            initialValues={{
              email: editTarget.email,
              role: editTarget.role,
              first_name: editTarget.first_name,
              last_name: editTarget.last_name,
              is_active: editTarget.is_active,
            }}
          />
        </QuickCreateModal>
      )}

      {/* ================================================================
          Delete Confirmation
      ================================================================= */}

      <ConfirmDialog
        open={!!deleteTarget}
        title="تأكيد حذف عضو الفريق"
        description={
          deleteTarget
            ? `هل أنت متأكد من حذف "${deleteTarget.email}" نهائيًا؟ لا يمكن التراجع عن هذا الإجراء. إذا كنت تريد إيقافه مؤقتًا، يمكنك استخدام خيار التعطيل بدلًا من الحذف.`
            : ""
        }
        confirmLabel={
          busyDelete ? "جارٍ الحذف..." : "نعم، حذف نهائي"
        }
        cancelLabel="إلغاء"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => {
          if (!busyDelete) setDeleteTarget(null);
        }}
        isPending={busyDelete}
      />
    </>
  );
}
