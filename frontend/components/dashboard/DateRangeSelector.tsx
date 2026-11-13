"use client";

import type { DashboardRange } from "@/lib/api/dashboard";

const RANGES: Array<{ value: DashboardRange; label: string }> = [
  { value: 7, label: "7 أيام" },
  { value: 14, label: "14 يوماً" },
  { value: 30, label: "30 يوماً" },
  { value: 90, label: "90 يوماً" },
];

interface DateRangeSelectorProps {
  value: DashboardRange;
  onChange: (v: DashboardRange) => void;
}

/**
 * Wave D0c-3a — range switcher for the dashboard. Pill-style buttons
 * (not a dropdown) because there are only 4 options and the choice is
 * frequent — a dropdown would hide them behind one extra click.
 */
export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-line bg-paper-elevated p-0.5">
      {RANGES.map((r) => {
        const active = value === r.value;
        return (
          <button
            key={r.value}
            type="button"
            onClick={() => onChange(r.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-ink text-white dark:bg-accent dark:text-[#111827]"
                : "text-ink-400 hover:bg-paper-muted hover:text-ink"
            }`}
            aria-pressed={active}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}