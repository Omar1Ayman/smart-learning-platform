"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ErrorState, Spinner } from "@/components/ui/States";
import { useSetupStatus } from "@/lib/hooks/useSetupStatus";
import type { SetupStep } from "@/types";

export function SetupStepList() {
  const { data, isLoading, isError, refetch } = useSetupStatus();

  if (isLoading) return <Spinner />;
  if (isError || !data) {
    return (
      <ErrorState
        message="تعذّر تحميل حالة الإعداد."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (data.complete) {
    return <CompleteState afterComplete={data.after_complete} />;
  }

  const required = data.steps.filter((s) => s.importance === "required");
  const recommended = data.steps.filter((s) => s.importance === "recommended");

  const mp = data.minimal_path;
  const mpPct = (mp.done_count / mp.total_count) * 100;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display text-ink">
          إعداد المؤسسة
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          اتبع الخطوات بالترتيب. الخطوات التالية مبنية على ما أنجزته.
        </p>
      </div>

      {/* Progress hero */}
      <div className="p-5 overflow-hidden border-2 card border-accent/30 bg-gradient-to-l from-accent/10 to-transparent">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-ink-400">الرحلة المختصرة</p>
            <p className="mt-1 text-2xl font-bold font-display text-ink">
              {mp.done_count} من {mp.total_count}
            </p>
            <p className="mt-1 text-sm text-ink-700">
              {mp.complete
                ? "أكملت المسار الأساسي — يمكنك المتابعة أو إنهاء الإعداد."
                : `باقي ${data.estimated_minutes_remaining} دقيقة تقريبًا.`}
            </p>
          </div>
          <div className="shrink-0">
            {data.next_action && data.next_action.action_url && (
              <Link href={data.next_action.action_url}>
                <Button className="w-full sm:w-auto sm:min-w-[180px]">
                  ابدأ بـ{data.next_action.label} →
                </Button>
              </Link>
            )}
          </div>
        </div>
        <div className="h-2 mt-4 overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full transition-all duration-500 rounded-full bg-accent"
            style={{ width: `${mpPct}%` }}
          />
        </div>
      </div>

      {/* Required steps */}
      <section>
        <h2 className="mb-3 text-xs font-medium uppercase text-ink-400">
          خطوات أساسية
        </h2>
        <div className="divide-y card divide-line">
          {required.map((step, idx) => (
            <StepRow key={step.key} step={step} index={idx + 1} />
          ))}
        </div>
      </section>

      {/* Recommended steps */}
      {recommended.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase text-ink-400">
            خطوات موصى بها
          </h2>
          <div className="divide-y card divide-line">
            {recommended.map((step) => (
              <StepRow key={step.key} step={step} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StepRow({ step, index }: { step: SetupStep; index?: number }) {
  const isBlocked = !!step.blocked_by;

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 ${
        step.done ? "bg-success/5" : isBlocked ? "opacity-60" : ""
      }`}
    >
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          step.done
            ? "bg-success text-white"
            : isBlocked
            ? "bg-ink-100 text-ink-400"
            : "bg-ink text-white dark:bg-accent dark:text-[#111827]"
        }`}
      >
        {step.done ? "✓" : isBlocked ? "🔒" : index}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={`text-sm font-medium ${
              step.done ? "text-success" : "text-ink"
            }`}
          >
            {step.label}
          </p>
          <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-medium text-ink-400">
            ~{step.estimated_minutes} د
          </span>
        </div>

        {/* Why + meta */}
        <p className="mt-1 text-xs text-ink-400">
          {step.done
            ? `مكتمل — ${step.count} عنصر`
            : isBlocked
            ? `يحتاج أولاً: ${blockedLabel(step.blocked_by!)}`
            : step.why}
        </p>

        {!step.done && step.count > 0 && !isBlocked && (
          <p className="mt-0.5 text-[11px] text-ink-400">
            {step.count} عنصر — أضف المزيد
          </p>
        )}
      </div>

      {!step.done && !isBlocked && step.action_url && (
        <Link href={step.action_url}>
          <Button variant="secondary" className="text-xs shrink-0">
            ابدأ →
          </Button>
        </Link>
      )}
    </div>
  );
}

function blockedLabel(key: string): string {
  const labels: Record<string, string> = {
    academic_year: "السنة الدراسية",
    stage: "المرحلة",
    grade: "الصف",
    group: "المجموعة",
    subject: "المادة",
    course: "المادة الدراسية",
    teacher: "المعلم",
    student: "الطالب",
  };
  return labels[key] ?? key;
}

function CompleteState({
  afterComplete,
}: {
  afterComplete: Array<{
    key: string;
    label: string;
    description: string;
    action_url: string;
    icon: string;
  }>;
}) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="p-8 text-center card">
        <p className="text-5xl font-display">🎉</p>
        <h1 className="mt-4 text-xl font-bold font-display text-ink">
          مؤسستك جاهزة!
        </h1>
        <p className="mt-2 text-sm text-ink-400">
          أكملت جميع الخطوات الأساسية. يمكنك الآن البدء باستخدام المنصة.
        </p>
      </div>

      {afterComplete.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-xs font-medium uppercase text-ink-400">
            إيه اللي بعد كده؟
          </h2>
          <div className="flex flex-col gap-3">
            {afterComplete.map((action) => (
              <Link
                key={action.key}
                href={action.action_url}
                className="flex items-center gap-4 p-4 transition-colors card hover:border-ink/30 hover:bg-ink-50/30"
              >
                <span className="flex items-center justify-center w-12 h-12 text-2xl rounded-lg shrink-0 bg-accent/10">
                  {action.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-ink">{action.label}</p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {action.description}
                  </p>
                </div>
                <span className="shrink-0 text-ink-400">←</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}