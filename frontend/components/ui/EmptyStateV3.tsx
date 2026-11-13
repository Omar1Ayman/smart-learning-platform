"use client";

import type { ReactNode } from "react";

export type EmptyVariant =
  | "no-data"      // القائمة جديدة، مفيش حاجة لسه
  | "no-results"   // فيه فلتر مطبّق لكن مفيش نتيجة
  | "no-access"    // المستخدم مش مصرّح
  | "error";       // حاجة كسرت

const DEFAULTS: Record<
  EmptyVariant,
  { icon: string; title: string; bg: string; border: string }
> = {
  "no-data": {
    icon: "📭",
    title: "لا توجد بيانات",
    bg: "bg-paper-elevated",
    border: "border-line",
  },
  "no-results": {
    icon: "🔍",
    title: "لا توجد نتائج مطابقة",
    bg: "bg-paper-elevated",
    border: "border-line",
  },
  "no-access": {
    icon: "🔒",
    title: "غير مصرّح",
    bg: "bg-paper-muted",
    border: "border-line",
  },
  error: {
    icon: "⚠️",
    title: "حدث خطأ",
    bg: "bg-danger/5",
    border: "border-danger/30",
  },
};

interface EmptyStateV3Props {
  variant?: EmptyVariant;
  icon?: string;
  title?: string;
  description?: string;
  action?: ReactNode;
}

/**
 * Empty state موحّد. اختر الـ variant حسب السبب:
 *
 *   <EmptyStateV3
 *     variant="no-data"
 *     description="ابدأ بإضافة أول عنصر"
 *     action={<Button>+ إضافة</Button>}
 *   />
 *
 *   <EmptyStateV3
 *     variant="no-results"
 *     description="جرّب مسح الفلاتر أو تعديل البحث"
 *     action={<Button variant="ghost" onClick={clearFilters}>مسح الفلاتر</Button>}
 *   />
 */
export function EmptyStateV3({
  variant = "no-data",
  icon,
  title,
  description,
  action,
}: EmptyStateV3Props) {
  const defaults = DEFAULTS[variant];
  const displayIcon = icon ?? defaults.icon;
  const displayTitle = title ?? defaults.title;

  return (
    <div
      className={`card flex flex-col items-center gap-3 border-2 border-dashed px-6 py-12 text-center ${defaults.bg} ${defaults.border}`}
    >
      <span className="text-4xl" aria-hidden="true">
        {displayIcon}
      </span>
      <p className="font-display text-base font-bold text-ink">
        {displayTitle}
      </p>
      {description && (
        <p className="max-w-md text-sm text-ink-500">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}