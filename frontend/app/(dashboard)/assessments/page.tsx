"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AssessmentCard } from "@/components/assessments/AssessmentCard";
import { StudentAssessmentCard } from "@/components/assessments/StudentAssessmentCard";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ListPage } from "@/components/ui/ListPage";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  deleteAssessment,
  duplicateAssessment,
  listStaffAssessments,
  listStudentAssessments,
  startAssessment,
  statusLabel,
} from "@/lib/api/assessments";
import { useAuthStore } from "@/lib/auth/store";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type {
  AssessmentStatus,
  StaffAssessment,
  StudentAssessment,
} from "@/types";

const PAGE_SIZE = 20;

const TYPE_LABEL: Record<string, string> = {
  QUIZ: "اختبار قصير",
  PRACTICE: "تدريب",
  MONTHLY_EXAM: "امتحان شهري",
  MIDTERM: "نصف العام",
  HALF_YEAR_EXAM: "نصف العام",
  FINAL: "نهائي",
  END_OF_TERM: "نهاية الترم",
  END_OF_YEAR: "نهاية العام",
  MOCK_EXAM: "امتحان تجريبي",
  ASSIGNMENT: "واجب",
};

const SORT_OPTIONS = [
  { value: "-created_at", label: "الأحدث أولاً" },
  { value: "created_at", label: "الأقدم أولاً" },
  { value: "title", label: "الاسم (أ-ي)" },
  { value: "-starts_at", label: "الأقرب بدءاً" },
];

const STATUS_TABS = [
  { key: "ALL", label: "الكل" },
  { key: "DRAFT", label: "مسودات" },
  { key: "PUBLISHED", label: "منشورة" },
  { key: "CLOSED", label: "مغلقة" },
  { key: "ARCHIVED", label: "مؤرشفة" },
] as const;

type ViewMode = "grid" | "table";
const VIEW_STORAGE_KEY = "assessments_view_mode";

function statusVariant(
  status: AssessmentStatus,
): "success" | "warning" | "neutral" {
  if (status === "PUBLISHED") return "success";
  if (status === "DRAFT") return "warning";
  return "neutral";
}

export default function AssessmentsPage() {
  const role = useAuthStore((s) => s.user?.role);
  return role === "STUDENT" ? <StudentAssessments /> : <StaffAssessments />;
}

// ============================================================
// Student view
// ============================================================

function StudentAssessments() {
  const router = useRouter();
  const [startError, setStartError] = useState<string | null>(null);
  const [confirmAssessment, setConfirmAssessment] =
    useState<StudentAssessment | null>(null);

  const q = useQuery({
    queryKey: ["assessments"],
    queryFn: listStudentAssessments,
    refetchInterval: 30_000,
  });

  const startMutation = useMutation({
    mutationFn: startAssessment,
    onSuccess: (attempt) => router.push(`/exam/${attempt.id}`),
    onError: (err: unknown) => {
      const detail = (
        err as { response?: { data?: { error?: { detail?: unknown } } } }
      )?.response?.data?.error?.detail;
      setStartError(typeof detail === "string" ? detail : "تعذّر بدء الامتحان.");
      setConfirmAssessment(null);
    },
  });

  function handleConfirmStart() {
    if (!confirmAssessment) return;
    if (confirmAssessment.force_fullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    startMutation.mutate(confirmAssessment.id);
  }

  const items = q.data?.results ?? [];

  return (
    <>
      {startError && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          {startError}
        </div>
      )}
      <ListPage
        title="الامتحانات المتاحة"
        description={
          items.length > 0
            ? `${items.length} امتحان`
            : "سيظهر هنا أي امتحان يُنشر ويستهدفك."
        }
        isLoading={q.isLoading}
        isError={q.isError}
        errorMessage="تعذّر تحميل الامتحانات."
        onRetry={() => q.refetch()}
        isEmpty={items.length === 0}
        emptyIcon="📝"
        emptyDescription="سيظهر هنا أي امتحان يُنشر ويستهدفك."
        searchable={false}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => (
            <StudentAssessmentCard
              key={a.id}
              assessment={a}
              onStart={() => {
                setStartError(null);
                setConfirmAssessment(a);
              }}
              isStarting={startMutation.isPending}
            />
          ))}
        </div>
      </ListPage>

      {confirmAssessment && (
        <ConfirmDialog
          open
          title={
            confirmAssessment.has_in_progress_attempt
              ? "استئناف الامتحان"
              : "بدء الامتحان"
          }
          description={buildConfirmMessage(confirmAssessment)}
          confirmLabel={
            startMutation.isPending
              ? "..."
              : confirmAssessment.has_in_progress_attempt
                ? "استئناف"
                : "بدء الآن"
          }
          cancelLabel="إلغاء"
          variant="default"
          onConfirm={handleConfirmStart}
          onCancel={() => setConfirmAssessment(null)}
          isPending={startMutation.isPending}
        />
      )}
    </>
  );
}

function buildConfirmMessage(a: StudentAssessment): string {
  if (a.has_in_progress_attempt) {
    return "لديك محاولة قيد التنفيذ. سيتم استئنافها من حيث توقفت.";
  }

  const parts: string[] = ["سيبدأ الامتحان فورًا."];
  const w = a.window;
  if (w?.max_duration_if_started_now) {
    const mins = Math.floor(w.max_duration_if_started_now / 60);
    parts.push(`معاك ${mins} دقيقة فقط.`);
  } else if (a.duration_minutes) {
    parts.push(`المدة: ${a.duration_minutes} دقيقة.`);
  }
  if (a.max_attempts > 0) {
    parts.push(
      `ستُحتسب محاولة رقم ${a.my_attempts_used + 1} من ${a.max_attempts}.`,
    );
  }
  if (w?.latest_entry_at) {
    const t = new Date(w.latest_entry_at).toLocaleTimeString("ar-EG", {
      hour: "2-digit",
      minute: "2-digit",
    });
    parts.push(`آخر وقت للدخول: ${t}.`);
  }
  parts.push("تأكد من استقرار الإنترنت قبل المتابعة.");
  return parts.join(" ");
}

// ============================================================
// Staff view
// ============================================================

function StaffAssessments() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // ---- URL state ----
  const [page, setPage] = useUrlState("p", "1");
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const [statusTab, setStatusTab] = useUrlState("status", "ALL");
  const [typeFilter, setTypeFilter] = useUrlState("type", "");
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

  // ---- Delete ----
  const [deleteTarget, setDeleteTarget] = useState<StaffAssessment | null>(
    null,
  );
  const [busyDelete, setBusyDelete] = useState(false);

  const apiStatus: AssessmentStatus | undefined =
    statusTab === "DRAFT" ||
    statusTab === "PUBLISHED" ||
    statusTab === "CLOSED" ||
    statusTab === "ARCHIVED"
      ? statusTab
      : undefined;

  const q = useQuery({
    queryKey: [
      "staff-assessments",
      pageNum,
      debouncedSearch,
      statusTab,
      typeFilter,
      sort,
    ],
    queryFn: () =>
      listStaffAssessments({
        page: pageNum,
        page_size: PAGE_SIZE,
        search: debouncedSearch || undefined,
        status: apiStatus,
        assessment_type: typeFilter || undefined,
        ordering: sort,
      }),
  });

  const items = q.data?.results ?? [];
  const total = q.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["staff-assessments"] });

  const hasActiveFilter =
    !!searchInput ||
    statusTab !== "ALL" ||
    typeFilter !== "" ||
    sort !== "-created_at";

  function clearFilters() {
    setSearchInput("");
    setSearchUrl("");
    setStatusTab("ALL");
    setTypeFilter("");
    setSort("-created_at");
    setPage("1");
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusyDelete(true);
    try {
      await deleteAssessment(deleteTarget.id);
      await invalidate();
      toastSuccess("تم حذف الامتحان");
      setDeleteTarget(null);
    } catch (err) {
      toastError(
        err,
        "تعذّر حذف الامتحان — قد تكون هناك محاولات مسجّلة. أرشفه بدلاً من ذلك.",
      );
    } finally {
      setBusyDelete(false);
    }
  }

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => duplicateAssessment(id),
    onSuccess: async (copy) => {
      await invalidate();
      toastSuccess(`تم إنشاء نسخة: ${copy.title}`);
      router.push(`/assessments/${copy.id}/edit`);
    },
    onError: (err) => toastError(err, "تعذّر نسخ الامتحان."),
  });

  function buildActions(a: StaffAssessment): ActionMenuItem[] {
    const canPreview = a.status === "DRAFT" || a.status === "PUBLISHED";
    const canViewAnalytics = a.status === "PUBLISHED";
    return [
      {
        label: "عرض / تحرير",
        onClick: () => router.push(`/assessments/${a.id}/edit`),
      },
      ...(a.status === "PUBLISHED"
        ? [
            {
              label: "النتائج",
              onClick: () => router.push(`/assessments/${a.id}/results`),
            },
          ]
        : []),
      ...(canPreview
        ? [
            {
              label: "معاينة كطالب",
              onClick: () => router.push(`/assessments/${a.id}/preview`),
            },
          ]
        : []),
      ...(canViewAnalytics
        ? [
            {
              label: "التحليلات",
              onClick: () => router.push(`/assessments/${a.id}/analytics`),
            },
          ]
        : []),
      {
        label: "نسخ الامتحان",
        onClick: () => duplicateMutation.mutate(a.id),
        disabled: duplicateMutation.isPending,
      },
      {
        label: "حذف",
        variant: "danger" as const,
        onClick: () => setDeleteTarget(a),
      },
    ];
  }

  return (
    <>
      <ListPage
        title="الامتحانات"
        description={`${total} امتحان في مؤسستك`}
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
            <Link href="/assessments/new">
              <Button>+ إنشاء امتحان</Button>
            </Link>
          </>
        }
        tabs={STATUS_TABS.map((t) => ({ key: t.key, label: t.label }))}
        activeTab={statusTab}
        onTabChange={(k) => {
          setStatusTab(k);
          setPage("1");
        }}
        searchable
        searchValue={searchInput}
        searchPlaceholder="ابحث بعنوان الامتحان..."
        onSearchChange={setSearchInput}
        filters={[
          {
            key: "type",
            label: "الأنواع",
            value: typeFilter,
            options: Object.entries(TYPE_LABEL).map(([value, label]) => ({
              value,
              label,
            })),
            onChange: (v) => {
              setTypeFilter(v);
              setPage("1");
            },
          },
          {
            key: "sort",
            label: "الترتيب",
            value: sort,
            options: SORT_OPTIONS,
            onChange: (v) => {
              setSort(v || "-created_at");
              setPage("1");
            },
          },
        ]}
        hasActiveFilter={hasActiveFilter}
        onClearFilters={clearFilters}
        isLoading={q.isLoading}
        isError={q.isError}
        errorMessage="تعذّر تحميل الامتحانات."
        onRetry={() => q.refetch()}
        isEmpty={items.length === 0}
        emptyIcon="📝"
        emptyDescription={
          hasActiveFilter
            ? "جرّب مسح الفلاتر أو تعديل البحث."
            : "ابدأ بإنشاء أول امتحان لمؤسستك."
        }
        emptyAction={
          hasActiveFilter ? (
            <Button variant="ghost" onClick={clearFilters}>
              مسح الفلاتر
            </Button>
          ) : (
            <Link href="/assessments/new">
              <Button>+ إنشاء امتحان</Button>
            </Link>
          )
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((a) => (
              <AssessmentCard
                key={a.id}
                assessment={a}
                actions={buildActions(a)}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto card">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-ink-50 text-ink-700">
                <tr>
                  <th className="px-4 py-3 font-medium text-start">العنوان</th>
                  <th className="px-4 py-3 font-medium text-start">النوع</th>
                  <th className="px-4 py-3 font-medium text-start">الحالة</th>
                  <th className="px-4 py-3 font-medium text-start">المدة</th>
                  <th className="px-4 py-3 font-medium text-start">
                    تاريخ الإنشاء
                  </th>
                  <th className="w-12 px-2 py-3" aria-label="actions" />
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-line transition-colors last:border-0 hover:bg-ink-50/30"
                  >
                    <td className="px-4 py-3 font-medium text-ink">
                      <Link
                        href={`/assessments/${a.id}/edit`}
                        className="hover:underline"
                      >
                        {a.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink-400">
                      {TYPE_LABEL[a.assessment_type] ?? a.assessment_type}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge variant={statusVariant(a.status)}>
                        {statusLabel(a.status)}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-ink-400">
                      {a.duration_minutes
                        ? `${a.duration_minutes} دقيقة`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-400">
                      {new Date(a.created_at).toLocaleDateString("ar-EG")}
                    </td>
                    <td className="px-2 py-3 text-end">
                      <ActionMenu items={buildActions(a)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ListPage>

      <ConfirmDialog
        open={!!deleteTarget}
        title="تأكيد الحذف"
        description={
          deleteTarget
            ? `سيتم حذف الامتحان "${deleteTarget.title}" نهائيًا. ` +
              (deleteTarget.status !== "DRAFT"
                ? "تأكد أنه لا توجد محاولات مسجّلة، وإلا سيرفض النظام الحذف ويقترح الأرشفة."
                : "لا يمكن التراجع.")
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