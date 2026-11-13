"use client";

import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number | null;
  hint?: string;
  icon?: ReactNode;
  trend?: {
    direction: "up" | "down" | "flat";
    value: string;
  };
  accent?: "default" | "success" | "warning" | "danger";
}

const ACCENT_BG = {
  default: "bg-paper-muted text-ink",
  success: "bg-success/10 text-success",
  warning: "bg-accent/10 text-accent-dark",
  danger: "bg-danger/10 text-danger",
};

const ACCENT_TEXT = {
  default: "text-ink",
  success: "text-success",
  warning: "text-accent-dark",
  danger: "text-danger",
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  trend,
  accent = "default",
}: StatCardProps) {
  return (
    <div className="card-elevated p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
          {label}
        </p>
        {icon && (
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-base ${ACCENT_BG[accent]}`}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
      </div>

      <p
        className={`mt-3 font-display text-3xl font-bold tabular-nums ${ACCENT_TEXT[accent]}`}
      >
        {value ?? "—"}
      </p>

      <div className="mt-1 flex items-center gap-2">
        {trend && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-medium ${
              trend.direction === "up"
                ? "text-success"
                : trend.direction === "down"
                ? "text-danger"
                : "text-ink-400"
            }`}
          >
            {trend.direction === "up" ? "▲" : trend.direction === "down" ? "▼" : "—"}{" "}
            {trend.value}
          </span>
        )}
        {hint && <span className="text-xs text-ink-400">{hint}</span>}
      </div>
    </div>
  );
}