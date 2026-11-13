"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { StudentAssessment } from "@/types";

const TYPE_LABEL: Record<string, string> = {
  QUIZ: "اختبار قصير",
  PRACTICE: "تدريب",
  MONTHLY_EXAM: "امتحان شهري",
  MIDTERM: "نصف العام",
  HALF_YEAR_EXAM: "نصف العام",
  FINAL: "نهائي",
  END_OF_TERM: "نهاية الترم",
  END_OF_YEAR: "نهاية العام",
  MOCK_EXAM: "امتحان تجريبي",
  ASSIGNMENT: "واجب",
};

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

function formatClock(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

/**
 * Returns a short Arabic countdown to `targetIso`.
 *
 * Uses simple "باقي X" phrasing for all values — Arabic pluralization
 * rules for numbers ≥ 3 differ across dialects and formalization here
 * adds complexity without real value. Users understand "باقي 3 أيام"
 * perfectly well.
 */
function formatCountdown(targetIso: string | null): string | null {
  if (!targetIso) return null;
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return "انتهى";

  const totalSeconds = Math.floor(diff / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const days = Math.floor(hours / 24);

  // Under 1 hour — show minutes + seconds for urgency
  if (totalMinutes < 60) {
    if (totalMinutes < 1) return `${totalSeconds} ثانية`;
    return `${totalMinutes} دقيقة`;
  }
  if (days >= 1) return `${days} ${days === 1 ? "يوم" : "أيام"}`;
  return `${hours} ${hours === 1 ? "ساعة" : "ساعات"}`;
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface StudentAssessmentCardProps {
  assessment: StudentAssessment;
  onStart: () => void;
  isStarting: boolean;
}

export function StudentAssessmentCard({
  assessment,
  onStart,
  isStarting,
}: StudentAssessmentCardProps) {
  // Force re-render every second so the countdown ticks. Only when the
  // card is in a state that has a live countdown — a closed card doesn't
  // need to re-render every second.
  const [, setTick] = useState(0);
  const state = assessment.window?.state ?? "NO_TARGET";
  const hasLiveCountdown = state === "OPEN" || state === "NOT_YET";

  useEffect(() => {
    if (!hasLiveCountdown) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasLiveCountdown]);

  const isResume = assessment.has_in_progress_attempt;
  const isExhausted =
    !isResume &&
    assessment.max_attempts > 0 &&
    assessment.my_attempts_used >= assessment.max_attempts;

  const attemptsLabel =
    assessment.max_attempts > 0
      ? `${assessment.my_attempts_used} / ${assessment.max_attempts}`
      : "بدون حد";

  // ---- Visual + state-specific content ----
  const { containerCls, icon, headline, subtext, canStartNow, buttonLabel, buttonVariant } =
    resolveDisplayState(assessment, isResume, isExhausted);

  return (
    <div
      className={`card flex flex-col gap-4 p-5 transition-shadow hover:shadow-card-hover ${containerCls}`}
    >
      {/* Header: title + type */}
      <div>
        <h2 className="text-lg font-bold font-display text-ink">
          {assessment.title}
        </h2>
        <p className="mt-1 text-xs text-ink-400">
          {TYPE_LABEL[assessment.assessment_type] ?? assessment.assessment_type}
        </p>
      </div>

      {/* Description */}
      {assessment.description && (
        <p className="text-sm line-clamp-2 text-ink-700">
          {assessment.description}
        </p>
      )}

      {/* Meta row */}
      <div className="flex flex-wrap gap-3 text-xs text-ink-400">
        {assessment.duration_minutes && (
          <span>⏱ {assessment.duration_minutes} دقيقة</span>
        )}
        <span className={isExhausted ? "font-medium text-danger" : ""}>
          🔄 {attemptsLabel} محاولة
        </span>
        {assessment.passing_score && (
          <span>🎯 {assessment.passing_score}%</span>
        )}
      </div>

      {/* Window status block */}
      <div
        className={`flex items-start gap-2 rounded-lg border p-3 ${statusBgCls(state)}`}
      >
        <span className="text-xl leading-none">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${statusTextCls(state)}`}>
            {headline}
          </p>
          {subtext && <p className="mt-0.5 text-xs text-ink-700">{subtext}</p>}
        </div>
      </div>

      {/* Action */}
      {canStartNow ? (
        <Button
          onClick={onStart}
          disabled={isStarting}
          variant={buttonVariant}
          className="w-full"
        >
          {isStarting ? "جارٍ..." : buttonLabel}
        </Button>
      ) : (
        <Button disabled variant="secondary" className="w-full">
          {buttonLabel}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// State resolution — the single place that decides "what does this card say?"
// ---------------------------------------------------------------------------

interface DisplayState {
  containerCls: string;
  icon: string;
  headline: string;
  subtext: string;
  canStartNow: boolean;
  buttonLabel: string;
  buttonVariant: "primary" | "secondary" | "danger";
}

function resolveDisplayState(
  a: StudentAssessment,
  isResume: boolean,
  isExhausted: boolean
): DisplayState {
  const window = a.window;
  const state = window?.state ?? "NO_TARGET";

  // ---- NOT_YET: يفتح قريبًا ----
  if (state === "NOT_YET") {
    const opensAt = window?.opens_at;
    const countdown = formatCountdown(opensAt);
    return {
      containerCls: "",
      icon: "⏰",
      headline: `يفتح ${opensAt ? `${formatDate(opensAt)} ${formatClock(opensAt)}` : "قريبًا"}`,
      subtext: countdown ? `باقي ${countdown}` : "",
      canStartNow: false,
      buttonLabel: "لم يبدأ بعد",
      buttonVariant: "secondary",
    };
  }

  // ---- CLOSED ----
  if (state === "CLOSED" || state === "NO_TARGET") {
    // If the student has attempts, this is "finished"
    if (a.my_attempts_used > 0) {
      return {
        containerCls: "",
        icon: "✅",
        headline: "أكملت هذا الامتحان",
        subtext: `استخدمت ${a.my_attempts_used} من ${a.max_attempts} محاولة`,
        canStartNow: false,
        buttonLabel: "انظر النتيجة من صفحة النتائج",
        buttonVariant: "secondary",
      };
    }
    return {
      containerCls: "",
      icon: "🔴",
      headline: window?.reason || "انتهى وقت الامتحان",
      subtext:
        window?.closes_at
          ? `أُغلق في ${formatDate(window.closes_at)} ${formatClock(window.closes_at)}`
          : "",
      canStartNow: false,
      buttonLabel: "غير متاح",
      buttonVariant: "secondary",
    };
  }

  // ---- OPEN ----
  // Resume takes priority (student has an active attempt — can't start a new one)
  if (isResume) {
    const latest = formatCountdown(window?.latest_entry_at ?? null);
    return {
      containerCls: "ring-2 ring-info/20",
      icon: "🔄",
      headline: "لديك محاولة قيد التنفيذ",
      subtext: latest
        ? `باقي ${latest} لاستئنافها`
        : "يمكنك الاستئناف من حيث توقفت",
      canStartNow: true,
      buttonLabel: "استئناف المحاولة",
      buttonVariant: "primary",
    };
  }

  // Exhausted (all attempts used, no in-progress)
  if (isExhausted) {
    return {
      containerCls: "",
      icon: "🚫",
      headline: "استنفدت جميع المحاولات",
      subtext: `استخدمت ${a.my_attempts_used} من ${a.max_attempts} محاولة`,
      canStartNow: false,
      buttonLabel: "لا يمكن المحاولة",
      buttonVariant: "secondary",
    };
  }

  // Fresh start — this is the happy path
  const latest = formatCountdown(window?.latest_entry_at ?? null);
  const maxSeconds = window?.max_duration_if_started_now;
  const durationHint = maxSeconds
    ? `${Math.floor(maxSeconds / 60)} دقيقة متاحة`
    : a.duration_minutes
    ? `${a.duration_minutes} دقيقة`
    : "";

  return {
    containerCls: "ring-2 ring-success/20",
    icon: "🟢",
    headline: "مفتوح الآن — يمكنك البدء",
    subtext: [
      latest ? `باقي ${latest} للدخول` : null,
      durationHint ? `معاك ${durationHint}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    canStartNow: true,
    buttonLabel: `ابدأ الامتحان${
      a.my_attempts_used > 0
        ? ` (محاولة ${a.my_attempts_used + 1})`
        : ""
    }`,
    buttonVariant: "primary",
  };
}

// ---------------------------------------------------------------------------
// Tailwind helpers
// ---------------------------------------------------------------------------

function statusBgCls(state: string): string {
  if (state === "OPEN") return "border-success/30 bg-success/5";
  if (state === "NOT_YET") return "border-info/30 bg-info/5";
  if (state === "CLOSED" || state === "NO_TARGET")
    return "border-ink-200 bg-ink-50";
  return "border-line bg-paper-muted/20";
}

function statusTextCls(state: string): string {
  if (state === "OPEN") return "text-success";
  if (state === "NOT_YET") return "text-info";
  if (state === "CLOSED" || state === "NO_TARGET") return "text-ink-400";
  return "text-ink-700";
}