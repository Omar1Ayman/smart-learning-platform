"use client";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorState, Spinner } from "@/components/ui/States";
import { startAssessment } from "@/lib/api/assessments";
import { getAttemptResult } from "@/lib/api/attempts";
import { toastError } from "@/lib/utils/toast";
import type { AttemptResultAnswer } from "@/types";

export default function ResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = use(params);
  const router = useRouter();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["result", attemptId],
    queryFn: () => getAttemptResult(attemptId),
  });

  const retryMutation = useMutation({
    mutationFn: () => startAssessment(data!.assessment),
    onSuccess: (attempt) => router.push(`/exam/${attempt.id}`),
    onError: (err) => toastError(err, "تعذّر بدء المحاولة الجديدة."),
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message="تعذّر تحميل النتيجة." />;

  const passed = data.is_passed;
  const passingLabel = passed === true ? "ناجح" : passed === false ? "راسب" : "مكتمل";
  const badgeClass =
    passed === true
      ? "bg-success/10 text-success"
      : passed === false
      ? "bg-danger/10 text-danger"
      : "bg-ink-50 text-ink-700";

  const showAnswers = data.tenant_policies?.show_correct_answers_after_submit ?? true;

  return (
    <div className="flex flex-col max-w-2xl gap-6 mx-auto">
      {/* ============ Score card ============ */}
      <div className="p-6 text-center card">
        <h1 className="text-xl font-bold font-display text-ink">{data.assessment_title}</h1>
        <p className="mt-1 text-sm text-ink-400">محاولة #{data.attempt_number}</p>

        <p className="mt-6 text-5xl font-bold font-display text-ink">{data.percentage}%</p>
        <p className="mt-2 text-sm text-ink-400">
          {data.score} / {data.max_score} نقطة
        </p>
        <p className={`mt-4 inline-block rounded-full px-3 py-1 text-sm font-medium ${badgeClass}`}>
          {passingLabel}
        </p>

        {data.status === "SUBMITTED" && (
          <p className="mt-4 text-xs text-ink-400">
            بعض الإجابات بانتظار التصحيح اليدوي — النتيجة قد تتغير.
          </p>
        )}
        {data.status === "VOIDED" && (
          <p className="mt-4 text-xs text-danger">
            هذه المحاولة ملغاة من قِبل المدرس.
          </p>
        )}
      </div>

      {/* ============ Answers ============ */}
      {showAnswers ? (
        <div className="flex flex-col gap-3">
          {data.answers.map((a, idx) => (
            <AnswerCard key={a.question} answer={a} index={idx + 1} />
          ))}
        </div>
      ) : (
        <div className="p-6 text-center card">
          <p className="text-sm text-ink-400">
            🔒 عرض الإجابات التفصيلية غير متاح حسب سياسة المؤسسة.
          </p>
        </div>
      )}

      {/* ============ Next steps — F-21 ============ */}
      <div className="p-5 card">
        <h2 className="mb-3 text-base font-bold font-display text-ink">
          إيه اللي بعد كده؟
        </h2>

        <div className="flex flex-col gap-2">
          {data.can_retry ? (
            <Button
              onClick={() => retryMutation.mutate()}
              disabled={retryMutation.isPending}
              className="justify-center w-full"
            >
              {retryMutation.isPending ? "جارٍ البدء..." : "🔄 حاول مرة أخرى"}
            </Button>
          ) : (
            <div className="p-3 border rounded-lg border-line bg-paper-muted/30">
              <p className="text-sm font-medium text-ink-700">
                لا يمكن إعادة المحاولة
              </p>
              {data.retry_reason && (
                <p className="mt-1 text-xs text-ink-400">{data.retry_reason}</p>
              )}
            </div>
          )}

          <Link href="/assessments" className="block">
            <Button variant="secondary" className="justify-center w-full">
              📋 العودة لقائمة الامتحانات
            </Button>
          </Link>

          <Link href="/content" className="block">
            <Button variant="ghost" className="justify-center w-full text-sm">
              📚 راجع محتوى المادة
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AnswerCard({ answer, index }: { answer: AttemptResultAnswer; index: number }) {
  const badge = answer.is_correct === true ? "✓" : answer.is_correct === false ? "✗" : "—";
  const color =
    answer.is_correct === true
      ? "text-success"
      : answer.is_correct === false
      ? "text-danger"
      : "text-ink-400";

  return (
    <div className="p-4 card">
      <div className="flex items-start gap-3">
        <span className={`shrink-0 font-mono text-lg ${color}`}>{badge}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink">
            <span className="text-ink-400">{index}. </span>
            {answer.question_text}
          </p>
          <div className="mt-2 rounded-lg bg-ink-50 p-2.5">
            <p className="text-xs text-ink-400">إجابتك:</p>
            <p className="mt-1 text-sm whitespace-pre-wrap text-ink">
              {answer.text_answer ||
                (answer.chosen_option ? "تم اختيار إجابة" : "بدون إجابة")}
            </p>
          </div>
          {answer.awarded_points !== null && (
            <p className="mt-2 text-xs text-ink-400">{answer.awarded_points} نقطة</p>
          )}
          {answer.is_correct === null && (
            <p className="mt-1 text-xs text-ink-400">بانتظار التصحيح اليدوي</p>
          )}

          {answer.explanation && (
            <div className="p-3 mt-3 border rounded-lg border-accent/20 bg-accent/5">
              <p className="flex items-center gap-1 mb-1 text-xs font-medium text-accent-dark">
                💡 الشرح
              </p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink-700">
                {answer.explanation}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}