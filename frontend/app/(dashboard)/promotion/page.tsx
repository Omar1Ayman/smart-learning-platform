"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import { Search, X } from "@/components/ui/icons";
import { listAcademicYears } from "@/lib/api/academicYears";
import { listEnrollments, promoteEnrollments } from "@/lib/api/enrollments";
import { listGrades } from "@/lib/api/grades";
import { listGroups } from "@/lib/api/groups";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import {
  extractErrorMessage,
  toastError,
  toastSuccess,
} from "@/lib/utils/toast";
import type {
  Enrollment,
  PromotionAction,
  PromotionResponse,
} from "@/types";

// ============================================================================
// Constants
// ============================================================================

const ACTION_LABEL: Record<PromotionAction, string> = {
  PROMOTE: "ترقية",
  REPEAT: "إعادة",
  TRANSFER: "نقل",
  GRADUATE: "تخرّج",
};

const YEAR_STATUS_LABEL = {
  ACTIVE: "نشطة",
  CLOSING: "قيد الإغلاق",
  DRAFT: "مسودة",
  ARCHIVED: "مؤرشفة",
} as const;

const PAGE_SIZE = 50;
const EMPTY_ENROLLMENTS: Enrollment[] = [];

const SORT_OPTIONS = [
  { value: "student__first_name", label: "اسم الطالب (أ-ي)" },
  { value: "-student__first_name", label: "اسم الطالب (ي-أ)" },
  { value: "group__name", label: "المجموعة" },
  { value: "-enrolled_at", label: "الأحدث تسجيلاً" },
];

// ============================================================================
// Types
// ============================================================================

interface RowState {
  enrollment: Enrollment;
  action: PromotionAction;
  target_group: string;
}

// ============================================================================
// Main Page
// ============================================================================

export default function PromotionPage() {
  const queryClient = useQueryClient();

  // ---- Source / Target year ----
  const [sourceYear, setSourceYear] = useState("");
  const [targetYear, setTargetYear] = useState("");

  // ---- Filters (for the source list) ----
  const [gradeFilter, setGradeFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput.trim());
  const [sort, setSort] = useState("student__first_name");
  const [page, setPage] = useState(1);

  // ---- Per-enrollment state ----
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ---- Flow state ----
  const [preview, setPreview] = useState<PromotionResponse | null>(null);
  const [confirmExecute, setConfirmExecute] = useState(false);
  const [executedSummary, setExecutedSummary] =
    useState<Record<PromotionAction, number> | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  // ============================================================================
  // Lookup queries
  // ============================================================================

  const yearsQuery = useQuery({
    queryKey: ["academic-years"],
    queryFn: () => listAcademicYears({ page_size: 200 }),
  });
  const years = yearsQuery.data;

  const gradesQuery = useQuery({
    queryKey: ["grades"],
    queryFn: () => listGrades({ page_size: 200 }),
  });
  const grades = gradesQuery.data;

  // Groups belonging to SOURCE year (for filtering the list)
  const sourceGroupsQuery = useQuery({
    queryKey: ["groups", "source", sourceYear, gradeFilter],
    queryFn: () =>
      listGroups({
        academic_year: sourceYear,
        grade: gradeFilter || undefined,
        page_size: 200,
      }),
    enabled: !!sourceYear,
  });
  const sourceGroups = sourceGroupsQuery.data;

  // Groups belonging to TARGET year (for assigning target_group)
  const targetGroupsQuery = useQuery({
    queryKey: ["groups", "target", targetYear],
    queryFn: () =>
      listGroups({ academic_year: targetYear, page_size: 200 }),
    enabled: !!targetYear,
  });
  const targetGroups = targetGroupsQuery.data;

  // ============================================================================
  // Main query — list enrollments with all filters applied server-side
  // ============================================================================

  const q = useQuery({
    queryKey: [
      "enrollments", "promotion",
      sourceYear, gradeFilter, groupFilter, search, sort, page,
    ],
    queryFn: () =>
      listEnrollments({
        academic_year: sourceYear,
        status: "ACTIVE",
        // grade filter uses the related path (see backend note below)
        grade: gradeFilter || undefined,
        group: groupFilter || undefined,
        search: search || undefined,
        ordering: sort,
        page,
        page_size: PAGE_SIZE,
      }),
    enabled: !!sourceYear,
  });

  const items = q.data?.results ?? EMPTY_ENROLLMENTS;
  const totalCount = q.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // ============================================================================
  // Selection helpers
  // ============================================================================

  const visibleIds = items.map((e) => e.id);
  const selectedVisibleCount = visibleIds.filter((id) =>
    selectedIds.has(id),
  ).length;
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

  function toggleOne(id: string) {
    if (!selectedIds.has(id)) {
      const enrollment = items.find((item) => item.id === id);
      if (enrollment) {
        setRows((prev) => ({
          ...prev,
          [id]: prev[id] ?? {
            enrollment,
            action: "PROMOTE",
            target_group: "",
          },
        }));
      }
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPreview(null);
  }

  function toggleAllVisible() {
    if (!allVisibleSelected) {
      setRows((prev) => {
        const next = { ...prev };
        for (const enrollment of items) {
          next[enrollment.id] ??= {
            enrollment,
            action: "PROMOTE",
            target_group: "",
          };
        }
        return next;
      });
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
    setPreview(null);
  }

  // ============================================================================
  // Bulk assignment on SELECTED rows only
  // ============================================================================

  function bulkSetAction(action: PromotionAction) {
    setRows((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) {
        if (!next[id]) continue;
        next[id] = {
          ...next[id],
          action,
          target_group: action === "GRADUATE" ? "" : next[id].target_group,
        };
      }
      return next;
    });
    setPreview(null);
  }

  function bulkSetTarget(groupId: string) {
    setRows((prev) => {
      const next = { ...prev };
      for (const id of selectedIds) {
        if (!next[id]) continue;
        next[id] = {
          ...next[id],
          target_group: next[id].action === "GRADUATE" ? "" : groupId,
        };
      }
      return next;
    });
    setPreview(null);
  }

  function setRowAction(id: string, action: PromotionAction) {
    setRows((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        action,
        target_group: action === "GRADUATE" ? "" : prev[id].target_group,
      },
    }));
    setPreview(null);
  }

  function setRowTargetGroup(id: string, groupId: string) {
    setRows((prev) => ({
      ...prev,
      [id]: { ...prev[id], target_group: groupId },
    }));
    setPreview(null);
  }

  function clearTargetGroups() {
    setRows((prev) => {
      const next: Record<string, RowState> = {};
      for (const [id, row] of Object.entries(prev)) {
        next[id] = { ...row, target_group: "" };
      }
      return next;
    });
  }

  // ============================================================================
  // Derived state
  // ============================================================================

  const selectedRows = useMemo(
    () =>
      Array.from(selectedIds)
        .map((id) => rows[id])
        .filter((r): r is RowState => !!r),
    [selectedIds, rows],
  );

  const missingTargets = selectedRows.filter(
    (r) => r.action !== "GRADUATE" && !r.target_group,
  ).length;
  const isBusy = isPreviewing || isExecuting;

  const summary = useMemo(() => {
    const counts: Record<PromotionAction, number> = {
      PROMOTE: 0,
      REPEAT: 0,
      TRANSFER: 0,
      GRADUATE: 0,
    };
    for (const r of selectedRows) counts[r.action]++;
    return counts;
  }, [selectedRows]);

  const canPreview =
    !!sourceYear &&
    !!targetYear &&
    sourceYear !== targetYear &&
    selectedRows.length > 0 &&
    missingTargets === 0 &&
    !isBusy;

  const sourceYears = (years?.results ?? []).filter(
    (year) => year.status === "ACTIVE" || year.status === "CLOSING",
  );
  const targetYears = (years?.results ?? []).filter(
    (year) => year.id !== sourceYear && year.status === "ACTIVE",
  );
  const gradeNames = useMemo(
    () => new Map((grades?.results ?? []).map((grade) => [grade.id, grade.name])),
    [grades],
  );

  function groupLabel(group: { name: string; grade: string }) {
    const gradeName = gradeNames.get(group.grade);
    return gradeName ? `${group.name} — ${gradeName}` : group.name;
  }

  // ============================================================================
  // Preview / Execute
  // ============================================================================

  async function handlePreview() {
    setServerError(null);
    setIsPreviewing(true);
    try {
      const result = await promoteEnrollments({
        target_academic_year: targetYear,
        dry_run: true,
        items: selectedRows.map((r) => ({
          enrollment: r.enrollment.id,
          action: r.action,
          target_group: r.action === "GRADUATE" ? null : r.target_group || null,
        })),
      });
      setPreview(result);
    } catch (err) {
      setServerError(extractErrorMessage(err, "تعذّرت المعاينة."));
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleExecute() {
    setServerError(null);
    setIsExecuting(true);
    try {
      const result = await promoteEnrollments({
        target_academic_year: targetYear,
        dry_run: false,
        items: selectedRows.map((r) => ({
          enrollment: r.enrollment.id,
          action: r.action,
          target_group: r.action === "GRADUATE" ? null : r.target_group || null,
        })),
      });
      const counts: Record<PromotionAction, number> = {
        PROMOTE: 0,
        REPEAT: 0,
        TRANSFER: 0,
        GRADUATE: 0,
      };
      for (const item of result.results) counts[item.action]++;
      setExecutedSummary(counts);
      setPreview(null);
      setConfirmExecute(false);
      setSelectedIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ["enrollments"] });
      toastSuccess(`تم تنفيذ القرارات لعدد ${result.results.length} طالب بنجاح.`);
    } catch (err) {
      setServerError(extractErrorMessage(err, "تعذّر تنفيذ الترقية."));
      toastError(err, "تعذّر تنفيذ الترقية.");
      setConfirmExecute(false);
    } finally {
      setIsExecuting(false);
    }
  }

  function resetFlow() {
    setSourceYear("");
    setTargetYear("");
    setGradeFilter("");
    setGroupFilter("");
    setSearchInput("");
    setSort("student__first_name");
    setPage(1);
    setRows({});
    setSelectedIds(new Set());
    setPreview(null);
    setExecutedSummary(null);
    setServerError(null);
  }

  function clearFilters() {
    setGradeFilter("");
    setGroupFilter("");
    setSearchInput("");
    setSort("student__first_name");
    setPage(1);
    setPreview(null);
  }

  // ============================================================================
  // Success screen
  // ============================================================================

  if (executedSummary !== null) {
    const processedCount = Object.values(executedSummary).reduce(
      (total, count) => total + count,
      0,
    );
    const createdEnrollments = processedCount - executedSummary.GRADUATE;
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card p-6 text-center sm:p-8">
          <p className="text-5xl font-display">✅</p>
          <h1 className="mt-4 text-xl font-bold font-display text-ink">
            اكتملت قرارات الطلاب
          </h1>
          <p className="mt-2 text-sm text-ink-400">
            تم تحديث {processedCount} تسجيلًا. أُنشئ {createdEnrollments} تسجيلًا جديدًا؛
            وتخرّج {executedSummary.GRADUATE} طالبًا.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(Object.keys(ACTION_LABEL) as PromotionAction[]).map((action) => (
              <div key={action} className="rounded-lg bg-paper-muted p-3">
                <p className="text-xs text-ink-500">{ACTION_LABEL[action]}</p>
                <p className="mt-1 font-display text-lg font-bold tabular-nums text-ink">
                  {executedSummary[action].toLocaleString("ar-EG")}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button onClick={resetFlow}>بدء ترقية جديدة</Button>
            <Link href="/enrollments">
              <Button variant="ghost">صفحة التسجيلات ←</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Render
  // ============================================================================

  const filtersActive = !!gradeFilter || !!groupFilter || !!searchInput.trim();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-24">
      {/* ============ Header ============ */}
      <PageHeader
        title="ترحيل الطلاب إلى سنة جديدة"
        description="اختر السنتين، حدّد الطلاب وقراراتهم، ثم راجع المعاينة قبل اعتماد أي تغيير."
        actions={
          <Button
            type="button"
            variant="ghost"
            onClick={resetFlow}
            disabled={(!sourceYear && !targetYear) || isBusy}
          >
            إعادة ضبط
          </Button>
        }
      />

      {yearsQuery.isError && (
        <ErrorState
          message="تعذّر تحميل السنوات الدراسية."
          onRetry={() => {
            void yearsQuery.refetch();
          }}
        />
      )}
      {targetYear && targetGroupsQuery.isError && (
        <ErrorState
          message="تعذّر تحميل مجموعات السنة الهدف، لذلك لا يمكن إكمال التعيين أو المعاينة."
          onRetry={() => {
            void targetGroupsQuery.refetch();
          }}
        />
      )}

      {/* ============ Step 1: Year selection ============ */}
      <section
        className="card flex flex-col gap-4 p-4 sm:p-5"
        aria-labelledby="promotion-years-heading"
      >
        <div>
          <h2
            id="promotion-years-heading"
            className="font-display text-base font-bold text-ink"
          >
            1. اختر السنوات الدراسية
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            المصدر سنة نشطة أو قيد الإغلاق؛ ويجب أن تكون السنة الهدف نشطة قبل التنفيذ.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="source-academic-year"
            className="text-sm font-medium text-ink"
          >
            من السنة الدراسية
          </label>
          <select
            id="source-academic-year"
            value={sourceYear}
            onChange={(e) => {
              setSourceYear(e.target.value);
              setTargetYear("");
              setRows({});
              setSelectedIds(new Set());
              setGradeFilter("");
              setGroupFilter("");
              setSearchInput("");
              setPage(1);
              setPreview(null);
              setServerError(null);
            }}
            disabled={yearsQuery.isLoading || yearsQuery.isError || isBusy}
            className="rounded-lg border border-line bg-paper-elevated px-3 py-2 text-sm text-ink disabled:cursor-not-allowed disabled:bg-paper-muted"
          >
            <option value="">
              {yearsQuery.isLoading
                ? "جارٍ تحميل السنوات..."
                : "اختر السنة المصدر"}
            </option>
            {sourceYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name} — {YEAR_STATUS_LABEL[y.status]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="target-academic-year"
            className="text-sm font-medium text-ink"
          >
            إلى السنة الدراسية
          </label>
          <select
            id="target-academic-year"
            value={targetYear}
            onChange={(e) => {
              setTargetYear(e.target.value);
              clearTargetGroups();
              setPreview(null);
              setServerError(null);
            }}
            className="rounded-lg border border-line bg-paper-elevated px-3 py-2 text-sm text-ink disabled:cursor-not-allowed disabled:bg-paper-muted"
            disabled={!sourceYear || targetYears.length === 0 || isBusy}
          >
            <option value="">اختر السنة الهدف</option>
            {targetYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name} — {YEAR_STATUS_LABEL[y.status]}
              </option>
            ))}
          </select>
          {sourceYear &&
            targetYears.length === 0 &&
            !yearsQuery.isLoading &&
            !yearsQuery.isError && (
            <p className="text-xs text-warning">
              لا توجد سنة نشطة أخرى. فعّل السنة الهدف من{" "}
              <Link href="/academic-years" className="font-medium underline">
                إدارة السنوات
              </Link>{" "}
              أولًا.
            </p>
          )}
        </div>
        </div>
        {!yearsQuery.isLoading &&
          !yearsQuery.isError &&
          sourceYears.length === 0 && (
            <p className="text-sm text-warning">
              لا توجد سنة نشطة أو قيد الإغلاق يمكن ترحيل الطلاب منها.{" "}
              <Link href="/academic-years" className="font-medium underline">
                راجع إدارة السنوات الدراسية
              </Link>
              .
            </p>
          )}
      </section>

      {/* ============ Step 2: Filters + total counter ============ */}
      {sourceYear && (
        <section className="card p-4" aria-labelledby="promotion-students-heading">
          <div className="mb-4">
            <h2
              id="promotion-students-heading"
              className="font-display text-base font-bold text-ink"
            >
              2. ابحث وحدّد الطلاب
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              يمكنك الاحتفاظ بالتحديد أثناء التنقل بين الصفحات والفلاتر.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {/* Search */}
            <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
              <label htmlFor="promotion-search" className="text-xs text-ink-500">
                بحث بالاسم / البريد / الكود
              </label>
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-400"
                />
                <input
                  id="promotion-search"
                  type="text"
                  value={searchInput}
                  onChange={(e) => {
                    setSearchInput(e.target.value);
                    setPage(1);
                    setPreview(null);
                  }}
                  placeholder="مثال: أحمد..."
                  className="w-full rounded-lg border border-line bg-paper-elevated py-2 pe-9 ps-3 text-sm text-ink outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
                  autoComplete="off"
                  disabled={isBusy}
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput("");
                      setPage(1);
                      setPreview(null);
                    }}
                    className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink"
                    aria-label="مسح البحث"
                    disabled={isBusy}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Grade filter */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="promotion-grade" className="text-xs text-ink-500">
                الصف
              </label>
              <select
                id="promotion-grade"
                value={gradeFilter}
                onChange={(e) => {
                  setGradeFilter(e.target.value);
                  setGroupFilter("");
                  setPage(1);
                  setPreview(null);
                }}
                disabled={gradesQuery.isLoading || gradesQuery.isError || isBusy}
                className="min-w-[150px] rounded-lg border border-line bg-paper-elevated px-3 py-2 text-sm text-ink disabled:cursor-not-allowed disabled:bg-paper-muted"
              >
                <option value="">كل الصفوف</option>
                {(grades?.results ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Group filter */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="promotion-group" className="text-xs text-ink-500">
                المجموعة
              </label>
              <select
                id="promotion-group"
                value={groupFilter}
                onChange={(e) => {
                  setGroupFilter(e.target.value);
                  setPage(1);
                  setPreview(null);
                }}
                disabled={
                  sourceGroupsQuery.isLoading ||
                  sourceGroupsQuery.isError ||
                  isBusy
                }
                className="min-w-[150px] rounded-lg border border-line bg-paper-elevated px-3 py-2 text-sm text-ink disabled:cursor-not-allowed disabled:bg-paper-muted"
              >
                <option value="">كل المجموعات</option>
                {(sourceGroups?.results ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {groupLabel(g)}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="promotion-sort" className="text-xs text-ink-500">
                الترتيب
              </label>
              <select
                id="promotion-sort"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                  setPreview(null);
                }}
                className="min-w-[140px] rounded-lg border border-line bg-paper-elevated px-3 py-2 text-sm text-ink disabled:cursor-not-allowed disabled:bg-paper-muted"
                disabled={isBusy}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Total counter — THE CRITICAL INDICATOR */}
            <div className="ms-auto text-end">
              <p className="text-xs text-ink-500">إجمالي الطلاب المطابقين</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-ink">
                {q.isLoading ? "..." : totalCount.toLocaleString("ar-EG")}
              </p>
              {q.isFetching && !q.isLoading && (
                <p className="text-xs text-ink-400" role="status">
                  جارٍ تحديث النتائج...
                </p>
              )}
            </div>
          </div>

          {gradesQuery.isError && (
            <p className="mt-3 text-xs text-danger">
              تعذّر تحميل الصفوف.{" "}
              <button
                type="button"
                onClick={() => {
                  void gradesQuery.refetch();
                }}
                className="font-medium underline"
              >
                إعادة المحاولة
              </button>
            </p>
          )}
          {sourceGroupsQuery.isError && (
            <p className="mt-3 text-xs text-danger">
              تعذّر تحميل المجموعات.{" "}
              <button
                type="button"
                onClick={() => {
                  void sourceGroupsQuery.refetch();
                }}
                className="font-medium underline"
              >
                إعادة المحاولة
              </button>
            </p>
          )}

          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-2 text-xs text-ink-400 hover:text-ink"
            >
              مسح كل الفلاتر
            </button>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
              <p className="text-xs text-ink-400">
                صفحة <strong className="text-ink">{page}</strong> من {totalPages}{" "}
                — المعروض {items.length} من {totalCount}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || q.isFetching || isBusy}
                  className="text-xs"
                >
                  السابق
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || q.isFetching || isBusy}
                  className="text-xs"
                >
                  التالي
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ============ Loading / Empty ============ */}
      {sourceYear && q.isLoading && <Spinner />}
      {sourceYear && q.isError && (
        <ErrorState
          message="تعذّر تحميل الطلاب. تحقق من الاتصال ثم أعد المحاولة."
          onRetry={() => {
            void q.refetch();
          }}
        />
      )}
      {sourceYear && !q.isLoading && !q.isError && items.length === 0 && (
        <EmptyState
          icon="🎓"
          title="لا يوجد طلاب مطابقون"
          description={
            filtersActive
              ? "جرّب مسح الفلاتر أو تعديل البحث."
              : "لا يوجد طلاب لديهم تسجيل نشط في هذه السنة."
          }
          action={
            filtersActive ? (
              <Button variant="ghost" onClick={clearFilters}>
                مسح الفلاتر
              </Button>
            ) : undefined
          }
        />
      )}

      {/* ============ Step 3: Student table ============ */}
      {(items.length > 0 || selectedIds.size > 0) && (
        <>
          {/* Select-all header */}
          {items.length > 0 && <div className="flex items-center gap-2 px-1">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              disabled={isBusy}
              className="h-4 w-4 cursor-pointer accent-ink"
              aria-label="تحديد كل المعروض"
            />
            <span className="text-xs text-ink-400">
              تحديد كل المعروض ({items.length})
            </span>
            {selectedIds.size > 0 && (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent-dark">
                محدد: {selectedIds.size}
              </span>
            )}
          </div>}

          {/* Bulk assign bar — only when selection exists */}
          {selectedIds.size > 0 && (
            <div className="sticky top-16 z-30 rounded-lg border-2 border-ink bg-paper-elevated p-3 shadow-lg">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-bold text-ink">
                  {selectedIds.size} طالب محدد
                </span>

                <div className="flex flex-wrap gap-1">
                  {(Object.keys(ACTION_LABEL) as PromotionAction[]).map((a) => (
                    <Button
                      key={a}
                      variant="secondary"
                      onClick={() => bulkSetAction(a)}
                      disabled={isBusy}
                      className="text-xs"
                    >
                      {ACTION_LABEL[a]}
                    </Button>
                  ))}
                </div>

                {targetYear &&
                  (targetGroupsQuery.isLoading ||
                    (targetGroups?.results ?? []).length > 0) && (
                  <select
                    onChange={(e) => {
                      if (e.target.value) bulkSetTarget(e.target.value);
                      e.target.value = "";
                    }}
                    className="rounded-lg border border-line bg-paper-elevated px-2 py-1 text-xs text-ink"
                    defaultValue=""
                    disabled={
                      isBusy ||
                      targetGroupsQuery.isLoading ||
                      targetGroupsQuery.isError
                    }
                    aria-label="تعيين مجموعة لجميع الطلاب المحددين"
                  >
                    <option value="">
                      {targetGroupsQuery.isLoading
                        ? "جارٍ تحميل المجموعات..."
                        : "تعيين مجموعة..."}
                    </option>
                    {(targetGroups?.results ?? []).map((g) => (
                      <option key={g.id} value={g.id}>
                        {groupLabel(g)}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setSelectedIds(new Set());
                    setPreview(null);
                  }}
                  disabled={isBusy}
                  className="ms-auto text-xs text-ink-500 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                >
                  إلغاء التحديد
                </button>
              </div>
            </div>
          )}

          {/* Summary cards — for SELECTED only */}
          {selectedRows.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(Object.keys(ACTION_LABEL) as PromotionAction[]).map((a) => (
                <div key={a} className="p-3 text-center card">
                  <p className="text-xs text-ink-400">{ACTION_LABEL[a]}</p>
                  <p className="mt-1 font-display text-xl font-bold tabular-nums text-ink">
                    {summary[a]}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Students table */}
          {items.length > 0 && (
            <>
              <div className="grid gap-3 md:hidden">
                {items.map((enrollment) => {
                  const row = rows[enrollment.id] ?? {
                    enrollment,
                    action: "PROMOTE" as PromotionAction,
                    target_group: "",
                  };
                  const isSelected = selectedIds.has(enrollment.id);
                  return (
                    <article
                      key={enrollment.id}
                      className={`card p-4 ${
                        isSelected ? "border-2 border-ink" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(enrollment.id)}
                          disabled={isBusy}
                          className="mt-1 h-4 w-4 cursor-pointer accent-ink"
                          aria-label={`تحديد ${enrollment.student_name}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-ink">
                            {enrollment.student_name}
                          </p>
                          <p className="truncate text-xs text-ink-500">
                            {enrollment.student_email}
                          </p>
                          <p className="mt-2 text-sm text-ink-600">
                            {enrollment.group_name}
                            <span className="mx-1 text-ink-400">·</span>
                            {enrollment.academic_year_name}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-600">
                          قرار الطالب
                          <select
                            value={row.action}
                            onChange={(event) =>
                              setRowAction(
                                enrollment.id,
                                event.target.value as PromotionAction,
                              )
                            }
                            disabled={!isSelected || isBusy}
                            className="rounded-lg border border-line bg-paper-elevated px-3 py-2 text-sm text-ink disabled:bg-paper-muted disabled:text-ink-400"
                            aria-label={`قرار ${enrollment.student_name}`}
                          >
                            {(Object.keys(ACTION_LABEL) as PromotionAction[]).map(
                              (action) => (
                                <option key={action} value={action}>
                                  {ACTION_LABEL[action]}
                                </option>
                              ),
                            )}
                          </select>
                        </label>

                        {row.action !== "GRADUATE" && (
                          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-600">
                            المجموعة في السنة الهدف
                            <select
                              value={row.target_group}
                              onChange={(event) =>
                                setRowTargetGroup(
                                  enrollment.id,
                                  event.target.value,
                                )
                              }
                              disabled={
                                !isSelected ||
                                !targetYear ||
                                isBusy ||
                                targetGroupsQuery.isLoading ||
                                targetGroupsQuery.isError
                              }
                              className="rounded-lg border border-line bg-paper-elevated px-3 py-2 text-sm text-ink disabled:bg-paper-muted disabled:text-ink-400"
                              aria-label={`مجموعة ${enrollment.student_name}`}
                            >
                              <option value="">اختر المجموعة</option>
                              {(targetGroups?.results ?? []).map((group) => (
                                <option key={group.id} value={group.id}>
                                  {groupLabel(group)}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto card md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-ink-50 text-start text-ink-700">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <span className="sr-only">تحديد</span>
                  </th>
                  <th className="px-4 py-3 font-medium text-start">الطالب</th>
                  <th className="px-4 py-3 font-medium text-start">
                    المجموعة الحالية
                  </th>
                  <th className="px-4 py-3 font-medium text-start">الإجراء</th>
                  <th className="px-4 py-3 font-medium text-start">
                    المجموعة الجديدة
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => {
                  const row = rows[e.id] ?? {
                    enrollment: e,
                    action: "PROMOTE" as PromotionAction,
                    target_group: "",
                  };
                  const isSelected = selectedIds.has(e.id);
                  return (
                    <tr
                      key={e.id}
                      className={`border-b border-line last:border-0 transition-colors ${
                        isSelected ? "bg-ink-50/40" : ""
                      }`}
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(e.id)}
                          disabled={isBusy}
                          className="h-4 w-4 cursor-pointer accent-ink"
                          aria-label={`تحديد ${e.student_name}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{e.student_name}</p>
                        <p className="text-xs text-ink-400">{e.student_email}</p>
                      </td>
                      <td className="px-4 py-3 text-ink-500">
                        <div>{e.group_name}</div>
                        <div className="text-xs">{e.academic_year_name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={row.action}
                          onChange={(ev) => {
                            setRowAction(
                              e.id,
                              ev.target.value as PromotionAction,
                            );
                          }}
                          disabled={!isSelected || isBusy}
                          className="rounded-lg border border-line bg-paper-elevated px-2 py-1 text-xs text-ink disabled:bg-paper-muted disabled:text-ink-400"
                          aria-label={`إجراء ${e.student_name}`}
                        >
                          {(Object.keys(ACTION_LABEL) as PromotionAction[]).map(
                            (a) => (
                              <option key={a} value={a}>
                                {ACTION_LABEL[a]}
                              </option>
                            ),
                          )}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {row.action === "GRADUATE" ? (
                          <span className="text-xs text-ink-400">— لا يحتاج</span>
                        ) : (
                          <select
                            value={row.target_group}
                            onChange={(ev) => {
                              setRowTargetGroup(e.id, ev.target.value);
                            }}
                            disabled={
                              !isSelected ||
                              !targetYear ||
                              isBusy ||
                              targetGroupsQuery.isLoading ||
                              targetGroupsQuery.isError
                            }
                            className="rounded-lg border border-line bg-paper-elevated px-2 py-1 text-xs text-ink disabled:bg-paper-muted disabled:text-ink-400"
                            aria-label={`المجموعة الجديدة لـ ${e.student_name}`}
                          >
                            <option value="">اختر...</option>
                            {(targetGroups?.results ?? []).map((g) => (
                              <option key={g.id} value={g.id}>
                                {groupLabel(g)}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
              </div>
            </>
          )}

          {/* Validation messages */}
          {selectedIds.size > 0 && !targetYear && (
            <p className="text-sm text-danger">اختر السنة الهدف أولاً.</p>
          )}
          {selectedIds.size === 0 && (
            <p className="text-sm text-ink-400">
              حدد طالباً واحداً على الأقل للمتابعة.
            </p>
          )}
          {missingTargets > 0 && (
            <p className="text-sm text-danger">
              {missingTargets} طالب لم تُحدَّد مجموعته الجديدة.
            </p>
          )}

          {/* ============ Preview / Execute ============ */}
          <div className="p-5 card">
            {serverError && (
              <p className="mb-3 rounded-lg bg-danger/5 px-3 py-2 text-sm text-danger">
                {serverError}
              </p>
            )}

            {!preview && (
              <Button
                onClick={handlePreview}
                disabled={!canPreview}
                className="w-full"
              >
                {isPreviewing
                  ? "جارٍ المعاينة..."
                  : `معاينة ترقية ${selectedIds.size} طالب`}
              </Button>
            )}

            {preview && (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-ink-700">
                  معاينة — {preview.results.length} طالب. لم يُنفَّذ أي تغيير بعد.
                </p>

                <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line text-sm">
                  {preview.results.map((res) => {
                    const row = rows[res.from_enrollment];
                    const fromGroup = row?.enrollment.group_name ?? "—";
                    const targetGroup = targetGroups?.results.find(
                      (group) => group.id === res.to_group,
                    );
                    const toGroup =
                      res.action === "GRADUATE"
                        ? "—"
                        : targetGroup
                          ? groupLabel(targetGroup)
                          : "—";
                    return (
                      <li
                        key={res.from_enrollment}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <span className="truncate text-ink">
                          {row?.enrollment.student_name ?? "—"}
                        </span>
                        <span className="shrink-0 text-xs text-ink-500">
                          {fromGroup} →{" "}
                          <strong className="text-ink">{toGroup}</strong> (
                          {ACTION_LABEL[res.action]})
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    onClick={() => setConfirmExecute(true)}
                    disabled={isBusy}
                    variant="danger"
                    className="flex-1"
                  >
                    {isExecuting ? "جارٍ التنفيذ..." : "تنفيذ القرارات"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setPreview(null)}
                    disabled={isBusy}
                  >
                    تعديل الاختيار
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ============ Confirm dialog before execute ============ */}
      <ConfirmDialog
        open={confirmExecute}
        title={`تأكيد تنفيذ قرارات ${selectedIds.size} طالب`}
        description={`سيتم إنشاء ${
          summary.PROMOTE + summary.REPEAT + summary.TRANSFER
        } تسجيل جديد، وتحديث حالة ${selectedIds.size} تسجيل مصدر، منها ${
          summary.GRADUATE
        } حالة تخرّج. هذا الإجراء لا يمكن التراجع عنه.`}
        confirmLabel={isExecuting ? "..." : "نعم، نفّذ القرارات"}
        cancelLabel="إلغاء"
        variant="danger"
        onConfirm={handleExecute}
        onCancel={() => setConfirmExecute(false)}
        isPending={isExecuting}
      />
    </div>
  );
}