"use client";

import type { ReactNode } from "react";

export type StatusVariant =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "accent";

const VARIANT_STYLES: Record<
  StatusVariant,
  { bg: string; text: string; dot: string }
> = {
  success: { bg: "bg-success/10", text: "text-success", dot: "bg-success" },
  warning: { bg: "bg-accent/15", text: "text-accent-dark", dot: "bg-accent" },
  danger: { bg: "bg-danger/10", text: "text-danger", dot: "bg-danger" },
  info: { bg: "bg-info/10", text: "text-info", dot: "bg-info" },
  neutral: { bg: "bg-paper-muted", text: "text-ink-400", dot: "bg-ink-400" },
  accent: { bg: "bg-accent/20", text: "text-accent-dark", dot: "bg-accent" },
};

interface StatusBadgeProps {
  variant?: StatusVariant;
  children: ReactNode;
  /** إظهار النقطة الملوّنة قبل النص. افتراضي: true */
  withDot?: boolean;
  /** الحجم. افتراضي: "md" */
  size?: "sm" | "md";
  className?: string;
}

/**
 * Badge موحّد لكل الحالات في الموقع.
 *
 * الاستخدام:
 *   <StatusBadge variant="success">نشط</StatusBadge>
 *   <StatusBadge variant="warning">مسودة</StatusBadge>
 *   <StatusBadge variant="danger">مرفوض</StatusBadge>
 *   <StatusBadge variant="info">قيد التنفيذ</StatusBadge>
 *   <StatusBadge variant="neutral" withDot={false}>مؤرشف</StatusBadge>
 *
 * بديل عن: <span className="bg-success/10 text-success ...">...</span>
 */
export function StatusBadge({
  variant = "neutral",
  children,
  withDot = true,
  size = "md",
  className = "",
}: StatusBadgeProps) {
  const styles = VARIANT_STYLES[variant];
  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${sizeClasses} ${styles.bg} ${styles.text} ${className}`}
    >
      {withDot && (
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${styles.dot}`}
        />
      )}
      {children}
    </span>
  );
}