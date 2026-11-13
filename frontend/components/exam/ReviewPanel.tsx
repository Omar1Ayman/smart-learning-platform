"use client";

import { Button } from "@/components/ui/Button";
import { CheckCircle, Flag, X, XCircle } from "@/components/ui/icons";
import type { AttemptAnswerState, AttemptDetail } from "@/types";
import { useState } from "react";
interface ReviewPanelProps {
  open: boolean;
  onClose: () => void;
  attempt: AttemptDetail;
  answers: Record<string, AttemptAnswerState>;
  flaggedIds: Set<string>;
  currentIndex: number;
  onJumpTo: (idx: number) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

/**
 * Wave B1 — "Review before submit" panel.
 *
 * Batch 6 (Milestone 2) upgrades:
 *   1. A 4th stat card counts questions that are BOTH flagged AND
 *      unanswered — the "priority" state. Prior versions showed this as
 *      just "flagged", so students missed questions they explicitly
 *      said they'd return to.
 *   2. A Legend explains what each tile color means, so a first-time
 *      student doesn't have to figure it out from the grid.
 *   3. A filter toggle lets the student show only flagged questions —
 *      the whole reason they flagged them was to come back.
 *   4. A "Jump to first priority" button appears when priorityCount > 0.
 */
export function ReviewPanel({
  open,
  onClose,
  attempt,
  answers,
  flaggedIds,
  currentIndex,
  onJumpTo,
  onSubmit,
  isSubmitting,
}: ReviewPanelProps) {
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  if (!open) return null;

  const isAnswered = (qId: string) => {
    const a = answers[qId];
    return !!a && (!!a.chosen_option || a.text_answer.trim().length > 0);
  };

  const answeredCount = attempt.questions.filter((q) => isAnswered(q.id)).length;
  const unansweredCount = attempt.questions.length - answeredCount;
  const flaggedCount = flaggedIds.size;

  // Priority = flagged AND unanswered. This is the highest-risk state:
  // the student explicitly wanted to come back, but forgot.
  const priorityCount = attempt.questions.filter(
    (q) => flaggedIds.has(q.id) && !isAnswered(q.id)
  ).length;

  // First-priority index for the "jump" shortcut.
  const firstPriorityIdx = attempt.questions.findIndex(
    (q) => flaggedIds.has(q.id) && !isAnswered(q.id)
  );

  // Filtered question list (for the grid).
  const visibleQuestions = flaggedOnly
    ? attempt.questions
        .map((q, idx) => ({ q, idx }))
        .filter(({ q }) => flaggedIds.has(q.id))
    : attempt.questions.map((q, idx) => ({ q, idx }));

  function handleJump(idx: number) {
    onJumpTo(idx);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[45] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="مراجعة الامتحان"
        className="w-full max-w-2xl overflow-hidden border rounded-card-lg border-line bg-paper-elevated shadow-modal animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div>
            <h2 className="text-lg font-bold font-display text-ink">مراجعة الامتحان</h2>
            <p className="mt-0.5 text-xs text-ink-400">
              {attempt.questions.length} سؤال · راجع قبل التسليم
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 transition-colors rounded text-ink-400 hover:bg-ink-50 hover:text-ink"
            aria-label="إغلاق المراجعة"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stats — 4 cards now (was 3) */}
        <div className="grid grid-cols-2 gap-2 px-5 py-3 border-b border-line sm:grid-cols-4">
          <StatCard
            icon={<CheckCircle size={16} className="text-success" />}
            bg="bg-success/10"
            label="أُجيب عليها"
            value={answeredCount}
            valueClass="text-success"
          />
          <StatCard
            icon={<XCircle size={16} className="text-danger" />}
            bg="bg-danger/10"
            label="لم تُجب"
            value={unansweredCount}
            valueClass="text-danger"
          />
          <StatCard
            icon={<Flag size={16} className="text-accent-dark" />}
            bg="bg-accent/10"
            label="مُعلَّمة"
            value={flaggedCount}
            valueClass="text-accent-dark"
          />
          <StatCard
            icon={<Flag size={16} className="text-danger" />}
            bg={priorityCount > 0 ? "bg-danger/15" : "bg-ink-50"}
            label="مُعلَّمة بلا إجابة"
            value={priorityCount}
            valueClass={priorityCount > 0 ? "text-danger" : "text-ink-400"}
            hint={priorityCount > 0 ? "أولوية!" : undefined}
          />
        </div>

        {/* Legend + Filter toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-line">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-400">
            <LegendDot color="bg-success" label="مُجاب" />
            <LegendDot color="bg-danger" label="لم يُجب" />
            <LegendDot color="bg-accent" label="مُعلَّم" />
            <LegendDot color="bg-ink" label="الحالي" />
          </div>

          <button
            type="button"
            onClick={() => setFlaggedOnly(!flaggedOnly)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              flaggedOnly
                ? "border-accent/40 bg-accent/10 text-accent-dark"
                : "border-line text-ink-400 hover:border-accent/30 hover:bg-accent/5 hover:text-accent-dark"
            }`}
            aria-pressed={flaggedOnly}
          >
            <Flag size={12} />
            {flaggedOnly ? "عرض الكل" : "عرض المُعلَّمة فقط"}
          </button>
        </div>

        {/* Jump-to-first-priority banner */}
        {priorityCount > 0 && firstPriorityIdx >= 0 && (
          <button
            type="button"
            onClick={() => handleJump(firstPriorityIdx)}
            className="flex w-full items-center justify-between gap-3 border-b border-danger/20 bg-danger/5 px-5 py-2.5 text-start transition-colors hover:bg-danger/10"
          >
            <span className="text-sm text-danger">
              ⚠️ لديك {priorityCount} سؤال معلّم بدون إجابة
            </span>
            <span className="shrink-0 rounded-md bg-danger px-2.5 py-1 text-xs font-medium text-white">
              اذهب للأول ←
            </span>
          </button>
        )}

        {/* Grid */}
        <div className="max-h-[42vh] overflow-y-auto p-5">
          {visibleQuestions.length === 0 ? (
            <div className="py-8 text-sm text-center text-ink-400">
              لم تُعلِّم أي سؤال بعد.
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
              {visibleQuestions.map(({ q, idx }) => {
                const answered = isAnswered(q.id);
                const flagged = flaggedIds.has(q.id);
                const isCurrent = idx === currentIndex;
                const isPriority = flagged && !answered;

                return (
                  <button
                    key={q.id}
                    onClick={() => handleJump(idx)}
                    className={`relative flex h-11 items-center justify-center rounded-lg text-sm font-semibold transition-all ${
                      isCurrent
                        ? "bg-ink text-white ring-2 ring-ink/20 dark:bg-accent dark:text-[#111827] dark:ring-accent/40"
                        : isPriority
                        ? "bg-danger/20 text-danger ring-2 ring-danger/50 hover:bg-danger/30"
                        : answered
                        ? "bg-success/15 text-success ring-1 ring-success/30 hover:bg-success/25"
                        : "bg-danger/10 text-danger ring-1 ring-danger/20 hover:bg-danger/20"
                    }`}
                    aria-label={`السؤال ${idx + 1}${
                      isPriority
                        ? " — معلّم بدون إجابة"
                        : flagged
                        ? " — مُعلَّم"
                        : answered
                        ? " — مُجاب"
                        : " — لم يُجب"
                    }`}
                  >
                    {idx + 1}
                    {flagged && (
                      <span className="absolute -top-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[8px] leading-none text-white ring-2 ring-paper-elevated">
                        🚩
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 px-5 py-4 border-t border-line">
          {unansweredCount > 0 && (
            <div className="px-3 py-2 text-xs border rounded-lg border-danger/30 bg-danger/5 text-danger">
              ⚠️ لديك {unansweredCount} سؤال لم تُجب عليه. تأكد أنك أجبت على الكل قبل التسليم.
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={onClose}>
              عودة للأسئلة
            </Button>
            <Button variant="danger" onClick={onSubmit} disabled={isSubmitting}>
              {isSubmitting ? "جارٍ التسليم..." : "تسليم الامتحان"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small internal components — kept local because they're review-panel-specific.
// ---------------------------------------------------------------------------

function StatCard({
  icon,
  bg,
  label,
  value,
  valueClass,
  hint,
}: {
  icon: React.ReactNode;
  bg: string;
  label: string;
  value: number;
  valueClass: string;
  hint?: string;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-lg ${bg} px-3 py-2`}>
      {icon}
      <div className="flex-1 min-w-0">
        <p className="truncate text-[10px] text-ink-400">{label}</p>
        <p className={`font-display text-base font-bold leading-tight ${valueClass}`}>
          {value}
          {hint && <span className="ms-1 text-[10px] font-normal">{hint}</span>}
        </p>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}