"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { AssignmentCard } from "@/components/teacher-assignments/AssignmentCard";
import { TeacherAssignmentForm } from "@/components/teacher-assignments/TeacherAssignmentForm";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageShell } from "@/components/ui/PageShell";
import { EmptyState } from "@/components/ui/States";
import { Search, X } from "@/components/ui/icons";
import { listCourses } from "@/lib/api/courses";
import {
  createTeacherAssignment,
  deleteTeacherAssignment,
  listTeacherAssignments,
  updateTeacherAssignment,
  type TeacherAssignment,
} from "@/lib/api/teacherAssignments";
import { listUsers } from "@/lib/api/users";
import { useCanWrite } from "@/lib/auth/useCanWrite";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useUrlState } from "@/lib/hooks/useUrlState";
import {
  showResponseWarnings,
  toastError,
  toastSuccess,
} from "@/lib/utils/toast";
import type { TeacherAssignmentFormValues } from "@/lib/validation/schemas";

const PAGE_SIZE = 20;

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "-created_at", label: "الأحدث أولاً" },
  { value: "created_at", label: "الأقدم أولاً" },
  { value: "teacher__email", label: "المعلم (أ-ي)" },
  { value: "course__name", label: "المادة (أ-ي)" },
];

type ViewMode = "grid" | "table";
const VIEW_STORAGE_KEY = "teacher_assignments_view_mode";

export default function TeacherAssignmentsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canWrite = useCanWrite();

  // ---- URL state ----
  const [page, setPage] = useUrlState("p", "1");
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const [teacherFilter, setTeacherFilter] = useUrlState("teacher", "");
  const [courseFilter, setCourseFilter] = useUrlState("course", "");
  const [sort, setSort] = useUrlState("sort", "-created_at");
  const [searchUrl, setSearchUrl] = useUrlState("q", "");

  const [searchInput, setSearchInput] = useState(searchUrl);
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  useEffect(() => {
    if (debouncedSearch !== searchUrl) setSearchUrl(debouncedSearch);
  }, [debouncedSearch, searchUrl, setSearchUrl]);

  // ---- View mode ----
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "grid";
    return (localStorage.getItem(VIEW_STORAGE_KEY) as ViewMode) || "grid";
  });
  function changeViewMode(v: ViewMode) {
    setViewMode(v);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  }

  // ---- Modals ----
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TeacherAssignment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeacherAssignment | null>(
    null,
  );
  const [busyDelete, setBusyDelete] = useState(false);

  // ---- Lookups ----
  const { data: teachers } = useQuery({
    queryKey: ["users", "TEACHER"],
    queryFn: () => listUsers("TEACHER"),
  });
  const { data: courses } = useQuery({
    queryKey: ["courses"],
    queryFn: () => listCourses(),
  });

  // ---- Main query ----
  const q = useQuery({
    queryKey: [
      "teacher-assignments",
      pageNum,
      debouncedSearch,
      teacherFilter,
      courseFilter,
      sort,
    ],
    queryFn: () =>
      listTeacherAssignments({
        page: pageNum,
        page_size: PAGE_SIZE,
        search: debouncedSearch || undefined,
        teacher: teacherFilter || undefined,
        course: courseFilter || undefined,
        ordering: sort,
      }),
  });

  const items = q.data?.results ?? [];
  const total = q.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["teacher-assignments"] });

  const hasActiveFilter =
    !!searchInput ||
    teacherFilter !== "" ||
    courseFilter !== "" ||
    sort !== "-created_at";

  function clearFilters() {
    setSearchInput("");
    setSearchUrl("");
    setTeacherFilter("");
    setCourseFilter("");
    setSort("-created_at");
    setPage("1");
  }

  // ---- CRUD ----
  async function handleCreate(values: TeacherAssignmentFormValues) {
    try {
      const created = await createTeacherAssignment(values);
      showResponseWarnings(created);
      await invalidate();
      toastSuccess("تمت إضافة التكليف");
      setCreateOpen(false);
      setPage("1");
    } catch (err) {
      toastError(err, "تعذّرت إضافة التكليف.");
      throw err;
    }
  }

  async function handleUpdate(values: TeacherAssignmentFormValues) {
    if (!editTarget) return;
    try {
      const updated = await updateTeacherAssignment(editTarget.id, {
        teacher: values.teacher,
        course: values.course,
        groups: values.groups,
      });
      showResponseWarnings(updated);
      await invalidate();
      toastSuccess("تم تحديث التكليف");
      setEditTarget(null);
    } catch (err) {
      toastError(err, "تعذّر تحديث التكليف.");
      throw err;
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusyDelete(true);
    try {
      await deleteTeacherAssignment(deleteTarget.id);
      await invalidate();
      toastSuccess("تم حذف التكليف");
      setDeleteTarget(null);
    } catch (err) {
      toastError(err, "تعذّر حذف التكليف.");
    } finally {
      setBusyDelete(false);
    }
  }

  function buildActions(a: TeacherAssignment): ActionMenuItem[] {
    if (!canWrite) {
      return [
        {
          label: "تفاصيل المعلم",
          onClick: () => router.push(`/team/${a.teacher}`),
        },
      ];
    }
    return [
      {
        label: "تفاصيل المعلم",
        onClick: () => router.push(`/team/${a.teacher}`),
      },
      {
        label: "تفاصيل المادة",
        onClick: () => router.push(`/courses/${a.course}`),
      },
      { label: "تعديل المجموعات", onClick: () => setEditTarget(a) },
      {
        label: "حذف",
        variant: "danger" as const,
        onClick: () => setDeleteTarget(a),
      },
    ];
  }

  return (
    <>
      <PageShell
        title="تكليفات المعلمين"
        description={
          total > 0
            ? `${total} تكليف — من يُدرِّس ماذا وفي أي مجموعات`
            : "اربط معلمًا بكورس ليُحدَّد نطاق ما يراه من طلاب ونتائج."
        }
        isLoading={q.isLoading}
        isError={q.isError}
        errorMessage="تعذّر تحميل التكليفات."
        onRetry={() => q.refetch()}
        loadingVariant="cards"
        actions={
          canWrite ? (
            <Button onClick={() => setCreateOpen(true)}>+ إضافة تكليف</Button>
          ) : undefined
        }
        pagination={
          totalPages > 1 && total > 0
            ? {
                page: pageNum,
                totalPages,
                totalItems: total,
                pageSize: PAGE_SIZE,
                onPageChange: (p) => setPage(String(p)),
                isLoading: q.isFetching,
              }
            : undefined
        }
      >
        {/* ============ Filters row ============ */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative min-w-[240px] flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-400"
            />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="ابحث بالمعلم أو المادة..."
              className="w-full rounded-lg border border-line bg-paper-elevated py-2 pe-9 ps-3 text-sm text-ink outline-none transition-colors focus:border-ink focus:ring-2 focus:ring-ink/10"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink"
                aria-label="مسح البحث"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Teacher filter */}
          <select
            value={teacherFilter}
            onChange={(e) => {
              setTeacherFilter(e.target.value);
              setPage("1");
            }}
            className="max-w-[220px] rounded-lg border border-line bg-paper-elevated px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          >
            <option value="">كل المعلمين</option>
            {(teachers?.results ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {[t.first_name, t.last_name].filter(Boolean).join(" ").trim() ||
                  t.email}
              </option>
            ))}
          </select>

          {/* Course filter */}
          <select
            value={courseFilter}
            onChange={(e) => {
              setCourseFilter(e.target.value);
              setPage("1");
            }}
            className="max-w-[220px] rounded-lg border border-line bg-paper-elevated px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          >
            <option value="">كل المواد</option>
            {(courses?.results ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage("1");
            }}
            className="rounded-lg border border-line bg-paper-elevated px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* View toggle */}
          <div className="flex rounded-lg border border-line bg-paper-elevated p-0.5">
            <button
              onClick={() => changeViewMode("grid")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === "grid"
                  ? "bg-ink text-white dark:bg-accent dark:text-[#111827]"
                  : "text-ink-400 hover:text-ink"
              }`}
              aria-label="عرض شبكة"
              aria-pressed={viewMode === "grid"}
              type="button"
            >
              ⊞
            </button>
            <button
              onClick={() => changeViewMode("table")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === "table"
                  ? "bg-ink text-white dark:bg-accent dark:text-[#111827]"
                  : "text-ink-400 hover:text-ink"
              }`}
              aria-label="عرض جدول"
              aria-pressed={viewMode === "table"}
              type="button"
            >
              ☰
            </button>
          </div>

          {hasActiveFilter && (
            <button
              onClick={clearFilters}
              className="text-xs text-ink-400 hover:text-ink"
            >
              مسح الكل
            </button>
          )}
        </div>

        {/* ============ Empty state ============ */}
        {items.length === 0 && (
          <EmptyState
            icon="🔗"
            title={
              hasActiveFilter ? "لا توجد تكليفات مطابقة" : "لا توجد تكليفات بعد"
            }
            description={
              hasActiveFilter
                ? "جرّب مسح الفلاتر أو تعديل البحث."
                : "اربط معلمًا بكورس ليُحدَّد نطاق ما يراه من طلاب ونتائج."
            }
            action={
              hasActiveFilter ? (
                <Button variant="ghost" onClick={clearFilters}>
                  مسح الفلاتر
                </Button>
              ) : canWrite ? (
                <Button onClick={() => setCreateOpen(true)}>+ إضافة تكليف</Button>
              ) : undefined
            }
          />
        )}

        {/* ============ Grid view ============ */}
        {items.length > 0 && viewMode === "grid" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((a) => (
              <AssignmentCard
                key={a.id}
                assignment={a}
                actions={buildActions(a)}
              />
            ))}
          </div>
        )}

        {/* ============ Table view ============ */}
        {items.length > 0 && viewMode === "table" && (
          <div className="overflow-x-auto card">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-ink-50 text-ink-700">
                <tr>
                  <th className="px-4 py-3 font-medium text-start">المعلم</th>
                  <th className="px-4 py-3 font-medium text-start">المادة</th>
                  <th className="px-4 py-3 font-medium text-start">النطاق</th>
                  <th className="w-12 px-2 py-3" aria-label="actions" />
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-line transition-colors last:border-0 hover:bg-ink-50/30"
                  >
                    {/* 1. المعلم */}
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">
                        {a.teacher_name || a.teacher_email}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-400">
                        {a.teacher_email}
                      </p>
                    </td>

                    {/* 2. المادة */}
                    <td className="px-4 py-3 text-ink-400">{a.course_name}</td>

                    {/* 3. النطاق (المجموعات) */}
                    <td className="px-4 py-3">
                      {a.groups.length === 0 ? (
                        <span className="rounded-full bg-info/10 px-2 py-0.5 text-xs font-medium text-info">
                          كل مجموعات الصف
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {a.group_names.map((g, idx) => (
                            <span
                              key={`${g}-${idx}`}
                              className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-medium text-ink-700"
                            >
                              {g}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* 4. Actions */}
                    <td className="px-2 py-3 text-end">
                      <ActionMenu items={buildActions(a)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageShell>

      {/* ============ Create modal ============ */}
      {canWrite && (
        <QuickCreateModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          title="إضافة تكليف معلم"
        >
          <TeacherAssignmentForm
            onSubmit={handleCreate}
            onCancel={() => setCreateOpen(false)}
          />
        </QuickCreateModal>
      )}

      {/* ============ Edit modal ============ */}
      {canWrite && editTarget && (
        <QuickCreateModal
          open={true}
          onClose={() => setEditTarget(null)}
          title={`تعديل التكليف — ${
            editTarget.teacher_name || editTarget.teacher_email
          }`}
        >
          <TeacherAssignmentForm
            onSubmit={handleUpdate}
            onCancel={() => setEditTarget(null)}
            initialValues={{
              teacher: editTarget.teacher,
              course: editTarget.course,
              groups: editTarget.groups,
            }}
          />
        </QuickCreateModal>
      )}

      {/* ============ Delete confirm ============ */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="تأكيد الحذف"
        description={
          deleteTarget
            ? `سيتم حذف تكليف "${
                deleteTarget.teacher_name || deleteTarget.teacher_email
              } → ${deleteTarget.course_name}" نهائيًا. لا يمكن التراجع.`
            : ""
        }
        confirmLabel={busyDelete ? "جارٍ الحذف..." : "حذف نهائي"}
        cancelLabel="إلغاء"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        isPending={busyDelete}
      />
    </>
  );
}