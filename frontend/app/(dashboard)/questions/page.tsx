"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { QuestionCard } from "@/components/questions/QuestionCard";
import { QuestionForm } from "@/components/questions/QuestionForm";
import { QuestionTypePicker } from "@/components/questions/QuestionTypePicker";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ListPage } from "@/components/ui/ListPage";
import { Upload } from "@/components/ui/icons";
import {
  approveQuestion,
  createQuestion,
  deleteQuestion,
  duplicateQuestion,
  getQuestionStats,
  listQuestionBanks,
  listQuestions,
  rejectQuestion,
  type QuestionItem,
  type QuestionType,
  type ReviewStatus,
} from "@/lib/api/questions";
import { useAuthStore } from "@/lib/auth/store";
import { useCanWriteContent } from "@/lib/auth/useCanWrite";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type { QuestionFormValues } from "@/lib/validation/schemas";

const PAGE_SIZE = 20;

const TYPE_LABEL: Record<QuestionType, string> = {
  MCQ: "اختيار متعدد",
  TRUE_FALSE: "صح / خطأ",
  SHORT_ANSWER: "إجابة قصيرة",
  ESSAY: "مقالي",
};

const SORT_OPTIONS = [
  { value: "-created_at", label: "الأحدث أولاً" },
  { value: "created_at", label: "الأقدم أولاً" },
  { value: "text", label: "نص السؤال (أ-ي)" },
  { value: "points", label: "الأقل نقاطاً" },
  { value: "-points", label: "الأكثر نقاطاً" },
];

export default function QuestionsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const userId = useAuthStore((s) => s.user?.id);
  const isStaff = useCanWriteContent();
  const canReview = role === "OWNER" || role === "ADMIN";

  // ---- URL state ----
  const [page, setPage] = useUrlState("p", "1");
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const [statusTabRaw, setStatusTabRaw] = useUrlState("status", "all");
  const statusTab: "all" | ReviewStatus =
    statusTabRaw === "PENDING" ||
    statusTabRaw === "APPROVED" ||
    statusTabRaw === "REJECTED"
      ? statusTabRaw
      : "all";
  const [typeFilter, setTypeFilter] = useUrlState("type", "");
  const [difficultyFilter, setDifficultyFilter] = useUrlState("difficulty", "");
  const [bankFilter, setBankFilter] = useUrlState("bank", "");
  const [sort, setSort] = useUrlState("sort", "-created_at");
  const [searchUrl, setSearchUrl] = useUrlState("q", "");

  const [searchInput, setSearchInput] = useState(searchUrl);
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  useEffect(() => {
    if (debouncedSearch !== searchUrl) setSearchUrl(debouncedSearch);
  }, [debouncedSearch, searchUrl, setSearchUrl]);

  // ---- Modals ----
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<
    "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "ESSAY" | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<QuestionItem | null>(null);
  const [rejectTarget, setRejectTarget] = useState<QuestionItem | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);

  // ---- Selection + expand ----
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedIds(new Set());
    setExpandedIds(new Set());
  }, [
    searchUrl,
    statusTab,
    typeFilter,
    difficultyFilter,
    bankFilter,
    sort,
    pageNum,
  ]);

  // ---- Queries ----
  const { data: stats } = useQuery({
    queryKey: ["questions-stats"],
    queryFn: getQuestionStats,
    enabled: isStaff,
  });

  const { data: banks } = useQuery({
    queryKey: ["question-banks"],
    queryFn: () => listQuestionBanks(),
    enabled: isStaff,
  });
  const bankMap = useMemo(
    () => new Map((banks?.results ?? []).map((b) => [b.id, b.name])),
    [banks],
  );

  const q = useQuery({
    queryKey: [
      "questions",
      pageNum,
      debouncedSearch,
      statusTab,
      typeFilter,
      difficultyFilter,
      bankFilter,
      sort,
    ],
    queryFn: () =>
      listQuestions({
        page: pageNum,
        page_size: PAGE_SIZE,
        search: debouncedSearch || undefined,
        review_status__in: statusTab === "all" ? undefined : statusTab,
        question_type: (typeFilter as QuestionType) || undefined,
        difficulty:
          (difficultyFilter as "EASY" | "MEDIUM" | "HARD") || undefined,
        bank: bankFilter || undefined,
        ordering: sort,
      }),
    enabled: isStaff,
  });

  const questions = q.data?.results ?? [];
  const total = q.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["questions"] });
    queryClient.invalidateQueries({ queryKey: ["questions-stats"] });
  };

  const hasActiveFilter =
    !!searchInput ||
    statusTab !== "all" ||
    typeFilter !== "" ||
    difficultyFilter !== "" ||
    bankFilter !== "" ||
    sort !== "-created_at";

  function clearFilters() {
    setSearchInput("");
    setSearchUrl("");
    setStatusTabRaw("all");
    setTypeFilter("");
    setDifficultyFilter("");
    setBankFilter("");
    setSort("-created_at");
    setPage("1");
  }

  // ---- Mutations ----
  async function handleCreate(values: QuestionFormValues) {
    try {
      await createQuestion({
        bank: values.bank,
        text: values.text,
        question_type: values.question_type,
        difficulty: values.difficulty,
        topic: values.topic,
        points: String(values.points),
        accepted_answers: values.accepted_answers_text
          ? values.accepted_answers_text
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
        options: values.options?.map((o, i) => ({
          text: o.text,
          is_correct: o.is_correct,
          order: i + 1,
        })),
      });
      await invalidateAll();
      toastSuccess("تمت إضافة السؤال — سيُرسل للمراجعة");
      setCreateOpen(false);
    } catch (err) {
      toastError(err, "تعذّرت إضافة السؤال.");
    }
  }

  async function handleDuplicate(question: QuestionItem) {
    try {
      const copy = await duplicateQuestion(question.id);
      await invalidateAll();
      toastSuccess(`تم إنشاء نسخة: ${copy.text.slice(0, 60)}`);
    } catch (err) {
      toastError(err, "تعذّر نسخ السؤال.");
    }
  }

  async function handleApprove(question: QuestionItem) {
    try {
      await approveQuestion(question.id);
      await invalidateAll();
      toastSuccess("تم اعتماد السؤال");
    } catch (err) {
      toastError(err, "تعذّر اعتماد السؤال.");
    }
  }

  async function handleRejectSubmit() {
    if (!rejectTarget) return;
    try {
      await rejectQuestion(rejectTarget.id, rejectNote);
      await invalidateAll();
      toastSuccess("تم رفض السؤال");
      setRejectTarget(null);
      setRejectNote("");
    } catch (err) {
      toastError(err, "تعذّر رفض السؤال.");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusyDelete(true);
    try {
      await deleteQuestion(deleteTarget.id);
      await invalidateAll();
      toastSuccess("تم حذف السؤال");
      setDeleteTarget(null);
    } catch (err) {
      toastError(err, "تعذّر حذف السؤال.");
    } finally {
      setBusyDelete(false);
    }
  }

  async function handleBulkApprove() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    let succeeded = 0;
    let ownQuestion = 0;
    let otherError = 0;

    for (const id of ids) {
      try {
        await approveQuestion(id);
        succeeded++;
      } catch (err) {
        const detail = (
          err as { response?: { data?: { error?: { detail?: unknown } } } }
        )?.response?.data?.error?.detail;
        if (typeof detail === "string" && detail.includes("أنشأته")) {
          ownQuestion++;
        } else {
          otherError++;
        }
      }
    }

    await invalidateAll();
    setSelectedIds(new Set());

    if (ownQuestion > 0 || otherError > 0) {
      const parts: string[] = [];
      if (succeeded > 0) parts.push(`اعتُمد ${succeeded}`);
      if (ownQuestion > 0) parts.push(`${ownQuestion} من إنشائك`);
      if (otherError > 0) parts.push(`${otherError} فشل`);
      toastError(new Error(parts.join(" · ")), "");
    } else {
      toastSuccess(`تم اعتماد ${succeeded} سؤال.`);
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setBusyDelete(true);
    let succeeded = 0;
    const failed: string[] = [];

    for (const id of ids) {
      try {
        await deleteQuestion(id);
        succeeded++;
      } catch {
        failed.push(id);
      }
    }

    await invalidateAll();
    setSelectedIds(new Set(failed));

    if (failed.length === 0) {
      toastSuccess(`تم حذف ${succeeded} سؤال.`);
    } else {
      toastError(new Error(`تم حذف ${succeeded} — فشل ${failed.length}.`), "");
    }

    setConfirmBulkDelete(false);
    setBusyDelete(false);
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function buildActions(question: QuestionItem) {
    const canEdit = canReview || question.created_by === userId;
    return [
      ...(canReview && question.review_status === "PENDING"
        ? [
            { label: "اعتماد", onClick: () => handleApprove(question) },
            {
              label: "رفض",
              onClick: () => {
                setRejectTarget(question);
                setRejectNote("");
              },
            },
          ]
        : []),
      { label: "نسخ السؤال", onClick: () => handleDuplicate(question) },
      ...(canEdit
        ? [
            {
              label: "تعديل",
              onClick: () => router.push(`/questions/${question.id}/edit`),
            },
            {
              label: "حذف",
              variant: "danger" as const,
              onClick: () => setDeleteTarget(question),
            },
          ]
        : []),
    ];
  }

  if (!isStaff) {
    return (
      <ListPage
        title="الأسئلة"
        isLoading={false}
        isError={false}
        isEmpty={false}
        emptyDescription="هذا القسم متاح فقط لفريق العمل (مالك/مسؤول/معلّم)."
      >
        {null}
      </ListPage>
    );
  }

  const bulkBar =
    selectedIds.size > 0 ? (
      <div className="sticky top-16 z-30 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ink px-4 py-2.5 text-sm text-white shadow-lg animate-slide-in-up">
        <div className="flex items-center gap-3">
          <span className="font-medium">تم تحديد {selectedIds.size} سؤال</span>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-white/70 hover:text-white"
          >
            إلغاء التحديد
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canReview && (
            <button
              onClick={handleBulkApprove}
              className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
            >
              اعتماد المحدد
            </button>
          )}
          <button
            onClick={() => setConfirmBulkDelete(true)}
            className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-danger hover:bg-white/90"
          >
            حذف المحدد ({selectedIds.size})
          </button>
        </div>
      </div>
    ) : null;

  return (
    <>
      <ListPage
        title="الأسئلة"
        description={
          stats
            ? `${stats.total} سؤال في البنك${
                stats.pending > 0 ? ` · ${stats.pending} بانتظار المراجعة` : ""
              }`
            : undefined
        }
        actions={
          <>
            <Link href="/banks">
              <Button variant="secondary">📚 البنوك</Button>
            </Link>
            <Link href="/questions/import">
              <Button variant="secondary">
                <Upload size={14} />
                استيراد
              </Button>
            </Link>
            <Button
              onClick={() => {
                setCreateOpen(true);
                setCreateType(null);
              }}
            >
              + إضافة سؤال
            </Button>
          </>
        }
        tabs={[
          { key: "all", label: "الكل", count: stats?.total ?? 0 },
          {
            key: "PENDING",
            label: "بانتظار المراجعة",
            count: stats?.pending ?? 0,
          },
          { key: "APPROVED", label: "معتمد", count: stats?.approved ?? 0 },
          { key: "REJECTED", label: "مرفوض", count: stats?.rejected ?? 0 },
        ]}
        activeTab={statusTab}
        onTabChange={(k) => {
          setStatusTabRaw(k);
          setPage("1");
        }}
        searchable
        searchValue={searchInput}
        searchPlaceholder="ابحث في نص السؤال أو الموضوع..."
        onSearchChange={setSearchInput}
        filters={[
          {
            key: "type",
            label: "الأنواع",
            value: typeFilter,
            options: (Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => ({
              value: t,
              label: TYPE_LABEL[t],
            })),
            onChange: (v) => {
              setTypeFilter(v);
              setPage("1");
            },
          },
          {
            key: "difficulty",
            label: "المستويات",
            value: difficultyFilter,
            options: [
              { value: "EASY", label: "سهل" },
              { value: "MEDIUM", label: "متوسط" },
              { value: "HARD", label: "صعب" },
            ],
            onChange: (v) => {
              setDifficultyFilter(v);
              setPage("1");
            },
          },
          {
            key: "bank",
            label: "البنوك",
            value: bankFilter,
            options: (banks?.results ?? []).map((b) => ({
              value: b.id,
              label: b.name,
            })),
            onChange: (v) => {
              setBankFilter(v);
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
        bulkBar={bulkBar}
        isLoading={q.isLoading}
        isError={q.isError}
        errorMessage="تعذّر تحميل الأسئلة."
        onRetry={() => q.refetch()}
        isEmpty={questions.length === 0}
        emptyIcon="📝"
        emptyDescription={
          hasActiveFilter
            ? "جرّب مسح الفلاتر أو تعديل البحث."
            : "أضف سؤالك الأول — سيُرسل للمراجعة تلقائيًا."
        }
        emptyAction={
          hasActiveFilter ? (
            <Button variant="ghost" onClick={clearFilters}>
              مسح الفلاتر
            </Button>
          ) : (
            <Button
              onClick={() => {
                setCreateOpen(true);
                setCreateType(null);
              }}
            >
              + إضافة سؤال
            </Button>
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
        {bankFilter && bankMap.get(bankFilter) && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-info/30 bg-info/5 px-3 py-2 text-sm">
            <span className="text-ink-700">
              عرض أسئلة بنك: <strong>{bankMap.get(bankFilter)}</strong>
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setBankFilter("");
                  setPage("1");
                }}
                className="text-xs text-ink-700 hover:underline"
              >
                إظهار كل الأسئلة
              </button>
              <Link
                href="/banks"
                className="text-xs font-medium text-accent-dark hover:underline"
              >
                ← كل البنوك
              </Link>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {questions.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              bankName={bankMap.get(question.bank) ?? "—"}
              actions={buildActions(question)}
              selectable
              selected={selectedIds.has(question.id)}
              onSelect={() => toggleOne(question.id)}
              expanded={expandedIds.has(question.id)}
              onToggleExpand={() => toggleExpand(question.id)}
            />
          ))}
        </div>
      </ListPage>

      {/* Two-stage create flow */}
      <QuickCreateModal
        open={createOpen && createType === null}
        onClose={() => {
          setCreateOpen(false);
          setCreateType(null);
        }}
        title="إضافة سؤال"
      >
        <QuestionTypePicker onPick={(type) => setCreateType(type)} />
      </QuickCreateModal>

      <QuickCreateModal
        open={createOpen && createType !== null}
        onClose={() => {
          setCreateOpen(false);
          setCreateType(null);
        }}
        title="إضافة سؤال"
      >
        {createType && (
          <QuestionForm
            onSubmit={async (values) => {
              await handleCreate(values);
              setCreateType(null);
            }}
            onCancel={() => {
              setCreateOpen(false);
              setCreateType(null);
            }}
            initialType={createType}
          />
        )}
      </QuickCreateModal>

      {/* Reject modal */}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => {
            setRejectTarget(null);
            setRejectNote("");
          }}
        >
          <div
            className="w-full max-w-md p-6 shadow-xl card"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold font-display text-ink">
              رفض السؤال
            </h2>
            <p className="mt-1 text-xs line-clamp-2 text-ink-400">
              {rejectTarget.text}
            </p>
            <div className="mt-4 flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink-700">
                سبب الرفض (اختياري)
              </label>
              <textarea
                rows={3}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="مثال: الصياغة غير واضحة..."
                className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectNote("");
                }}
              >
                إلغاء
              </Button>
              <Button variant="danger" onClick={handleRejectSubmit}>
                رفض السؤال
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Single delete */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="تأكيد الحذف"
        description={
          deleteTarget
            ? `سيتم حذف السؤال "${deleteTarget.text.slice(0, 60)}..." نهائيًا. لا يمكن التراجع.`
            : ""
        }
        confirmLabel={busyDelete ? "جارٍ الحذف..." : "حذف نهائي"}
        cancelLabel="إلغاء"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        isPending={busyDelete}
      />

      {/* Bulk delete */}
      <ConfirmDialog
        open={confirmBulkDelete}
        title={`تأكيد حذف ${selectedIds.size} سؤال`}
        description={`سيتم حذف ${selectedIds.size} سؤال نهائيًا. لا يمكن التراجع.`}
        confirmLabel={busyDelete ? "جارٍ الحذف..." : "حذف الكل"}
        cancelLabel="إلغاء"
        variant="danger"
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
        isPending={busyDelete}
      />
    </>
  );
}