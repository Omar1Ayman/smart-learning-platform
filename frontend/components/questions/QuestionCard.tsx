"use client";

import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { CheckCircle, XCircle, Clock } from "@/components/ui/icons";
import type { QuestionItem, QuestionType, ReviewStatus } from "@/lib/api/questions";

const STATUS_META: Record<
  ReviewStatus,
  { label: string; cls: string; icon: React.ReactNode }
> = {
  PENDING: {
    label: "بانتظار المراجعة",
    cls: "bg-accent/15 text-accent-dark",
    icon: <Clock size={12} />,
  },
  APPROVED: {
    label: "معتمد",
    cls: "bg-success/10 text-success",
    icon: <CheckCircle size={12} />,
  },
  REJECTED: {
    label: "مرفوض",
    cls: "bg-danger/10 text-danger",
    icon: <XCircle size={12} />,
  },
};

const TYPE_LABEL: Record<QuestionType, string> = {
  MCQ: "اختيار متعدد",
  TRUE_FALSE: "صح / خطأ",
  SHORT_ANSWER: "إجابة قصيرة",
  ESSAY: "مقالي",
};

const DIFFICULTY_META: Record<
  "EASY" | "MEDIUM" | "HARD",
  { label: string; cls: string }
> = {
  EASY: { label: "سهل", cls: "bg-success/10 text-success" },
  MEDIUM: { label: "متوسط", cls: "bg-accent/10 text-accent-dark" },
  HARD: { label: "صعب", cls: "bg-danger/10 text-danger" },
};

interface QuestionCardProps {
  question: QuestionItem;
  bankName: string;
  actions: ActionMenuItem[];
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
}

export function QuestionCard({
  question,
  bankName,
  actions,
  selectable,
  selected,
  onSelect,
  expanded,
  onToggleExpand,
}: QuestionCardProps) {
  const status = STATUS_META[question.review_status];
  const difficulty = DIFFICULTY_META[question.difficulty];

  const hasOptions =
    question.question_type === "MCQ" || question.question_type === "TRUE_FALSE";
  const hasAcceptedAnswers =
    question.question_type === "SHORT_ANSWER" &&
    question.accepted_answers.length > 0;

  return (
    <div
      className={`card flex flex-col gap-3 p-4 transition-shadow hover:shadow-card-hover ${
        selected ? "ring-2 ring-accent/40" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        {selectable && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={onSelect}
            className="mt-2 h-4 w-4 shrink-0 cursor-pointer accent-ink"
            aria-label="تحديد السؤال"
          />
        )}

        <div className="min-w-0 flex-1">
          {/* Row 1: status + type + difficulty + points */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${status.cls}`}
            >
              {status.icon}
              {status.label}
            </span>
            <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-medium text-ink-700">
              {TYPE_LABEL[question.question_type]}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${difficulty.cls}`}
            >
              {difficulty.label}
            </span>
            <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-medium text-ink-400">
              {question.points} نقطة
            </span>
          </div>

          {/* Row 2: text (truncated unless expanded) */}
          <p
            className={`mt-2 text-sm text-ink ${
              expanded ? "" : "line-clamp-2"
            }`}
          >
            {question.text}
          </p>

          {/* Topic (if any) */}
          {question.topic && (
            <p className="mt-1 text-xs text-ink-400">
              <span className="text-ink-300">موضوع: </span>
              {question.topic}
            </p>
          )}

          {/* Expand toggle — only if there's content to reveal */}
          {(hasOptions || hasAcceptedAnswers || question.explanation) && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="mt-2 text-xs font-medium text-ink-700 hover:underline"
            >
              {expanded ? "▲ إخفاء التفاصيل" : "▼ عرض التفاصيل"}
            </button>
          )}

          {/* Expanded details */}
          {expanded && (
            <div className="mt-3 flex flex-col gap-2 rounded-lg bg-paper-muted/40 p-3 text-xs">
              {hasOptions && question.options.length > 0 && (
                <div>
                  <p className="mb-1 font-medium text-ink-700">
                    الخيارات ({question.options.length}):
                  </p>
                  <ul className="space-y-1">
                    {question.options.map((opt, idx) => (
                      <li
                        key={opt.id ?? idx}
                        className={`flex items-center gap-2 rounded px-2 py-1 ${
                          opt.is_correct
                            ? "bg-success/5 text-success"
                            : "text-ink-700"
                        }`}
                      >
                        <span className="shrink-0 font-mono">
                          {opt.is_correct ? "✓" : "○"}
                        </span>
                        <span>{opt.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {hasAcceptedAnswers && (
                <div>
                  <p className="mb-1 font-medium text-ink-700">
                    الإجابات المقبولة:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {question.accepted_answers.map((ans, idx) => (
                      <span
                        key={idx}
                        className="rounded-full bg-info/10 px-2 py-0.5 text-info"
                      >
                        {ans}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {question.explanation && (
                <div>
                  <p className="mb-1 font-medium text-ink-700">الشرح:</p>
                  <p className="whitespace-pre-wrap text-ink-700">
                    {question.explanation}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Review note (if rejected / has a note) */}
          {question.review_status === "REJECTED" && question.review_note && (
            <div className="mt-2 rounded border border-danger/20 bg-danger/5 p-2 text-xs text-danger">
              <span className="font-medium">سبب الرفض: </span>
              {question.review_note}
            </div>
          )}
        </div>

        <ActionMenu items={actions} />
      </div>

      {/* Footer: bank name */}
      <div className="flex items-center gap-1 border-t border-line pt-2.5">
        <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-medium text-ink-700">
          📚 {bankName}
        </span>
      </div>
    </div>
  );
}