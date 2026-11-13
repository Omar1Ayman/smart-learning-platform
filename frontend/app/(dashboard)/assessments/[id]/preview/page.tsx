"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorState, Spinner } from "@/components/ui/States";
import { Info } from "@/components/ui/icons";
import { getAssessmentPreview } from "@/lib/api/assessments";
import type { AttemptAnswerState } from "@/types";

export default function AssessmentPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Preview-only visual state — nothing is saved to the server.
  const [answers, setAnswers] = useState<Record<string, AttemptAnswerState>>({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ["assessment-preview", id],
    queryFn: () => getAssessmentPreview(id),
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message="تعذّر تحميل المعاينة." />;

  const totalQuestions = data.questions.length;
  const currentQuestion = data.questions[currentIndex];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalQuestions - 1;

  const hasTruncation =
    data.effective_question_count < data.total_question_count;

  function selectOption(optionId: string) {
    if (!currentQuestion) return;
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: { chosen_option: optionId, text_answer: "" },
    }));
  }

  function updateText(text: string) {
    if (!currentQuestion) return;
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: { chosen_option: null, text_answer: text },
    }));
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-paper">
      {/* ============ Preview banner ============ */}
      <div className="shrink-0 border-b border-accent/30 bg-accent/10 px-4 py-2.5">
        <div className="flex items-center justify-between max-w-4xl gap-3 mx-auto">
          <div className="flex items-center gap-2 text-sm text-ink-700">
            <Info size={16} className="text-accent-dark" />
            <span className="font-medium">
              وضع المعاينة — هذه الشاشة تعرض ما يراه الطالب، ولا تُحفظ أي إجابة.
            </span>
          </div>
          <Link href={`/assessments/${id}/edit`} className="shrink-0">
            <Button variant="secondary" className="text-xs">
              ← عودة للتحرير
            </Button>
          </Link>
        </div>
      </div>

      {/* ============ Header ============ */}
      <header className="border-b shrink-0 border-line bg-paper-elevated">
        <div className="flex items-center max-w-4xl gap-3 px-4 pt-4 pb-3 mx-auto sm:gap-4 sm:px-6 sm:pt-5 sm:pb-4">
          <div className="flex-1 min-w-0 text-center">
            <h1 className="text-sm font-bold truncate font-display text-ink sm:text-base">
              {data.assessment.title}
            </h1>
            <p className="mt-0.5 text-[10px] text-ink-400 sm:text-xs">
              معاينة · {totalQuestions} سؤال · {data.max_score} نقطة
            </p>
          </div>
        </div>

        {/* Info strip */}
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 pb-3 text-[11px] text-ink-400 sm:px-6 sm:pb-4">
          {data.assessment.duration_minutes && (
            <span>⏱ {data.assessment.duration_minutes} دقيقة</span>
          )}
          <span>🔄 {data.assessment.max_attempts} محاولة</span>
          {data.assessment.passing_score && (
            <span>🎯 النجاح: {data.assessment.passing_score}%</span>
          )}
          {data.assessment.randomize_question_order && (
            <span>🔀 خلط الأسئلة</span>
          )}
          {data.assessment.randomize_option_order && (
            <span>🔀 خلط الاختيارات</span>
          )}
          {data.reach > 0 && <span>👥 ~{data.reach} طالب</span>}
        </div>

        {/* Truncation hint */}
        {hasTruncation && (
          <div className="max-w-4xl px-4 pb-3 mx-auto sm:px-6 sm:pb-4">
            <div className="px-3 py-2 text-xs border rounded-lg border-info/30 bg-info/5 text-info">
              ℹ️ الطالب سيرى <strong>{data.effective_question_count}</strong> من
              أصل {data.total_question_count} سؤال.
              {data.assessment.randomize_question_order
                ? " الاختيار عشوائي عند كل محاولة."
                : " الأسئلة الأولى هي التي ستُعرض."}
            </div>
          </div>
        )}
      </header>

      {/* ============ Question ============ */}
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl px-4 py-6 mx-auto sm:px-6 sm:py-8">
          <div className="p-5 card sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <span className="rounded-full bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700">
                السؤال {currentIndex + 1} من {totalQuestions}
              </span>
              <span className="text-xs text-ink-400">
                {currentQuestion.points} نقطة
              </span>
            </div>

            <p className="mb-5 text-base leading-relaxed text-ink sm:text-lg">
              {currentQuestion.text}
            </p>

            {(currentQuestion.question_type === "MCQ" ||
              currentQuestion.question_type === "TRUE_FALSE") && (
              <div className="flex flex-col gap-2.5 sm:gap-3">
                {currentQuestion.options.map((opt) => {
                  const selected = currentAnswer?.chosen_option === opt.id;
                  return (
                    <label
                      key={opt.id}
                      className={`flex min-h-[56px] cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 transition-all sm:min-h-0 sm:py-4 ${
                        selected
                          ? "border-ink bg-ink/5 shadow-sm"
                          : "border-line bg-paper-elevated hover:border-ink/30 hover:bg-ink-50/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${currentQuestion.id}`}
                        checked={selected}
                        onChange={() => selectOption(opt.id)}
                        className="w-5 h-5 shrink-0 accent-ink"
                      />
                      <span className="flex-1 text-sm leading-relaxed text-ink sm:text-base">
                        {opt.text}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {(currentQuestion.question_type === "SHORT_ANSWER" ||
              currentQuestion.question_type === "ESSAY") && (
              <textarea
                rows={currentQuestion.question_type === "ESSAY" ? 8 : 3}
                value={currentAnswer?.text_answer ?? ""}
                onChange={(e) => updateText(e.target.value)}
                placeholder="اكتب إجابتك هنا..."
                className="min-h-[120px] w-full resize-y rounded-xl border-2 border-line bg-paper-elevated px-4 py-3 text-sm leading-relaxed text-ink outline-none transition-colors focus:border-ink sm:min-h-[140px] sm:text-base"
              />
            )}
          </div>
        </div>
      </main>

      {/* ============ Navigation ============ */}
      <div className="border-t shrink-0 border-line bg-paper-elevated">
        <div className="max-w-4xl px-4 py-3 mx-auto sm:px-6 sm:py-4">
          <div className="pb-1 mb-3 overflow-x-auto sm:mb-4">
            <div className="flex justify-center gap-1.5 sm:gap-2">
              {data.questions.map((q, idx) => {
                const active = idx === currentIndex;
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold transition-all sm:h-10 sm:w-10 sm:text-sm ${
                      active
                        ? "bg-ink text-white ring-2 ring-ink/20 dark:bg-accent dark:text-[#111827] dark:ring-accent/40"
                        : "bg-ink-50 text-ink-400 hover:bg-ink-100"
                    }`}
                    aria-current={active ? "step" : undefined}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 sm:gap-3">
            <Button
              variant="secondary"
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={isFirst}
              className="flex-1 py-3 sm:py-3.5"
            >
              ← السابق
            </Button>
            <Button
              onClick={() => setCurrentIndex(currentIndex + 1)}
              disabled={isLast}
              className="flex-1 py-3 sm:py-3.5"
            >
              التالي →
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}