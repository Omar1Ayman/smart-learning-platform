"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { EnrollmentCard } from "@/components/enrollments/EnrollmentCard";
import { EnrollmentForm } from "@/components/enrollments/EnrollmentForm";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ListPage } from "@/components/ui/ListPage";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TermTransitionModal } from "@/components/enrollments/TermTransitionModal";
import {
  createEnrollment,
  deleteEnrollment,
  listEnrollments,
  updateEnrollment,
} from "@/lib/api/enrollments";
import { listGroups } from "@/lib/api/groups";
import { useCanWrite } from "@/lib/auth/useCanWrite";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useUrlEnumState } from "@/lib/hooks/useUrlEnumState";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { useYearScopedQuery } from "@/lib/hooks/useYearScopedQuery";
import {
  showResponseWarnings,
  toastError,
  toastSuccess,
} from "@/lib/utils/toast";
import type { EnrollmentFormValues } from "@/lib/validation/schemas";
import type { Enrollment, EnrollmentStatus } from "@/types";

const PAGE_SIZE = 20;

type StatusTab = "ALL" | EnrollmentStatus;

const STATUS_TABS: Array<{ key: StatusTab; label: string }> = [
  { key: "ALL", label: "الكل" },
  { key: "ACTIVE", label: "نشط" },
  { key: "COMPLETED", label: "مكتمل" },
  { key: "FAILED", label: "راسب" },
  { key: "GRADUATED", label: "متخرج" },
  { key: "TRANSFERRED", label: "منقول" },
  { key: "SUSPENDED", label: "موقوف" },
];
const STATUS_TAB_KEYS = STATUS_TABS.map((t) => t.key) as readonly StatusTab[];

const SORT_OPTIONS = [
  { value: "-enrolled_at", label: "الأحدث تسجيلاً" },
  { value: "enrolled_at", label: "الأقدم تسجيلاً" },
  { value: "student__first_name", label: "اسم الطالب (أ-ي)" },
  { value: "student__email", label: "البريد الإلكتروني (أ-ي)" },
];

type ViewMode = "grid" | "table";
const VIEW_STORAGE_KEY = "enrollments_view_mode";

function statusVariant(
  status: EnrollmentStatus,
): "success" | "info" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "COMPLETED":
      return "info";
    case "GRADUATED":
      return "warning";
    case "TRANSFERRED":
      return "neutral";
    case "SUSPENDED":
      return "danger";
    case "FAILED":
      return "danger";
    default:
      return "neutral";
  }
}

function statusLabel(status: EnrollmentStatus): string {
  return (
    {
      ACTIVE: "نشط",
      COMPLETED: "مكتمل",
      FAILED: "راسب",
      GRADUATED: "متخرج",
      TRANSFERRED: "منقول",
      SUSPENDED: "موقوف",
      INACTIVE: "غير نشط",
      ARCHIVED: "مؤرشف",
    } as Record<EnrollmentStatus, string>
  )[status];
}

export default function EnrollmentsPage() {
  const queryClient = useQueryClient();
  const canManage = useCanWrite();

  // ─── Phase 1.8 — السنة تُحقن تلقائياً ───
  const { queryFn: yearScopedQueryFn, enabled: yearEnabled } =
    useYearScopedQuery(listEnrollments);

  // ─── URL state ───
  const [page, setPage] = useUrlState("p", "1");
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const [statusTab, setStatusTab] = useUrlEnumState(
    "status",
    STATUS_TAB_KEYS,
    "ALL",
  );
  const [groupFilter, setGroupFilter] = useUrlState("group", "");
  const [sort, setSort] = useUrlState("sort", "-enrolled_at");
  const [searchUrl, setSearchUrl] = useUrlState("q", "");

  const [searchInput, setSearchInput] = useState(searchUrl);
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  useEffect(() => {
    if (debouncedSearch !== searchUrl) setSearchUrl(debouncedSearch);
  }, [debouncedSearch, searchUrl, setSearchUrl]);

  // ─── View mode ───
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

  // ─── Modals ───
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Enrollment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Enrollment | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  // ─── Groups dropdown (للفلتر فقط) ───
  const { data: groups } = useQuery({
    queryKey: ["groups"],
    queryFn: () => listGroups(),
  });

  const apiStatus: EnrollmentStatus | undefined =
    statusTab === "ALL" ? undefined : statusTab;

  // ─── Query (السنة تُحقن تلقائياً) ───
  const q = useQuery({
    queryKey: [
      "enrollments",
      pageNum,
      debouncedSearch,
      statusTab,
      groupFilter,
      sort,
    ],
    queryFn: () =>
      yearScopedQueryFn({
        page: pageNum,
        page_size: PAGE_SIZE,
        search: debouncedSearch || undefined,
        status: apiStatus,
        group: groupFilter || undefined,
        ordering: sort,
      }),
    enabled: yearEnabled,
  });

  const items = q.data?.results ?? [];
  const total = q.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const [transitionTarget, setTransitionTarget] = useState<Enrollment | null>(null);
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["enrollments"] });

  const hasActiveFilter =
    !!searchInput ||
    statusTab !== "ALL" ||
    groupFilter !== "" ||
    sort !== "-enrolled_at";

  function clearFilters() {
    setSearchInput("");
    setSearchUrl("");
    setStatusTab("ALL");
    setGroupFilter("");
    setSort("-enrolled_at");
    setPage("1");
  }

  async function handleCreate(values: EnrollmentFormValues) {
    try {
      const created = await createEnrollment(values);
      showResponseWarnings(created);
      await invalidate();
      toastSuccess("تم تسجيل الطالب");
      setCreateOpen(false);
      setPage("1");
    } catch (err) {
      toastError(err, "تعذّر تسجيل الطالب.");
      throw err;
    }
  }

  async function handleUpdate(values: EnrollmentFormValues) {
    if (!editTarget) return;
    try {
      const updated = await updateEnrollment(editTarget.id, {
        student: values.student,
        group: values.group,
        term: values.term,
      });
      showResponseWarnings(updated);
      await invalidate();
      toastSuccess("تم تحديث التسجيل");
      setEditTarget(null);
    } catch (err) {
      toastError(err, "تعذّر تحديث التسجيل.");
      throw err;
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusyDelete(true);
    try {
      await deleteEnrollment(deleteTarget.id);
      await invalidate();
      toastSuccess("تم حذف التسجيل");
      setDeleteTarget(null);
    } catch (err) {
      toastError(err, "تعذّر حذف التسجيل.");
    } finally {
      setBusyDelete(false);
    }
  }

    function buildActions(e: Enrollment) {
    const canTransition =
      canManage &&
      e.status === "ACTIVE" &&
      e.term !== null &&
      e.term_name !== null;

    return [
      {
        label: "تفاصيل الطالب",
        onClick: () => {
          window.location.href = `/students/${e.student}`;
        },
      },
      ...(canTransition
        ? [
            {
              label: "نقل بين الترمات",
              onClick: () => setTransitionTarget(e),
            },
          ]
        : []),
      ...(canManage
        ? [
            { label: "تعديل", onClick: () => setEditTarget(e) },
            {
              label: "حذف",
              variant: "danger" as const,
              onClick: () => setDeleteTarget(e),
            },
          ]
        : []),
    ];
  }

  return (
    <>
      <ListPage
        title="التسجيلات"
        description={total > 0 ? `${total} تسجيل` : undefined}
        actions={
          <>
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
            {canManage && (
              <Button onClick={() => setCreateOpen(true)}>+ تسجيل طالب</Button>
            )}
          </>
        }
        tabs={STATUS_TABS.map((t) => ({ key: t.key, label: t.label }))}
        activeTab={statusTab}
        onTabChange={(k) => {
          setStatusTab(k as StatusTab);
          setPage("1");
        }}
        searchable
        searchValue={searchInput}
        searchPlaceholder="ابحث باسم الطالب أو بريده..."
        onSearchChange={setSearchInput}
        filters={[
          {
            key: "group",
            label: "المجموعات",
            value: groupFilter,
            options: (groups?.results ?? []).map((g) => ({
              value: g.id,
              label: g.name,
            })),
            onChange: (v) => {
              setGroupFilter(v);
              setPage("1");
            },
          },
          {
            key: "sort",
            label: "الترتيب",
            value: sort,
            options: SORT_OPTIONS,
            onChange: (v) => {
              setSort(v || "-enrolled_at");
              setPage("1");
            },
          },
        ]}
        hasActiveFilter={hasActiveFilter}
        onClearFilters={clearFilters}
        isLoading={q.isLoading}
        isError={q.isError}
        errorMessage="تعذّر تحميل التسجيلات."
        onRetry={() => q.refetch()}
        isEmpty={items.length === 0}
        emptyIcon="🎓"
        emptyDescription={
          hasActiveFilter
            ? "جرّب مسح الفلاتر أو تعديل البحث."
            : canManage
              ? "سجّل طالبًا في مجموعة لبدء متابعة تقدمه."
              : "لا يوجد لديك تسجيل حاليًا."
        }
        emptyAction={
          hasActiveFilter ? (
            <Button variant="ghost" onClick={clearFilters}>
              مسح الفلاتر
            </Button>
          ) : canManage ? (
            <Button onClick={() => setCreateOpen(true)}>+ تسجيل طالب</Button>
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
        {viewMode === "grid" ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((e) => (
              <EnrollmentCard
                key={e.id}
                enrollment={e}
                actions={buildActions(e)}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto card">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-ink-50 text-ink-700">
                <tr>
                  <th className="px-4 py-3 font-medium text-start">الطالب</th>
                  <th className="px-4 py-3 font-medium text-start">المجموعة</th>
                  <th className="px-4 py-3 font-medium text-start">
                    السنة / الترم
                  </th>
                  <th className="px-4 py-3 font-medium text-start">الحالة</th>
                  <th className="px-4 py-3 font-medium text-start">
                    تاريخ التسجيل
                  </th>
                  <th className="w-12 px-2 py-3" aria-label="actions" />
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-line transition-colors last:border-0 hover:bg-ink-50/30"
                  >
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <Link
                          href={`/students/${e.student}`}
                          className="truncate font-medium text-ink hover:underline"
                        >
                          {e.student_name || e.student_email}
                        </Link>
                        <p className="truncate text-xs text-ink-400">
                          {e.student_email}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-400">{e.group_name}</td>
                    <td className="px-4 py-3 text-xs text-ink-400">
                      {e.academic_year_name}
                      {e.term_name ? ` · ${e.term_name}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge variant={statusVariant(e.status)}>
                        {statusLabel(e.status)}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-400">
                      {new Date(e.enrolled_at).toLocaleDateString("ar-EG")}
                    </td>
                    <td className="px-2 py-3 text-end">
                      <ActionMenu items={buildActions(e)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ListPage>

      {canManage && (
        <QuickCreateModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          title="تسجيل طالب"
        >
          <EnrollmentForm
            onSubmit={handleCreate}
            onCancel={() => setCreateOpen(false)}
          />
        </QuickCreateModal>
      )}

      {canManage && editTarget && (
        <QuickCreateModal
          open
          onClose={() => setEditTarget(null)}
          title={`تعديل التسجيل — ${
            editTarget.student_name || editTarget.student_email
          }`}
        >
          <EnrollmentForm
            onSubmit={handleUpdate}
            onCancel={() => setEditTarget(null)}
            initialValues={{
              student: editTarget.student,
              group: editTarget.group,
              term: editTarget.term ?? "",
            }}
          />
        </QuickCreateModal>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="تأكيد الحذف"
        description={
          deleteTarget
            ? `سيتم حذف تسجيل "${
                deleteTarget.student_name || deleteTarget.student_email
              }" نهائيًا. لا يمكن التراجع.`
            : ""
        }
        confirmLabel={busyDelete ? "جارٍ الحذف..." : "حذف نهائي"}
        cancelLabel="إلغاء"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        isPending={busyDelete}
      />
      {transitionTarget && (
        <TermTransitionModal
          open={!!transitionTarget}
          onClose={() => setTransitionTarget(null)}
          enrollment={transitionTarget}
          onSuccess={() => {
            invalidate();
            setTransitionTarget(null);
          }}
        />
      )}
    </>
  );
}