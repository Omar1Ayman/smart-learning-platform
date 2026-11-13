"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { QuestionBankForm } from "@/components/questions/QuestionBankForm";
import { QuestionForm } from "@/components/questions/QuestionForm";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorState, Spinner } from "@/components/ui/States";
import {
  createQuestion,
  createQuestionBank,
  deleteQuestionBank,
  listQuestionBanks,
  updateQuestionBank,
  moveBankQuestions,
  type QuestionBankItem,
} from "@/lib/api/questions";
import { useAuthStore } from "@/lib/auth/store";
import { useCanWriteContent } from "@/lib/auth/useCanWrite";
import { extractErrorMessage, toastError, toastSuccess } from "@/lib/utils/toast";
import type { QuestionBankFormValues, QuestionFormValues } from "@/lib/validation/schemas";

// Helper to format dates nicely
const formatDate = (isoString: string) => {
  return new Date(isoString).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

type ViewMode = "grid" | "table";
const VIEW_STORAGE_KEY = "banks_view_mode";

export default function QuestionBanksPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canWrite = useCanWriteContent();
  const role = useAuthStore((s) => s.user?.role);
  const userId = useAuthStore((s) => s.user?.id);

  // ---- View Mode State ----
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

  // ---- Queries ----
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["question-banks", { page_size: 100 }],
    queryFn: () => listQuestionBanks({ page_size: 100 }),
    enabled: canWrite,
  });

  // ---- Modals & Action States ----
  const [createBankOpen, setCreateBankOpen] = useState(false);
  const [createQuestionOpen, setCreateQuestionOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<QuestionBankItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuestionBankItem | null>(null);
  const [moveTarget, setMoveTarget] = useState<QuestionBankItem | null>(null);
  
  const [busy, setBusy] = useState(false);
  const [moveDestination, setMoveDestination] = useState<string>("");

  const canManage = (bank: QuestionBankItem) =>
    role === "OWNER" || role === "ADMIN" || bank.created_by === userId;

  const banks = data?.results ?? [];

  // Filter out the source bank from the "move to" options
  const moveOptions = useMemo(() => {
    if (!moveTarget) return [];
    return banks.filter(b => b.id !== moveTarget.id);
  }, [banks, moveTarget]);

  // ---- Mutations ----
  async function handleCreateBank(values: QuestionBankFormValues) {
    try {
      await createQuestionBank({
        name: values.name,
        description: values.description ?? "",
      });
      await queryClient.invalidateQueries({ queryKey: ["question-banks"] });
      toastSuccess("تم إنشاء بنك الأسئلة");
      setCreateBankOpen(false);
    } catch (err) {
      toastError(err, "تعذّر إنشاء البنك.");
    }
  }

  async function handleCreateQuestion(values: QuestionFormValues) {
    try {
      await createQuestion({
        bank: values.bank,
        text: values.text,
        question_type: values.question_type,
        difficulty: values.difficulty,
        topic: values.topic,
        points: String(values.points),
        accepted_answers: values.accepted_answers_text
          ? values.accepted_answers_text.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
        options: values.options?.map((o, i) => ({
          text: o.text,
          is_correct: o.is_correct,
          order: i + 1,
        })),
      });
      await queryClient.invalidateQueries({ queryKey: ["questions"] });
      await queryClient.invalidateQueries({ queryKey: ["questions-stats"] });
      await queryClient.invalidateQueries({ queryKey: ["question-banks"] }); // To update count
      toastSuccess("تمت إضافة السؤال بنجاح");
      setCreateQuestionOpen(false);
    } catch (err) {
      toastError(err, "تعذّرت إضافة السؤال.");
    }
  }

  async function handleUpdate(values: QuestionBankFormValues) {
    if (!editTarget) return;
    try {
      await updateQuestionBank(editTarget.id, {
        name: values.name,
        description: values.description ?? "",
      });
      await queryClient.invalidateQueries({ queryKey: ["question-banks"] });
      toastSuccess("تم حفظ التعديلات");
      setEditTarget(null);
    } catch (err) {
      toastError(err, "تعذّر حفظ التعديلات.");
    }
  }

  async function handleMove() {
    if (!moveTarget || !moveDestination) return;
    setBusy(true);
    try {
      await moveBankQuestions(moveTarget.id, moveDestination);
      await queryClient.invalidateQueries({ queryKey: ["question-banks"] });
      await queryClient.invalidateQueries({ queryKey: ["questions"] });
      toastSuccess("تم نقل الأسئلة بنجاح. البنك الآن فارغ وجاهز للحذف.");
      setMoveTarget(null);
      setMoveDestination("");
    } catch (err) {
      toastError(err, "تعذّر نقل الأسئلة.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteQuestionBank(deleteTarget.id);
      await queryClient.invalidateQueries({ queryKey: ["question-banks"] });
      await queryClient.invalidateQueries({ queryKey: ["questions"] });
      await queryClient.invalidateQueries({ queryKey: ["questions-stats"] });
      toastSuccess("تم حذف البنك نهائياً");
      setDeleteTarget(null);
    } catch (err) {
      const msg = extractErrorMessage(err, "تعذّر حذف البنك.");
      toastError(new Error(msg), "");
    } finally {
      setBusy(false);
    }
  }

  // Shared Actions Menu for Table View
  function buildActions(bank: QuestionBankItem): ActionMenuItem[] {
    const hasQuestions = bank.questions_count > 0;
    return [
      {
        label: "تعديل",
        onClick: () => setEditTarget(bank),
      },
      ...(hasQuestions
        ? [
            {
              label: "نقل الأسئلة",
              onClick: () => setMoveTarget(bank),
            },
          ]
        : []),
      {
        label: "حذف",
        variant: "danger" as const,
        disabled: hasQuestions,
        onClick: () => {
          if (!hasQuestions) setDeleteTarget(bank);
        },
      },
    ];
  }

  if (!canWrite) {
    return (
      <ErrorState message="هذا القسم متاح فقط لفريق العمل (مالك/مسؤول/معلّم)." />
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-20">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-ink">
            بنوك الأسئلة
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            اختر بنكاً لعرض وإدارة أسئلته. يمكنك نقل الأسئلة بين البنوك لتنظيمها.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          
          {/* View Toggle */}
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

          <Button variant="secondary" onClick={() => setCreateQuestionOpen(true)}>
            + إضافة سؤال
          </Button>
          <Button onClick={() => setCreateBankOpen(true)}>+ بنك جديد</Button>
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <ErrorState message="تعذّر تحميل البنوك." onRetry={() => refetch()} />
      ) : banks.length === 0 ? (
        <div className="card p-12 text-center border-dashed">
          <p className="text-5xl mb-4">📚</p>
          <h3 className="text-lg font-bold text-ink">لا يوجد بنوك بعد</h3>
          <p className="mt-2 text-sm text-ink-400">
            أنشئ بنك الأسئلة الأول لتبدأ بتنظيم أسئلتك بذكاء.
          </p>
          <Button className="mt-6" onClick={() => setCreateBankOpen(true)}>
            + إنشاء بنك جديد
          </Button>
        </div>
      ) : viewMode === "grid" ? (
        /* ================= GRID VIEW ================= */
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {banks.map((bank) => {
            const isManageable = canManage(bank);
            const hasQuestions = bank.questions_count > 0;

            return (
              <div
                key={bank.id}
                className="group relative flex flex-col justify-between rounded-2xl border border-line bg-paper-elevated p-5 transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-card-hover"
              >
                <div>
                  {/* Top row: Icon & Badge */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                      <span className="text-xl">📚</span>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                      hasQuestions 
                        ? "bg-info/10 text-info" 
                        : "bg-ink-50 text-ink-400 dark:bg-ink-800"
                    }`}>
                      {bank.questions_count} سؤال
                    </span>
                  </div>

                  {/* Title & Description */}
                  <button
                    type="button"
                    onClick={() => router.push(`/questions?bank=${bank.id}`)}
                    className="text-start w-full"
                  >
                    <h3 className="truncate text-lg font-bold font-display text-ink group-hover:text-accent-dark transition-colors">
                      {bank.name}
                    </h3>
                    {bank.description ? (
                      <p className="mt-1 line-clamp-2 text-sm text-ink-400 leading-relaxed">
                        {bank.description}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-ink-300 italic">لا يوجد وصف</p>
                    )}
                  </button>
                </div>

                {/* Metadata */}
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[11px] text-ink-400">
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    {bank.created_by_name}
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    {formatDate(bank.created_at)}
                  </span>
                </div>

                {/* Actions Footer */}
                {isManageable && (
                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                    <button
                      onClick={() => setEditTarget(bank)}
                      className="text-xs font-medium text-ink-600 hover:text-ink dark:text-ink-300 dark:hover:text-white"
                    >
                      تعديل
                    </button>

                    {hasQuestions && (
                      <button
                        onClick={() => setMoveTarget(bank)}
                        className="text-xs font-medium text-info hover:text-info-dark"
                      >
                        نقل الأسئلة
                      </button>
                    )}

                    <button
                      onClick={() => setDeleteTarget(bank)}
                      disabled={hasQuestions}
                      title={hasQuestions ? "لا يمكن الحذف — البنك يحتوي على أسئلة. قم بنقلها أو حذفها أولاً." : "حذف البنك"}
                      className={`text-xs font-medium ml-auto transition-colors ${
                        hasQuestions
                          ? "cursor-not-allowed text-ink-300"
                          : "text-danger hover:underline"
                      }`}
                    >
                      حذف
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* ================= TABLE VIEW ================= */
        <div className="overflow-x-auto card">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-ink-50 text-ink-700">
              <tr>
                <th className="px-4 py-3 font-medium text-start">اسم البنك</th>
                <th className="px-4 py-3 font-medium text-start">الأسئلة</th>
                <th className="px-4 py-3 font-medium text-start">بواسطة</th>
                <th className="px-4 py-3 font-medium text-start">تاريخ الإنشاء</th>
                <th className="w-12 px-2 py-3" aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {banks.map((bank) => {
                const isManageable = canManage(bank);
                return (
                  <tr
                    key={bank.id}
                    className="border-b border-line transition-colors last:border-0 hover:bg-ink-50/30"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/questions?bank=${bank.id}`}
                        className="font-medium text-ink hover:underline block"
                      >
                        📚 {bank.name}
                      </Link>
                      {bank.description && (
                        <p className="mt-0.5 text-xs text-ink-400 line-clamp-1 max-w-xs">
                          {bank.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        bank.questions_count > 0 ? "bg-info/10 text-info" : "bg-ink-50 text-ink-400"
                      }`}>
                        {bank.questions_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-400">
                      {bank.created_by_name}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-400">
                      {formatDate(bank.created_at)}
                    </td>
                    <td className="px-2 py-3 text-end">
                      {isManageable && <ActionMenu items={buildActions(bank)} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {/* 1. Create Bank */}
      <QuickCreateModal
        open={createBankOpen}
        onClose={() => setCreateBankOpen(false)}
        title="بنك أسئلة جديد"
      >
        <QuestionBankForm onSubmit={handleCreateBank} onCancel={() => setCreateBankOpen(false)} />
      </QuickCreateModal>

      {/* 2. Create Question */}
      <QuickCreateModal
        open={createQuestionOpen}
        onClose={() => setCreateQuestionOpen(false)}
        title="إضافة سؤال سريع"
      >
        <QuestionForm onSubmit={handleCreateQuestion} onCancel={() => setCreateQuestionOpen(false)} />
      </QuickCreateModal>

      {/* 3. Edit Bank */}
      <QuickCreateModal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="تعديل البنك"
      >
        {editTarget && (
          <QuestionBankForm
            onSubmit={handleUpdate}
            onCancel={() => setEditTarget(null)}
            initialValues={{ name: editTarget.name, description: editTarget.description }}
          />
        )}
      </QuickCreateModal>

      {/* 4. Move Questions */}
      <QuickCreateModal
        open={!!moveTarget}
        onClose={() => { setMoveTarget(null); setMoveDestination(""); }}
        title="نقل الأسئلة"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-700 leading-relaxed">
            أنت على وشك نقل جميع الأسئلة من بنك <strong className="text-ink">"{moveTarget?.name}"</strong>.
            <br/>
            يرجى اختيار بنك الهدف الذي تريد نقل الأسئلة إليه:
          </p>
          
          <select
            value={moveDestination}
            onChange={(e) => setMoveDestination(e.target.value)}
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
          >
            <option value="" disabled>اختر بنك الهدف...</option>
            {moveOptions.map(b => (
              <option key={b.id} value={b.id}>{b.name} ({b.questions_count} سؤال)</option>
            ))}
          </select>

          <div className="mt-4 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => { setMoveTarget(null); setMoveDestination(""); }}>
              إلغاء
            </Button>
            <Button 
              onClick={handleMove} 
              disabled={!moveDestination || busy}
            >
              {busy ? "جارٍ النقل..." : "تأكيد النقل"}
            </Button>
          </div>
        </div>
      </QuickCreateModal>

      {/* 5. Delete Bank */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="تأكيد حذف البنك"
        description={`سيتم حذف بنك "${deleteTarget?.name}" نهائياً. هذا الإجراء لا يمكن التراجع عنه.`}
        confirmLabel={busy ? "جارٍ الحذف..." : "حذف نهائي"}
        cancelLabel="إلغاء"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        isPending={busy}
      />
    </div>
  );
}