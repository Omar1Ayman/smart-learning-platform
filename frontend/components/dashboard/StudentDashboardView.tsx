"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorState, Spinner } from "@/components/ui/States";
import { startAssessment } from "@/lib/api/assessments";
import {
  getStudentDashboard,
  type DashboardRange,
} from "@/lib/api/dashboard";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { toastError } from "@/lib/utils/toast";
import type { UpcomingAssessment } from "@/types";
import { ActivityChart } from "./ActivityChart";
import { DateRangeSelector } from "./DateRangeSelector";
import { MetricCard } from "./MetricCard";

const ALLOWED_RANGES: DashboardRange[] = [7, 14, 30, 90];

function parseRange(raw: string, fallback: DashboardRange = 30): DashboardRange {
  const n = parseInt(raw, 10);
  return (ALLOWED_RANGES as number[]).includes(n) ? (n as DashboardRange) : fallback;
}

// ---------------------------------------------------------------------------
// Priority resolution
// ---------------------------------------------------------------------------

type PriorityKind = "resume" | "open" | "soon";

interface Priority {
  kind: PriorityKind;
  exam: UpcomingAssessment;
}

/**
 * Picks the highest-urgency upcoming exam from the list.
 *
 * Order of preference:
 *   1. has_in_progress_attempt — the student is mid-exam. Highest priority;
 *      forgetting it wastes their timer.
 *   2. window.state === "OPEN" — an exam is open right now. Second highest;
 *      the student might be running out of time to enter.
 *   3. window.state === "NOT_YET" — scheduled ahead. Shown with countdown.
 *
 * If none match, returns null and the dashboard renders without a hero.
 */
function pickPriority(upcoming: UpcomingAssessment[]): Priority | null {
  const inProgress = upcoming.find((a) => a.has_in_progress_attempt);
  if (inProgress) return { kind: "resume", exam: inProgress };

  const openNow = upcoming.find((a) => a.window?.state === "OPEN");
  if (openNow) return { kind: "open", exam: openNow };

  const soon = [...upcoming]
    .filter(
      (a) => a.window?.state === "NOT_YET" && a.starts_at
    )
    .sort(
      (a, b) =>
        new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime()
    )[0];
  if (soon) return { kind: "soon", exam: soon };

  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function StudentDashboardView({ name }: { name?: string }) {
  const [rangeRaw, setRangeRaw] = useUrlState("range", "30");
  const days = parseRange(rangeRaw, 30);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "student", days],
    queryFn: () => getStudentDashboard(days),
    // F-20: refresh every 60s so "opens in 30 seconds" becomes "open now"
    // without the student having to manually reload the page.
    refetchInterval: 60_000,
  });

  const priority = useMemo(
    () => (data ? pickPriority(data.upcoming) : null),
    [data]
  );

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message="تعذّر تحميل اللوحة." />;

  const remaining = priority
    ? data.upcoming.filter((a) => a.id !== priority.exam.id)
    : data.upcoming;

  return (
    <div className="flex flex-col gap-6">
      {/* Greeting */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-ink">
            مرحبًا{name ? `، ${name}` : ""} 👋
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            امتحاناتك القادمة ونتائجك
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.unread_notifications_count > 0 && (
            <Link
              href="/notifications"
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent-dark transition-colors hover:bg-accent/10"
            >
              🔔
              <span>{data.unread_notifications_count} إشعار جديد</span>
            </Link>
          )}
          <DateRangeSelector value={days} onChange={(v) => setRangeRaw(String(v))} />
        </div>
      </div>

      {/* Priority hero — only when there's a top-urgency exam */}
      {priority && <PriorityHeroCard priority={priority} />}

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="امتحانات قادمة" value={data.metrics.upcoming_assessments} />
        <MetricCard label="محاولاتي" value={data.metrics.total_attempts} />
        <MetricCard
          label="متوسط درجاتي"
          value={
            data.metrics.avg_percentage !== null
              ? `${data.metrics.avg_percentage}%`
              : "—"
          }
          accent="success"
        />
        <MetricCard
          label="نسبة النجاح"
          value={data.metrics.pass_rate !== null ? `${data.metrics.pass_rate}%` : "—"}
          accent="warning"
        />
      </div>

      {/* Remaining upcoming */}
      {remaining.length > 0 && (
        <div className="p-5 card">
          <h2 className="mb-3 text-base font-bold font-display text-ink">
            بقية الامتحانات القادمة ({remaining.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {remaining.map((a) => (
              <UpcomingCard key={a.id} exam={a} />
            ))}
          </div>
        </div>
      )}

      {/* Recent results */}
      <div className="p-5 card">
        <h2 className="mb-3 text-base font-bold font-display text-ink">
          آخر نتائجي
        </h2>
        {data.recent_results.length === 0 ? (
          <p className="text-sm text-ink-400">لم تُكمل أي امتحان بعد.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.recent_results.map((r) => (
              <li
                key={r.attempt_id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-ink">
                    {r.assessment_title}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {r.score ?? "—"} / {r.max_score} · {r.percentage}%
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {r.is_passed === true && (
                    <span className="text-xs text-success">✓ ناجح</span>
                  )}
                  {r.is_passed === false && (
                    <span className="text-xs text-danger">✗ راسب</span>
                  )}
                  <Link href={`/results/${r.attempt_id}`}>
                    <Button variant="ghost" className="text-xs">
                      تفاصيل
                    </Button>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ActivityChart data={data.chart} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Priority hero — the big card at the top
// ---------------------------------------------------------------------------

function PriorityHeroCard({ priority }: { priority: Priority }) {
  const router = useRouter();
  const { exam } = priority;

  const startMutation = useMutation({
    mutationFn: () => startAssessment(exam.id),
    onSuccess: (attempt) => {
      router.push(`/exam/${attempt.id}`);
    },
    onError: (err) => toastError(err, "تعذّر بدء الامتحان."),
  });

  function handleResume() {
    if (priority.kind !== "resume" || !exam.in_progress_attempt_id) return;
    router.push(`/exam/${exam.in_progress_attempt_id}`);
  }

  // --- Visual + copy per state ---
  const { borderClass, bgClass, icon, headline, subtext, buttonLabel, buttonAction } =
    (() => {
      switch (priority.kind) {
        case "resume":
          return {
            borderClass: "border-info/40 ring-2 ring-info/20",
            bgClass: "bg-info/5",
            icon: "🔄",
            headline: "لديك محاولة قيد التنفيذ",
            subtext: `استأنف "${exam.title}" من حيث توقفت — الوقت يمشي.`,
            buttonLabel: "استئناف الآن",
            buttonAction: handleResume,
          };
        case "open":
          return {
            borderClass: "border-success/40 ring-2 ring-success/20",
            bgClass: "bg-success/5",
            icon: "🟢",
            headline: "امتحان مفتوح الآن",
            subtext: `${exam.title} — يمكنك البدء الآن${exam.duration_minutes ? ` (مدة: ${exam.duration_minutes} دقيقة)` : ""}.`,
            buttonLabel: startMutation.isPending ? "جارٍ البدء..." : "ابدأ الآن",
            buttonAction: () => startMutation.mutate(),
          };
        case "soon":
          return {
            borderClass: "border-accent/40",
            bgClass: "bg-accent/5",
            icon: "⏰",
            headline: `يفتح ${exam.starts_at ? new Date(exam.starts_at).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "قريبًا"}`,
            subtext: `${exam.title} — استعد قبل الموعد.`,
            buttonLabel: "لم يفتح بعد",
            buttonAction: () => {},
          };
      }
    })();

  return (
    <div
      className={`card overflow-hidden border-2 p-6 ${borderClass} ${bgClass}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-3xl font-display">{icon}</p>
          <h2 className="mt-2 text-xl font-bold font-display text-ink">
            {headline}
          </h2>
          <p className="mt-1 text-sm text-ink-700">{subtext}</p>
        </div>
        <div className="shrink-0">
          <Button
            onClick={buttonAction}
            disabled={
              (priority.kind === "soon") ||
              (priority.kind === "open" && startMutation.isPending)
            }
            variant={priority.kind === "open" ? "primary" : "secondary"}
            className="w-full sm:w-auto sm:min-w-[160px]"
          >
            {buttonLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact upcoming card (used for "remaining" exams)
// ---------------------------------------------------------------------------

function UpcomingCard({ exam }: { exam: UpcomingAssessment }) {
  const router = useRouter();
  const [countdown, setCountdown] = useState<string>("");

  const isOpen = exam.window?.state === "OPEN";
  const isResume = exam.has_in_progress_attempt;

  // Live countdown for NOT_YET exams.
  useEffect(() => {
    if (exam.window?.state !== "NOT_YET" || !exam.starts_at) return;
    function update() {
      const diff = new Date(exam.starts_at!).getTime() - Date.now();
      if (diff <= 0) {
        setCountdown("يُفتح الآن — أعد التحميل");
        return;
      }
      const totalMinutes = Math.floor(diff / 60_000);
      const hours = Math.floor(totalMinutes / 60);
      const days = Math.floor(hours / 24);
      if (days >= 1) setCountdown(`باقي ${days} ${days === 1 ? "يوم" : "أيام"}`);
      else if (hours >= 1) setCountdown(`باقي ${hours} ${hours === 1 ? "ساعة" : "ساعات"}`);
      else setCountdown(`باقي ${totalMinutes} دقيقة`);
    }
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [exam.window?.state, exam.starts_at]);

  const startMutation = useMutation({
    mutationFn: () => startAssessment(exam.id),
    onSuccess: (attempt) => router.push(`/exam/${attempt.id}`),
    onError: (err) => toastError(err, "تعذّر بدء الامتحان."),
  });

  function handleResume() {
    if (!exam.in_progress_attempt_id) return;
    router.push(`/exam/${exam.in_progress_attempt_id}`);
  }

  return (
    <div className="p-3 border rounded-lg border-line bg-paper-muted/20">
      <p className="text-sm font-medium text-ink">{exam.title}</p>
      <p className="mt-1 text-xs text-ink-400">
        محاولات: {exam.my_attempts_used} / {exam.max_attempts}
        {exam.duration_minutes && ` · ${exam.duration_minutes} دقيقة`}
      </p>
      {countdown && (
        <p className="mt-1 text-xs font-medium text-accent-dark">{countdown}</p>
      )}
      <div className="mt-2">
        {isResume ? (
          <Button variant="secondary" className="text-xs" onClick={handleResume}>
            استئناف
          </Button>
        ) : isOpen ? (
          <Button
            variant="secondary"
            className="text-xs"
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
          >
            {startMutation.isPending ? "..." : "ابدأ"}
          </Button>
        ) : (
          <Button variant="ghost" className="text-xs" disabled>
            لم يفتح بعد
          </Button>
        )}
      </div>
    </div>
  );
}