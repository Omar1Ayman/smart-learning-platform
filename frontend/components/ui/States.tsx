"use client";

import type { ReactNode } from "react";
import { Button } from "./Button";

// ---------------------------------------------------------------------------
// Spinner — kept for inline use, but list pages should use Skeleton.
// ---------------------------------------------------------------------------

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <div
        className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-ink"
        role="status"
        aria-label="جارٍ التحميل"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyState — icon + title + description + optional action
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: string;
  action?: ReactNode;
  variant?: "default" | "warning" | "error";
}

/**
 * Unified empty state across the app.
 *
 * Previous version had no icon and no action — a dead-end. This version
 * turns an empty page into a starting point: "no groups yet — [add group]".
 */
export function EmptyState({
  title,
  description,
  icon = "📭",
  action,
  variant = "default",
}: EmptyStateProps) {
  const bgClass =
    variant === "warning"
      ? "border-accent/30 bg-accent/5"
      : variant === "error"
      ? "border-danger/30 bg-danger/5"
      : "border-line bg-paper-elevated";

  return (
    <div
      className={`card flex flex-col items-center gap-3 border-2 border-dashed ${bgClass} px-6 py-12 text-center`}
    >
      <span className="text-4xl" aria-hidden="true">
        {icon}
      </span>
      <p className="font-display text-base font-bold text-ink">{title}</p>
      {description && (
        <p className="max-w-md text-sm text-ink-500">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ErrorState — with retry button
// ---------------------------------------------------------------------------

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

/**
 * Unified error state — always offers a way forward ("إعادة المحاولة").
 *
 * Previous version was a dead end: user sees "حدث خطأ" and has no action.
 * Now a retry button turns an unrecoverable-looking page into a
 * one-click fix for transient failures (network hiccup, cold backend).
 */
export function ErrorState({
  title = "حدث خطأ",
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="card flex flex-col items-center gap-3 border-danger/30 bg-danger/5 px-6 py-10 text-center">
      <span className="text-4xl" aria-hidden="true">
        ⚠️
      </span>
      <p className="font-display text-base font-bold text-danger">{title}</p>
      <p className="max-w-md text-sm text-ink-600">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="mt-2">
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Re-export V2 alias for backwards compat
// ---------------------------------------------------------------------------

export const EmptyStateV2 = EmptyState;