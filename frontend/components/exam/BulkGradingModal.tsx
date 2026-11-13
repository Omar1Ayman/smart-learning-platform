"use client";

import { useMutation, useQueries  } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FormFooter } from "@/components/ui/FormFooter";
import { ErrorState, Spinner } from "@/components/ui/States";
import {
  bulkGradeAttempts,
  getAttemptForGrading,
  type GradingAnswer,
} from "@/lib/api/attempts";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type { AttemptResult } from "@/types";

interface BulkGradingModalProps {
  open: boolean;
  onClose: () => void;
  attempts: AttemptResult[];
  onSuccess: () => void;
}

interface GradeInput {
  points: string;
  isCorrect: boolean;
}

type GradesMap = Record<string, Record<string, GradeInput>>;

/**
 * Wave C2 — bulk grading modal.
 *
 * Fetches pending essays for each selected attempt in parallel, shows
 * one section per attempt, and saves everything with a single request.
 * Each attempt is its own transaction on the server, so partial failures
 * are reported per-attempt without blocking the rest.
 */
export function BulkGradingModal({
  open,
  onClose,
  attempts,
  onSuccess,
}: BulkGradingModalProps) {
  const [grades, setGrades] = useState<GradesMap>({});
  const [finalize, setFinalize] = useState(true);

  // Parallel fetch: one grading payload per selected attempt.
  const queries = useQueries({
    queries: attempts.map((a) => ({
      queryKey: ["grading", a.id],
      queryFn: () => getAttemptForGrading(a.id),
      enabled: open,
      staleTime: 30_000,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);

  // Seed the grades state from the fetched payloads.
  useEffect(() => {
    if (!open || isLoading) return;
    const next: GradesMap = {};
    queries.forEach((q) => {
      if (!q.data) return;
      const aId = q.data.attempt.id;
      next[aId] = {};
      q.data.essay_answers.forEach((ans) => {
        next[aId][ans.question] = {
          points: ans.awarded_points ?? "",
          isCorrect: ans.is_correct ?? false,
        };
      });
    });
    setGrades(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLoading]);

  const submitMutation = useMutation({
    mutationFn: () =>
      bulkGradeAttempts(
        Object.entries(grades).map(([attemptId, perQ]) => ({
          attempt_id: attemptId,
          grades: Object.entries(perQ).map(([questionId, g]) => ({
            question_id: questionId,
            awarded_points: g.points,
            is_correct: g.isCorrect,
          })),
          finalize,
        }))
      ),
    onSuccess: (results) => {
      const errors = results.filter((r) => r.error);
      const success = results.filter((r) => !r.error);
      if (errors.length === 0) {
        toastSuccess(`تم حفظ درجات ${success.length} محاولة.`);
      } else if (success.length === 0) {
        toastError(new Error(errors[0].error ?? "فشل الحفظ."), "");
      } else {
        toastError(
          new Error(
            `تم حفظ ${success.length} — فشل ${errors.length}: ${errors[0].error}`
          ),
          ""
        );
      }
      onSuccess();
      onClose();
    },
    onError: (err) => toastError(err, "تعذّر حفظ الدرجات."),
  });

  // Total pending essays — disable save if nothing to grade.
  const totalPending = (() => {
    if (isLoading || isError) return 0;
    let n = 0;
    queries.forEach((q) => {
      if (q.data) n += q.data.pending_essays;
    });
    return n;
  })();

  const filledCount = Object.values(grades).reduce(
    (acc, perQ) =>
      acc +
      Object.values(perQ).filter((g) => g.points !== "" && g.points !== undefined)
        .length,
    0
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[45] flex items-start justify-center overflow-y-auto bg-ink/50 p-4 pt-[5vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="تصحيح جماعي"
        className="w-full max-w-3xl overflow-hidden border rounded-card-lg border-line bg-paper-elevated shadow-modal animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div>
            <h2 className="text-lg font-bold font-display text-ink">
              تصحيح جماعي ({attempts.length} محاولة)
            </h2>
            <p className="mt-0.5 text-xs text-ink-400">
              {totalPending} مقال بانتظار التصحيح
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 transition-colors rounded text-ink-400 hover:bg-ink-50 hover:text-ink"
            aria-label="إغلاق"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-5">
          {isLoading && <Spinner />}
          {isError && <ErrorState message="تعذّر تحميل بيانات التصحيح." />}

          {!isLoading && !isError && (
            <div className="flex flex-col gap-6">
              {queries.map((q) => {
                if (!q.data) return null;
                const attempt = q.data.attempt;
                const attemptGrades = grades[attempt.id] ?? {};
                return (
                  <section
                    key={attempt.id}
                    className="p-4 border rounded-lg border-line bg-paper"
                  >
                    <header className="flex items-center justify-between gap-2 mb-3">
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {attempt.student_email}
                        </p>
                        <p className="text-xs text-ink-400">
                          محاولة #{attempt.attempt_number} ·{" "}
                          {q.data.pending_essays} مقال بانتظار التصحيح
                        </p>
                      </div>
                    </header>

                    {q.data.essay_answers.length === 0 ? (
                      <p className="text-xs text-ink-400">
                        لا توجد أسئلة مقالية في هذه المحاولة.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {q.data.essay_answers.map((ans, idx) => (
                          <EssayGradeRow
                            key={ans.question}
                            answer={ans}
                            index={idx + 1}
                            value={attemptGrades[ans.question]}
                            onChange={(v) =>
                              setGrades((prev) => ({
                                ...prev,
                                [attempt.id]: {
                                  ...(prev[attempt.id] ?? {}),
                                  [ans.question]: v,
                                },
                              }))
                            }
                          />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-line">
          <label className="flex items-center gap-2 mb-3 text-sm cursor-pointer text-ink-700">
            <input
              type="checkbox"
              checked={finalize}
              onChange={(e) => setFinalize(e.target.checked)}
              className="w-4 h-4 accent-ink"
            />
            إنهاء التصحيح تلقائيًا للمحاولات المكتملة (تتحول إلى GRADED)
          </label>
          <FormFooter
            isSubmitting={submitMutation.isPending}
            submitLabel={`حفظ ${filledCount} درجة`}
            onCancel={onClose}
            showKeyboardHint={false}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function EssayGradeRow({
  answer,
  index,
  value,
  onChange,
}: {
  answer: GradingAnswer;
  index: number;
  value: GradeInput | undefined;
  onChange: (v: GradeInput) => void;
}) {
  const maxPoints = Number(answer.max_points);
  const current = value ?? { points: "", isCorrect: false };

  return (
    <div className="p-3 border rounded-lg border-line bg-paper-elevated">
      <p className="mb-2 text-sm text-ink">
        <span className="text-ink-400">{index}.</span> {answer.question_text}
      </p>
      <div className="p-2 mb-2 rounded-lg bg-ink-50">
        <p className="text-xs text-ink-400">إجابة الطالب</p>
        <p className="mt-1 text-xs whitespace-pre-wrap text-ink">
          {answer.text_answer || <em className="text-ink-400">لم يجب</em>}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex flex-col flex-1 gap-1">
          <label className="text-xs text-ink-400">
            النقاط (من {maxPoints})
          </label>
          <input
            type="number"
            min={0}
            max={maxPoints}
            step="0.5"
            value={current.points}
            onChange={(e) => onChange({ ...current, points: e.target.value })}
            placeholder={`0 - ${maxPoints}`}
            className="rounded-lg border border-line bg-paper-elevated px-2 py-1.5 text-sm text-ink outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
          />
        </div>
        <div className="flex gap-3">
          <label className="flex items-center gap-1.5 text-xs text-ink-700">
            <input
              type="radio"
              checked={current.isCorrect}
              onChange={() => onChange({ ...current, isCorrect: true })}
              className="h-3.5 w-3.5 accent-ink"
            />
            صحيحة
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-700">
            <input
              type="radio"
              checked={!current.isCorrect}
              onChange={() => onChange({ ...current, isCorrect: false })}
              className="h-3.5 w-3.5 accent-ink"
            />
            خاطئة
          </label>
        </div>
      </div>
    </div>
  );
}