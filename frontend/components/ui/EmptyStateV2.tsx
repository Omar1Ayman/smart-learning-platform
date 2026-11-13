"use client";

import type { ReactNode } from "react";

interface EmptyStateV2Props {
  icon?: string; // emoji
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: "default" | "warning" | "error";
}

/**
 * Empty state with icon + title + description + optional action button.
 *
 * Supersedes the old <EmptyState> (kept for backward compat). The addition
 * of an icon and a *primary action* is what makes an empty page a guiding
 * page, not a dead-end page: "No groups yet" with no button is a bug; "No
 * groups yet — [Add group]" is a starting point.
 */
export function EmptyStateV2({
  icon = "📭",
  title,
  description,
  action,
  variant = "default",
}: EmptyStateV2Props) {
  const bgClass =
    variant === "warning"
      ? "border-accent/30 bg-accent/5"
      : variant === "error"
      ? "border-danger/30 bg-danger/5"
      : "border-line bg-paper-elevated";

  return (
    <div className={`card flex flex-col items-center gap-3 border ${bgClass} px-6 py-12 text-center`}>
      <span className="text-4xl">{icon}</span>
      <p className="font-display text-base font-bold text-ink">{title}</p>
      {description && (
        <p className="max-w-md text-sm text-ink-500">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}