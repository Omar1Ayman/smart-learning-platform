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
import { Upload } from "@/components/ui/icons";
import { UserEditForm } from "@/components/users/UserEditForm";
import { UserForm } from "@/components/users/UserForm";

import { listGrades } from "@/lib/api/grades";
import { listGroups } from "@/lib/api/groups";
import {
  createUser,
  deleteUser,
  listUsers,
  updateUser,
  type UserUpdateInput,
} from "@/lib/api/users";

import { useCanWrite } from "@/lib/auth/useCanWrite";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useTableSort } from "@/lib/hooks/useTableSort";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { useViewMode } from "@/lib/hooks/useViewMode";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type { UserFormValues } from "@/lib/validation/schemas";

const PAGE_SIZE = 50;

interface StudentRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  student_code?: string;
  parent_name?: string;
  parent_email?: string;
  parent_phone?: string;
  current_grade_name?: string | null;
  current_group_name?: string | null;
}

// ============================================================================
// Shared UI Components (نفس تصميم صفحة الفريق)
// ============================================================================

interface MetricCardProps {
  label: string;
  value: number;
  description: string;
  icon: string;
  accent: "blue" | "green" | "violet" | "amber";
}

function MetricCard({ label, value, description, icon, accent }: MetricCardProps) {
  const accentStyles = {
    blue: { icon: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300", border: "hover:border-blue-200 dark:hover:border-blue-500/30" },
    green: { icon: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300", border: "hover:border-emerald-200 dark:hover:border-emerald-500/30" },
    violet: { icon: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300", border: "hover:border-violet-200 dark:hover:border-violet-500/30" },
    amber: { icon: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300", border: "hover:border-amber-200 dark:hover:border-amber-500/30" },
  };

  const styles = accentStyles[accent];

  return (
    <div className={`card group min-w-0 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover ${styles.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-400 sm:text-sm">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-ink tabular-nums sm:text-3xl">
            {value.toLocaleString("ar-EG")}
          </p>
        </div>
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg transition-transform duration-200 group-hover:scale-110 ${styles.icon}`} aria-hidden="true">
          {icon}
        </div>
      </div>
      <p className="mt-3 truncate text-[11px] text-ink-400 sm:text-xs">{description}</p>
    </div>
  );
}

function MemberAvatar({ name, size = "normal" }: { name: string; size?: "normal" | "large" }) {
  const dimensions = size === "large" ? "h-12 w-12 text-base" : "h-10 w-10 text-sm";
  return (
    <div
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-ink to-ink-600 font-bold text-white shadow-sm ${dimensions}`}
    >
      {name.trim().charAt(0).toUpperCase() || "؟"}
    </div>
  );
}

function TeamSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="hidden md:block">
        <div className="flex gap-4 border-b border-line bg-ink-50/50 px-5 py-4">
          {[25, 15, 20, 20, 5].map((width, index) => (
            <div key={index} className="h-3 animate-pulse rounded bg-ink-100 dark:bg-white/10" style={{ width: `${width}%` }} />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-0">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-ink-100 dark:bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-36 animate-pulse rounded bg-ink-100 dark:bg-white/10" />
              <div className="h-2.5 w-48 animate-pulse rounded bg-ink-50 dark:bg-white/5" />
            </div>
            <div className="h-6 w-16 animate-pulse rounded-full bg-ink-100 dark:bg-white/10" />
            <div className="h-6 w-16 animate-pulse rounded-full bg-ink-100 dark:bg-white/10" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 p-3 md:hidden">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 rounded-xl border border-line p-3">
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

function getStudentName(student: StudentRow) {
  return [student.first_name, student.last_name].filter(Boolean).join(" ").trim() || "بدون اسم";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ar-EG").format(value);
}

// ============================================================================
// Main Page
// ============================================================================

export default function StudentsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const canWrite = useCanWrite();

  // --- Filters ---
  const [statusFilter, setStatusFilter] = useUrlState("status", "");
  const [gradeFilter, setGradeFilter] = useUrlState("grade", "");
  const [groupFilter, setGroupFilter] = useUrlState("group", "");
  const [searchUrl, setSearchUrl] = useUrlState("q", "");

  const [searchInput, setSearchInput] = useState(searchUrl);
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const [viewMode, setViewMode] = useViewMode("table");
  const { ordering, field: sortField, dir: sortDir, toggle: toggleSort } =
    useTableSort("first_name");

  useEffect(() => setSearchInput(searchUrl), [searchUrl]);
  useEffect(() => {
    if (debouncedSearch !== searchUrl) setSearchUrl(debouncedSearch);
  }, [debouncedSearch, searchUrl, setSearchUrl]);

  // --- Modals & Actions ---
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StudentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StudentRow | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [busyToggleId, setBusyToggleId] = useState<string | null>(null);

  // --- Grades & Groups ---
  const { data: grades } = useQuery({ queryKey: ["grades"], queryFn: () => listGrades() });
  const { data: groups } = useQuery({ queryKey: ["groups"], queryFn: () => listGroups() });

  const filteredGroups = useMemo(() => {
    if (!groups?.results) return [];
    if (!gradeFilter) return groups.results;
    return groups.results.filter((group) => group.grade === gradeFilter);
  }, [groups, gradeFilter]);

  // --- Query ---
  const q = useInfiniteQuery({
    queryKey: ["students", debouncedSearch, statusFilter, gradeFilter, groupFilter, ordering],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listUsers("STUDENT", {
        page: pageParam,
        page_size: PAGE_SIZE,
        search: debouncedSearch || undefined,
        is_active: statusFilter === "active" ? true : statusFilter === "inactive" ? false : undefined,
        grade: gradeFilter || undefined,
        group: groupFilter || undefined,
        ordering,
      }),
    getNextPageParam: (lastPage, allPages) => lastPage.next ? allPages.length + 1 : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const allItems = useMemo(
    () => (q.data?.pages ?? []).flatMap((page) => page.results ?? []) as unknown as StudentRow[],
    [q.data]
  );

  const totalCount = q.data?.pages?.[0]?.count ?? 0;
  const remainingCount = Math.max(0, totalCount - allItems.length);
  const isRefreshing = q.isFetching && !q.isFetchingNextPage;

  const loadedActiveCount = useMemo(() => allItems.filter((s) => s.is_active).length, [allItems]);
  const loadedInactiveCount = allItems.length - loadedActiveCount;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["students"] });

  // --- Actions ---
  function clearFilters() {
    setSearchInput("");
    setSearchUrl("");
    setStatusFilter("");
    setGradeFilter("");
    setGroupFilter("");
  }

  const hasActiveFilter = !!searchUrl || statusFilter !== "" || gradeFilter !== "" || groupFilter !== "";

  async function handleCreate(values: UserFormValues) {
    await createUser({ ...values, role: "STUDENT" });
    await invalidate();
    toastSuccess("تمت إضافة الطالب وإرسال دعوة تفعيل إلى بريده الإلكتروني");
    setCreateOpen(false);
  }

  async function handleUpdate(values: UserUpdateInput) {
    if (!editTarget) return;
    await updateUser(editTarget.id, values);
    await invalidate();
    toastSuccess("تم تحديث بيانات الطالب");
    setEditTarget(null);
  }

  async function handleToggleActive(student: StudentRow) {
    if (busyToggleId) return;
    setBusyToggleId(student.id);
    try {
      await updateUser(student.id, { is_active: !student.is_active });
      await invalidate();
      toastSuccess(student.is_active ? "تم تعطيل حساب الطالب" : "تم تفعيل حساب الطالب");
    } catch (error) {
      toastError(error, "تعذّر تحديث حالة الطالب.");
    } finally {
      setBusyToggleId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusyDelete(true);
    try {
      await deleteUser(deleteTarget.id);
      await invalidate();
      toastSuccess("تم حذف الطالب");
      setDeleteTarget(null);
    } catch (error) {
      toastError(error, "تعذّر حذف الطالب.");
    } finally {
      setBusyDelete(false);
    }
  }

  const rowActions = (student: StudentRow) => [
    { label: "عرض الملف", onClick: () => router.push(`/students/${student.id}`) },
    { label: "تعديل البيانات", onClick: () => setEditTarget(student) },
    { label: "بطاقة الطالب", onClick: () => router.push(`/students/${student.id}/card`) },
    {
      label: busyToggleId === student.id ? "جارٍ التحديث…" : student.is_active ? "تعطيل الحساب" : "تفعيل الحساب",
      onClick: () => handleToggleActive(student),
    },
    { label: "حذف الطالب", variant: "danger" as const, onClick: () => setDeleteTarget(student) },
  ];

  const description = q.isLoading
    ? "جارٍ تحميل بيانات الطلاب..."
    : totalCount > 0
      ? hasActiveFilter
        ? `${formatNumber(totalCount)} نتيجة مطابقة`
        : `${formatNumber(totalCount)} طالب مسجل`
      : "إدارة الطلاب وبياناتهم الأكاديمية وأولياء أمورهم";

  // --- Render ---
  return (
    <>
      <ListPage
        title="الطلاب"
        description={description}
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper-elevated px-2.5 py-1 text-[11px] font-semibold text-ink-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            إدارة الطلاب
          </span>
        }
        actions={
          canWrite ? (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <Link href="/settings/data" className="flex-1 sm:flex-none">
                <Button variant="secondary" block>
                  <Upload size={14} className="me-1.5" /> استيراد
                </Button>
              </Link>
              <Button onClick={() => setCreateOpen(true)} block>
                <span className="me-1.5 text-lg leading-none">+</span> إضافة طالب
              </Button>
            </div>
          ) : undefined
        }
        searchable
        searchValue={searchInput}
        searchPlaceholder="ابحث بالاسم أو البريد أو كود الطالب..."
        onSearchChange={setSearchInput}
        filters={[
          {
            key: "grade",
            label: "الصف الدراسي",
            value: gradeFilter,
            options: (grades?.results ?? []).map((g) => ({ value: g.id, label: g.name })),
            onChange: (v) => { setGradeFilter(v); setGroupFilter(""); },
          },
          {
            key: "group",
            label: "المجموعة",
            value: groupFilter,
            options: filteredGroups.map((g) => ({ value: g.id, label: g.name })),
            onChange: setGroupFilter,
          },
          {
            key: "status",
            label: "حالة الحساب",
            value: statusFilter,
            options: [{ value: "active", label: "نشط" }, { value: "inactive", label: "معطّل" }],
            onChange: setStatusFilter,
          },
        ]}
        hasActiveFilter={hasActiveFilter}
        onClearFilters={clearFilters}
        isLoading={q.isLoading}
        isError={q.isError && !q.data}
        errorMessage="تعذّر تحميل بيانات الطلاب."
        onRetry={() => q.refetch()}
        isEmpty={!q.isLoading && totalCount === 0}
        emptyIcon="🎓"
        emptyTitle={hasActiveFilter ? "لا توجد نتائج مطابقة" : "ابدأ بإضافة الطلاب"}
        emptyDescription={hasActiveFilter ? "لم نعثر على طلاب بهذه المواصفات. جرّب تعديل البحث." : "أضف الطلاب يدويًا أو استورد بياناتهم من ملف Excel."}
        emptyAction={
          hasActiveFilter ? (
            <Button variant="secondary" onClick={clearFilters}>مسح الفلاتر</Button>
          ) : canWrite ? (
            <Button onClick={() => setCreateOpen(true)}>+ إضافة أول طالب</Button>
          ) : undefined
        }
      >
        {/* 🌟 Overview Cards (مطابقة لصفحة الفريق) */}
        <section aria-label="ملخص الطلاب" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-2">
          <MetricCard label="إجمالي النتائج" value={totalCount} description="عدد الطلاب المطابقين للفلاتر" icon="🎓" accent="blue" />
          <MetricCard label="تم تحميلهم" value={allItems.length} description="الطلاب المحمّلون حاليًا" icon="📋" accent="green" />
          <MetricCard label="حسابات نشطة" value={loadedActiveCount} description="من الطلاب المحمّلين حاليًا" icon="✓" accent="violet" />
          <MetricCard label="حسابات معطّلة" value={loadedInactiveCount} description="من الطلاب المحمّلين حاليًا" icon="⏸" accent="amber" />
        </section>

        {/* Table Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">قائمة الطلاب</h2>
            <p className="mt-1 text-xs text-ink-400">بيانات الطلاب المسجلين وإدارة حساباتهم</p>
          </div>
          <div className="flex items-center gap-2">
            {isRefreshing && (
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                تحديث النتائج...
              </span>
            )}
            <span className="rounded-lg bg-ink-50 px-3 py-1.5 text-xs font-semibold text-ink-600 dark:bg-white/5 dark:text-ink-300">
              {formatNumber(totalCount)} طالب
            </span>
            <ViewToggle value={viewMode} onChange={setViewMode} />
          </div>
        </div>

        {/* Loading */}
        {q.isLoading ? (
          <TeamSkeleton />
        ) : (
          <>
            {/* Desktop Table */}
            <div className={viewMode === "cards" ? "hidden" : "card hidden overflow-hidden md:block"}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-sm">
                  <thead>
                    <tr className="border-b border-line bg-ink-50/70 text-ink-500 dark:bg-white/[0.025]">
                      <SortableTh field="first_name" sortField={sortField} sortDir={sortDir} onToggle={toggleSort} className="px-5">
                        الطالب
                      </SortableTh>
                      <SortableTh field="student_code" sortField={sortField} sortDir={sortDir} onToggle={toggleSort}>
                        الكود
                      </SortableTh>
                      <SortableTh field="_grade_name" sortField={sortField} sortDir={sortDir} onToggle={toggleSort}>
                        الصف والمجموعة
                      </SortableTh>
                      <th scope="col" className="px-4 py-4 text-start text-xs font-semibold">ولي الأمر</th>
                      <SortableTh field="is_active" sortField={sortField} sortDir={sortDir} onToggle={toggleSort}>
                        الحالة
                      </SortableTh>
                      <th scope="col" className="w-14 px-3 py-4 text-center text-xs font-semibold">⋯</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {allItems.map((student) => {
                      const fullName = getStudentName(student);
                      return (
                        <tr
                          key={student.id}
                          onClick={() => router.push(`/students/${student.id}`)}
                          tabIndex={0}
                          role="link"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              router.push(`/students/${student.id}`);
                            }
                          }}
                          className="group cursor-pointer transition-colors hover:bg-ink-50/70 focus-visible:bg-ink-50/70 dark:hover:bg-white/[0.025]"
                        >
                          {/* Student */}
                          <td className="px-5 py-4">
                            <div className="flex min-w-0 items-center gap-3">
                              <MemberAvatar name={fullName} />
                              <div className="min-w-0">
                                <p className="max-w-[230px] truncate font-semibold text-ink transition-colors group-hover:text-accent">
                                  {fullName}
                                </p>
                                <p dir="ltr" className="mt-1 max-w-[250px] truncate text-start text-xs text-ink-400">
                                  {student.email}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Code */}
                          <td className="px-4 py-4">
                            {student.student_code ? (
                              <span className="inline-flex rounded-lg bg-ink-50 px-2.5 py-1.5 font-mono text-xs font-medium text-ink-700">
                                {student.student_code}
                              </span>
                            ) : (
                              <span className="text-ink-300">—</span>
                            )}
                          </td>

                          {/* Grade & Group */}
                          <td className="px-4 py-4">
                            {student.current_grade_name || student.current_group_name ? (
                              <div className="flex flex-col gap-1">
                                {student.current_grade_name && (
                                  <span className="font-medium text-ink-700">{student.current_grade_name}</span>
                                )}
                                {student.current_group_name && (
                                  <span className="text-xs text-ink-400">{student.current_group_name}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-ink-300">غير محدد</span>
                            )}
                          </td>

                          {/* Parent */}
                          <td className="px-4 py-4">
                            {student.parent_name || student.parent_email || student.parent_phone ? (
                              <div className="flex max-w-[190px] flex-col gap-1">
                                {student.parent_name && <span className="truncate text-xs font-medium text-ink-700">{student.parent_name}</span>}
                                {student.parent_email && <span dir="ltr" className="truncate text-start text-xs text-ink-400">{student.parent_email}</span>}
                                {student.parent_phone && <span dir="ltr" className="text-start text-xs text-ink-400">{student.parent_phone}</span>}
                              </div>
                            ) : (
                              <span className="text-xs text-ink-300">غير مسجل</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-4">
                            <StatusBadge variant={student.is_active ? "success" : "danger"} withDot>
                              {student.is_active ? "نشط" : "معطّل"}
                            </StatusBadge>
                          </td>

                          {/* Actions */}
                          <td className="px-3 py-4">
                            <div className="flex justify-center" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                              {canWrite && <ActionMenu items={rowActions(student)} />}
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
                  عرض <span className="font-semibold text-ink">{formatNumber(allItems.length)}</span> من <span className="font-semibold text-ink">{formatNumber(totalCount)}</span> طالب
                </p>
                {q.hasNextPage && <span className="text-xs text-ink-400">توجد نتائج إضافية</span>}
              </div>
            </div>

            {/* Mobile / Cards View */}
            <ul
              className={`flex flex-col gap-3 ${
                viewMode === "cards" ? "md:grid md:grid-cols-2 xl:grid-cols-3" : "md:hidden"
              }`}
            >
              {allItems.map((student) => {
                const fullName = getStudentName(student);
                return (
                  <li
                    key={student.id}
                    onClick={() => router.push(`/students/${student.id}`)}
                    className="card overflow-hidden p-4 cursor-pointer transition-all active:scale-[0.99] hover:border-ink-300"
                  >
                    <div className="flex items-start gap-3">
                      <MemberAvatar name={fullName} size="large" />
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="truncate text-sm font-bold text-ink">{fullName}</p>
                        <p dir="ltr" className="mt-1 truncate text-start text-xs text-ink-400">{student.email}</p>
                        {student.student_code && <p className="mt-1 font-mono text-[11px] text-ink-500">{student.student_code}</p>}
                      </div>
                      {canWrite && (
                        <div className="shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                          <ActionMenu items={rowActions(student)} />
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                      <StatusBadge variant={student.is_active ? "success" : "danger"} withDot>
                        {student.is_active ? "نشط" : "معطّل"}
                      </StatusBadge>
                      {student.current_grade_name && (
                        <span className="inline-flex items-center rounded-lg bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent-dark">
                          {student.current_grade_name}
                        </span>
                      )}
                      {student.current_group_name && (
                        <span className="inline-flex items-center rounded-lg bg-ink-50 px-2.5 py-1 text-[11px] text-ink-600">
                          {student.current_group_name}
                        </span>
                      )}
                    </div>

                    {(student.parent_name || student.parent_email || student.parent_phone) && (
                      <div className="mt-3 rounded-xl bg-ink-50/70 p-3">
                        <p className="mb-2 text-[11px] font-semibold text-ink-500">بيانات ولي الأمر</p>
                        {student.parent_name && <p className="text-xs font-medium text-ink-700">{student.parent_name}</p>}
                        {student.parent_email && <p dir="ltr" className="mt-1 break-all text-start text-xs text-ink-500">{student.parent_email}</p>}
                        {student.parent_phone && <p dir="ltr" className="mt-1 text-start text-xs text-ink-500">{student.parent_phone}</p>}
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-end gap-1 text-[11px] font-medium text-ink-400">
                      عرض التفاصيل <span aria-hidden="true">←</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {/* Load More */}
        {!q.isLoading && q.hasNextPage && (
          <div className="flex flex-col items-center gap-3 py-4 mt-4">
            <Button variant="secondary" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage || q.isPlaceholderData}>
              {q.isFetchingNextPage ? (
                <><span className="me-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> جارٍ تحميل المزيد...</>
              ) : (
                `عرض المزيد (${formatNumber(remainingCount)} متبقٍ)`
              )}
            </Button>
            <p className="text-xs text-ink-400">
              تم تحميل {formatNumber(allItems.length)} من {formatNumber(totalCount)} طالب
            </p>
          </div>
        )}

        {/* Background Refresh Error */}
        {q.isError && q.data && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-500/20 dark:bg-red-500/5">
            <p className="text-xs text-red-700 dark:text-red-300">تعذّر تحديث بعض البيانات. قد تكون النتائج المعروضة قديمة.</p>
            <Button size="sm" variant="secondary" onClick={() => q.refetch()}>إعادة المحاولة</Button>
          </div>
        )}
      </ListPage>

      {/* Modals */}
      {canWrite && (
        <QuickCreateModal open={createOpen} onClose={() => setCreateOpen(false)} title="إضافة طالب جديد">
          <UserForm onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} fixedRole="STUDENT" />
        </QuickCreateModal>
      )}

      {canWrite && editTarget && (
        <QuickCreateModal open onClose={() => setEditTarget(null)} title="تعديل بيانات الطالب">
          <div className="mb-4 rounded-xl border border-line bg-ink-50/50 p-3 dark:bg-white/[0.025]">
            <p className="text-xs text-ink-400">الطالب المحدد</p>
            <p className="mt-1 truncate text-sm font-semibold text-ink">{editTarget.email}</p>
            <div className="mt-2">
              <StatusBadge variant={editTarget.is_active ? "success" : "danger"} withDot>
                {editTarget.is_active ? "نشط" : "معطّل"}
              </StatusBadge>
            </div>
          </div>
          <UserEditForm
            onSubmit={handleUpdate}
            onCancel={() => setEditTarget(null)}
            initialValues={{
              email: editTarget.email,
              role: "STUDENT",
              first_name: editTarget.first_name,
              last_name: editTarget.last_name,
              is_active: editTarget.is_active,
              parent_name: editTarget.parent_name,
              parent_email: editTarget.parent_email,
              parent_phone: editTarget.parent_phone,
            }}
          />
        </QuickCreateModal>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="تأكيد حذف الطالب"
        description={deleteTarget ? `هل أنت متأكد من حذف الطالب "${getStudentName(deleteTarget)}"؟ هذا الإجراء قد يؤثر على سجلاته ومحاولاته.` : ""}
        confirmLabel={busyDelete ? "جارٍ الحذف..." : "حذف الطالب"}
        cancelLabel="إلغاء"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        isPending={busyDelete}
      />
    </>
  );
}