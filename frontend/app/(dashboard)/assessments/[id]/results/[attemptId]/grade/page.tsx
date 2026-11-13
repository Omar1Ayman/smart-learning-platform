"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CheckCircle, Loader } from "@/components/ui/icons";
import { ErrorState, Spinner } from "@/components/ui/States";
import {
  finalizeAttempt,
  getAttemptForGrading,
  gradeEssay,
  type GradingAnswer,
} from "@/lib/api/attempts";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type { AttemptEventType } from "@/types";

const EVENT_LABEL: Record<AttemptEventType, string> = {
  TAB_HIDDEN: "خروج من النافذة",
  COPY_ATTEMPT: "محاولة نسخ",
  PASTE_ATTEMPT: "محاولة لصق",
  RIGHT_CLICK: "نقر بالزر الأيمن",
  FULLSCREEN_EXIT: "الخروج من الشاشة الكاملة",
  DEVTOOLS_OPEN: "فتح أدوات المطور",
};

interface GradeInput {
  points: string;
  isCorrect: boolean;
}

type GradesMap = Record<string, GradeInput>;

export default function GradeAttemptPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  const { id: assessmentId, attemptId } = use(params);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["grading", attemptId],
    queryFn: () => getAttemptForGrading(attemptId),
  });

  const [localGrades, setLocalGrades] = useState<GradesMap>({});

  // Batch 15: ref array for essays — used to scroll to next pending
  // after each save, and to serve as anchor for keyboard nav.
  const essayRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!data) return;
    const initial: GradesMap = {};
    for (const a of data.essay_answers) {
      initial[a.question] = {
        points: a.awarded_points ?? "",
        isCorrect: a.is_correct ?? false,
      };
    }
    setLocalGrades(initial);
  }, [data]);

  // Wave C3.1 — warn before leaving with unsaved grade edits.
  const isDirty = useMemo(() => {
    if (!data) return false;
    for (const a of data.essay_answers) {
      const local = localGrades[a.question];
      if (!local) continue;
      const serverPoints = a.awarded_points ?? "";
      const serverCorrect = a.is_correct ?? false;
      if (local.points !== serverPoints || local.isCorrect !== serverCorrect) {
        return true;
      }
    }
    return false;
  }, [data, localGrades]);

  useUnsavedChangesWarning(isDirty);

  const explanationByQuestion = useMemo(() => {
    const map: Record<string, string | null> = {};
    if (!data) return map;
    for (const a of data.attempt.answers) {
      map[a.question] = a.explanation;
    }
    return map;
  }, [data]);

  // Batch 15: derived progress. "Saved" means the answer has server-side
  // points AND matches local. "Pending" is everything else.
  const progress = useMemo(() => {
    if (!data) return { total: 0, saved: 0, pending: 0 };
    let saved = 0;
    for (const a of data.essay_answers) {
      const local = localGrades[a.question];
      if (
        local &&
        local.points !== "" &&
        local.points === (a.awarded_points ?? "") &&
        local.isCorrect === (a.is_correct ?? false)
      ) {
        saved++;
      }
    }
    const total = data.essay_answers.length;
    return { total, saved, pending: total - saved };
  }, [data, localGrades]);

  const gradeMutation = useMutation({
    mutationFn: ({
      questionId,
      points,
      isCorrect,
    }: {
      questionId: string;
      points: string;
      isCorrect: boolean;
    }) => gradeEssay(attemptId, questionId, points, isCorrect),
    onSuccess: (_, variables) => {
      refetch();
      toastSuccess("تم حفظ الدرجة");
      queryClient.invalidateQueries({
        queryKey: ["assessment-attempts", assessmentId],
      });

      // Batch 15: scroll to next essay awaiting a grade (if any).
      // Falls back to wrapping around to the first pending one.
      requestAnimationFrame(() => {
        if (!data) return;
        const currentIdx = data.essay_answers.findIndex(
          (a) => a.question === variables.questionId
        );
        if (currentIdx < 0) return;

        let targetIdx = -1;
        for (let i = currentIdx + 1; i < data.essay_answers.length; i++) {
          if (data.essay_answers[i].awarded_points === null) {
            targetIdx = i;
            break;
          }
        }
        if (targetIdx === -1) {
          for (let i = 0; i < currentIdx; i++) {
            if (data.essay_answers[i].awarded_points === null) {
              targetIdx = i;
              break;
            }
          }
        }
        if (targetIdx >= 0) {
          const el = essayRefs.current[targetIdx];
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.focus({ preventScroll: true });
          }
        }
      });
    },
    onError: (err) => toastError(err, "تعذّر حفظ الدرجة."),
  });

  const finalizeMutation = useMutation({
    mutationFn: () => finalizeAttempt(attemptId),
    onSuccess: () => {
      refetch();
      toastSuccess("تم إنهاء التصحيح");
      queryClient.invalidateQueries({
        queryKey: ["assessment-attempts", assessmentId],
      });
    },
    onError: (err) => toastError(err, "تعذّر إنهاء التصحيح."),
  });

  // Batch 15: keyboard shortcuts. `N` jumps to next pending essay;
  // `S` saves the currently-focused essay if it's dirty.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Never intercept when the user is typing in an input.
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key.toLowerCase() === "n" && data) {
        e.preventDefault();
        const idx = data.essay_answers.findIndex(
          (a) => a.awarded_points === null
        );
        if (idx >= 0) {
          const el = essayRefs.current[idx];
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.focus({ preventScroll: true });
          }
        }
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [data]);

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message="تعذّر تحميل المحاولة." />;

  const { attempt, essay_answers, pending_essays, events, suspicion } = data;
  const isGraded = attempt.status === "GRADED";
  const canFinalize = !isGraded && pending_essays === 0 && !isDirty;
  const allClean = !isGraded && progress.pending === 0 && !isDirty;
  const progressPct =
    progress.total > 0 ? (progress.saved / progress.total) * 100 : 0;

  return (
    <div className="flex flex-col max-w-3xl gap-6 mx-auto">
      {/* ============ Header ============ */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href={`/assessments/${assessmentId}/results`}
            className="text-sm text-ink-400 hover:text-ink"
          >
            ← النتائج
          </Link>
          <h1 className="mt-1 text-2xl font-bold font-display text-ink">
            تصحيح: {attempt.student_name}
          </h1>
          <p className="mt-0.5 text-xs text-ink-400">{attempt.student_email}</p>
          <p className="mt-1 text-sm text-ink-400">
            {attempt.assessment_title} · محاولة #{attempt.attempt_number}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${
              isGraded
                ? "bg-success/10 text-success"
                : allClean
                ? "bg-success/10 text-success"
                : "bg-accent/20 text-ink-700"
            }`}
          >
            {isGraded ? "مصححة" : allClean ? "جاهز للإنهاء" : "قيد التصحيح"}
          </span>
          {!isGraded && progress.total > 0 && (
            <div className="text-end">
              <p className="text-[10px] text-ink-400">
                {progress.saved} من {progress.total} مصححة
              </p>
              <div className="w-24 h-1 mt-1 overflow-hidden rounded-full bg-ink-100">
                <div
                  className="h-full transition-all duration-300 rounded-full bg-success"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============ Summary ============ */}
      <div className="grid grid-cols-3 gap-4 p-5 text-center card">
        <div>
          <p className="text-xs text-ink-400">الدرجة الحالية</p>
          <p className="mt-1 text-xl font-bold font-display text-ink">
            {attempt.score ?? "0"} / {attempt.max_score}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-400">النسبة</p>
          <p className="mt-1 text-xl font-bold font-display text-ink">
            {attempt.percentage}%
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-400">مقالات معلقة</p>
          <p
            className={`mt-1 font-display text-xl font-bold ${
              pending_essays > 0 ? "text-danger" : "text-success"
            }`}
          >
            {pending_essays}
          </p>
        </div>
      </div>

      {/* ============ Anti-cheat suspicion ============ */}
      {suspicion && suspicion.score > 0 && (
        <div
          className={`card p-5 ${
            suspicion.level === "major"
              ? "border-danger/30 bg-danger/5"
              : suspicion.level === "minor"
              ? "border-accent/30 bg-accent/5"
              : ""
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-bold font-display text-ink">
                مؤشرات النزاهة الأكاديمية
              </h2>
              <p className="mt-1 text-xs text-ink-400">
                هذه إشارات آلية — القرار النهائي للمدرس بعد المراجعة.
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${
                suspicion.level === "major"
                  ? "bg-danger/10 text-danger"
                  : suspicion.level === "minor"
                  ? "bg-accent/20 text-ink-700"
                  : "bg-ink-50 text-ink-400"
              }`}
            >
              {suspicion.level === "major"
                ? "يحتاج مراجعة عاجلة"
                : suspicion.level === "minor"
                ? "نشاط بسيط"
                : "طبيعي"}{" "}
              ({suspicion.score})
            </span>
          </div>

          <div className="flex flex-col gap-1 mt-3">
            {suspicion.breakdown.map((b) => (
              <div
                key={b.event_type}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-ink-700">
                  {EVENT_LABEL[b.event_type] ?? b.event_type}
                </span>
                <span className="text-ink-400">
                  {b.count}× — {b.contribution} نقطة
                </span>
              </div>
            ))}
          </div>

          {events.length > 0 && (
            <details className="mt-3">
              <summary className="text-sm cursor-pointer text-ink-700">
                تفاصيل الأحداث ({events.length})
              </summary>
              <div className="mt-2 overflow-y-auto border rounded-lg max-h-64 border-line bg-paper-elevated">
                {events.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between px-3 py-2 text-xs border-b border-line last:border-0"
                  >
                    <span className="text-ink-700">{e.event_label}</span>
                    <span className="text-ink-400">
                      {new Date(e.occurred_at).toLocaleTimeString("ar-EG")}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ============ Essay answers ============ */}
      {essay_answers.length === 0 ? (
        <div className="p-6 text-center card text-ink-400">
          لا توجد أسئلة مقالية في هذه المحاولة — التصحيح التلقائي مكتمل.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {essay_answers.map((a, idx) => (
            <div
              key={a.question}
              ref={(el) => {
                essayRefs.current[idx] = el;
              }}
              tabIndex={-1}
              className="outline-none"
            >
              <EssayCard
                answer={a}
                index={idx + 1}
                local={localGrades[a.question]}
                explanation={explanationByQuestion[a.question] ?? null}
                isDirty={(() => {
                  const local = localGrades[a.question];
                  if (!local) return false;
                  const serverPoints = a.awarded_points ?? "";
                  const serverCorrect = a.is_correct ?? false;
                  return (
                    local.points !== serverPoints ||
                    local.isCorrect !== serverCorrect
                  );
                })()}
                onChange={(next) =>
                  setLocalGrades((prev) => ({ ...prev, [a.question]: next }))
                }
                onSave={(opts) => {
                  const local = localGrades[a.question];
                  if (!local || local.points === "") return;
                  gradeMutation.mutate({
                    questionId: a.question,
                    points: local.points,
                    isCorrect: local.isCorrect,
                  });
                  void opts;
                }}
                isSaving={
                  gradeMutation.isPending &&
                  gradeMutation.variables?.questionId === a.question
                }
                readOnly={isGraded}
                hasNextPending={
                  essay_answers
                    .slice(idx + 1)
                    .some((ea) => ea.awarded_points === null) ||
                  essay_answers
                    .slice(0, idx)
                    .some((ea) => ea.awarded_points === null)
                }
              />
            </div>
          ))}
        </div>
      )}

      {/* ============ Keyboard hint ============ */}
      {!isGraded && essay_answers.length > 0 && (
        <p className="text-center text-[11px] text-ink-300">
          <kbd className="px-1 font-mono border rounded border-line bg-paper-muted">
            N
          </kbd>{" "}
          للانتقال لأول مقال معلق
          {progress.pending > 0 && ` (${progress.pending} متبقي)`}
        </p>
      )}

      {/* ============ Finalize ============ */}
      {!isGraded && (
        <div className="p-5 card">
          <h2 className="mb-2 text-lg font-bold font-display text-ink">
            إنهاء التصحيح
          </h2>
          <p className="mb-3 text-sm text-ink-400">
            {pending_essays > 0
              ? `باقي ${pending_essays} مقال لم يُصحَّح. أكملها أولًا.`
              : isDirty
              ? "لديك تعديلات غير محفوظة — احفظها أولًا ثم أنهِ التصحيح."
              : "كل المقالات صُححت. يمكنك الآن إنهاء التصحيح لتثبيت الدرجة النهائية."}
          </p>
          <Button
            onClick={() => finalizeMutation.mutate()}
            disabled={!canFinalize || finalizeMutation.isPending}
            className="w-full"
          >
            {finalizeMutation.isPending ? (
              <span className="flex items-center gap-2">
                <Loader size={14} />
                جارٍ الإنهاء...
              </span>
            ) : (
              "إنهاء التصحيح وتثبيت الدرجة"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function EssayCard({
  answer,
  index,
  local,
  explanation,
  isDirty,
  onChange,
  onSave,
  isSaving,
  readOnly,
  hasNextPending,
}: {
  answer: GradingAnswer;
  index: number;
  local?: GradeInput;
  explanation: string | null;
  isDirty: boolean;
  onChange: (next: GradeInput) => void;
  onSave: (opts: { advance: boolean }) => void;
  isSaving: boolean;
  readOnly: boolean;
  hasNextPending: boolean;
}) {
  const maxPoints = Number(answer.max_points);
  const current = local ?? {
    points: answer.awarded_points ?? "",
    isCorrect: answer.is_correct ?? false,
  };

  const numPoints = parseFloat(current.points);
  const hasPoints = !Number.isNaN(numPoints) && current.points !== "";
  const pointsOutOfRange =
    hasPoints && (numPoints < 0 || numPoints > maxPoints);

  const isSaved =
    !isDirty &&
    answer.awarded_points !== null &&
    answer.awarded_points !== undefined;

  const pct = hasPoints
    ? Math.min(100, Math.max(0, (numPoints / maxPoints) * 100))
    : 0;
  const barColor = pointsOutOfRange
    ? "bg-danger"
    : pct >= 70
    ? "bg-success"
    : pct >= 40
    ? "bg-accent"
    : "bg-danger/70";

  return (
    <div className="p-5 card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink">
            <span className="text-ink-400">{index}.</span>{" "}
            {answer.question_text}
          </p>
          {isSaved && (
            <p className="flex items-center gap-1 mt-1 text-xs text-success">
              <CheckCircle size={12} />
              تم الحفظ — {Number(answer.awarded_points).toFixed(1)} / {maxPoints}
            </p>
          )}
          {isDirty && !readOnly && (
            <p className="mt-1 text-xs text-accent-dark">
              ● تعديلات غير محفوظة
            </p>
          )}
        </div>
        <span className="text-xs shrink-0 text-ink-400">
          {maxPoints} نقطة
        </span>
      </div>

      <div className="p-3 mt-3 rounded-lg bg-ink-50/50">
        <p className="text-xs text-ink-400">إجابة الطالب</p>
        <p className="mt-1 text-sm whitespace-pre-wrap text-ink">
          {answer.text_answer || (
            <em className="text-ink-400">لم يجب الطالب</em>
          )}
        </p>
      </div>

      {explanation && (
        <div className="p-3 mt-3 border rounded-lg border-accent/20 bg-accent/5">
          <p className="mb-1 text-xs font-medium text-accent-dark">
            💡 التوجيه / معايير التصحيح
          </p>
          <p className="text-sm whitespace-pre-wrap text-ink-700">
            {explanation}
          </p>
        </div>
      )}

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-100">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="grid gap-3 mt-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-ink-400">النقاط</label>
          <input
            type="number"
            min={0}
            max={maxPoints}
            step="0.5"
            value={current.points}
            onChange={(e) => onChange({ ...current, points: e.target.value })}
            disabled={readOnly}
            placeholder={`0 - ${maxPoints}`}
            className={`rounded-lg border bg-paper-elevated px-3 py-2 text-sm text-ink outline-none transition-all focus:ring-2 focus:ring-ink/10 disabled:cursor-not-allowed disabled:bg-paper-muted disabled:text-ink-400 ${
              pointsOutOfRange
                ? "border-danger focus:border-danger"
                : "border-line focus:border-ink"
            }`}
          />
          {pointsOutOfRange && (
            <p className="text-xs text-danger">
              النقاط يجب أن تكون بين 0 و {maxPoints}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-ink-400">الحكم</label>
          <div className="flex gap-3 pt-1.5">
            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-700">
              <input
                type="radio"
                checked={current.isCorrect}
                onChange={() => onChange({ ...current, isCorrect: true })}
                disabled={readOnly}
                className="w-4 h-4 accent-ink"
              />
              صحيحة
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-700">
              <input
                type="radio"
                checked={!current.isCorrect}
                onChange={() => onChange({ ...current, isCorrect: false })}
                disabled={readOnly}
                className="w-4 h-4 accent-ink"
              />
              خاطئة
            </label>
          </div>
        </div>
      </div>

      {!readOnly && (
        <div className="flex justify-end gap-2 mt-3">
          {isDirty && hasNextPending && (
            <Button
              onClick={() => onSave({ advance: true })}
              disabled={isSaving || current.points === "" || pointsOutOfRange}
              variant="primary"
            >
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <Loader size={14} />
                  جارٍ الحفظ...
                </span>
              ) : (
                "حفظ والانتقال للتالي ←"
              )}
            </Button>
          )}
          <Button
            onClick={() => onSave({ advance: false })}
            disabled={isSaving || current.points === "" || pointsOutOfRange}
            variant={isDirty && hasNextPending ? "ghost" : "secondary"}
          >
            {isSaving && !hasNextPending ? (
              <span className="flex items-center gap-2">
                <Loader size={14} />
                جارٍ الحفظ...
              </span>
            ) : isDirty ? (
              "حفظ"
            ) : (
              "حفظ التصحيح"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}