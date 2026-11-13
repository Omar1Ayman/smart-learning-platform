"use client";

import { Clock } from "@/components/ui/icons";

interface ExamTimerProps {
  secondsLeft: number | null;
}

/**
 * Batch 7 (Milestone 2) — progressive-disclosure timer.
 *
 * States (4 tiers):
 *   - unlimited: no duration          → calm ink-50
 *   - normal:    > 15 min             → calm ink-50
 *   - notice:    5–15 min             → soft amber
 *   - warning:   1–5 min              → strong amber
 *   - critical:  < 1 min              → pulsing red
 *
 * Accessibility approach (revised after React 19 compiler feedback):
 *   - The visible timer has NO aria-label — it changes every second and
 *     would spam screen readers.
 *   - A hidden `role="status" aria-live="polite"` region renders a
 *     sentence describing the CURRENT tier. The text changes ONLY on
 *     tier transitions (notice → warning → critical). Identical text
 *     across ticks is deduped by screen readers — no spam.
 *   - No ref is used to track "previous state" — React 19's
 *     `react-hooks/refs` rule forbids reading refs during render, and
 *     aria-live deduplication makes the "previous state" tracking
 *     unnecessary.
 *
 * Layout: time font size stays STABLE across states (no layout shift
 * during an exam). Only color/ring/pulse change.
 */

type TimerState = "unlimited" | "normal" | "notice" | "warning" | "critical";

function getState(secondsLeft: number | null): TimerState {
  if (secondsLeft === null) return "unlimited";
  if (secondsLeft <= 60) return "critical";
  if (secondsLeft <= 300) return "warning";
  if (secondsLeft <= 900) return "notice";
  return "normal";
}

function formatTime(seconds: number | null): string {
  if (seconds === null) return "∞";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const STATE_STYLES: Record<TimerState, { text: string; label: string }> = {
  unlimited: { text: "text-ink", label: "بدون حد" },
  normal: { text: "text-ink", label: "الوقت" },
  notice: { text: "text-ink-700", label: "تبقى 15 د" },
  warning: { text: "text-accent-dark", label: "تبقى 5 د" },
  critical: { text: "text-danger", label: "آخر دقيقة!" },
};

const STATE_CONTAINER: Record<TimerState, string> = {
  unlimited: "bg-ink-50",
  normal: "bg-ink-50",
  notice: "bg-accent/10 ring-1 ring-accent/20",
  warning: "bg-accent/20 ring-1 ring-accent/40",
  critical: "bg-danger/15 ring-2 ring-danger/40 animate-pulse",
};

/**
 * The text announced by the screen reader — changes ONLY on tier
 * transitions. Empty string for calm states, so SR stays silent.
 */
function announcementFor(state: TimerState): string {
  switch (state) {
    case "notice":
      return "تنبيه: تبقى أقل من 15 دقيقة على انتهاء الامتحان";
    case "warning":
      return "تحذير: تبقى أقل من 5 دقائق على انتهاء الامتحان";
    case "critical":
      return "خطر: تبقى أقل من دقيقة على انتهاء الامتحان";
    default:
      return "";
  }
}

export function ExamTimer({ secondsLeft }: ExamTimerProps) {
  const state = getState(secondsLeft);
  const styles = STATE_STYLES[state];

  return (
    <div
      className={`relative shrink-0 rounded-lg px-2.5 py-1.5 text-end tabular-nums transition-all duration-500 sm:px-3 sm:py-2 ${STATE_CONTAINER[state]}`}
      role="timer"
    >
      <p
        className={`flex items-center justify-end gap-1 text-[9px] font-medium sm:text-[10px] ${
          state === "critical"
            ? "text-danger"
            : state === "warning"
            ? "text-accent-dark"
            : "text-ink-400"
        }`}
      >
        <Clock size={10} />
        <span className="hidden sm:inline">{styles.label}</span>
        <span className="sm:hidden">الوقت</span>
      </p>
      <p
        className={`font-mono text-base font-bold leading-tight sm:text-xl ${styles.text}`}
      >
        {formatTime(secondsLeft)}
      </p>

      {/* Screen-reader announcement. Text changes only on state
          transitions; identical text across ticks is deduped. */}
      <span className="sr-only" role="status" aria-live="polite">
        {announcementFor(state)}
      </span>
    </div>
  );
}