"use client";

export type ViewMode = "table" | "cards";

interface ViewToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  className?: string;
}

/**
 * مبدّل طريقة عرض القوائم (جدول / بطاقات). يظهر فقط على الشاشات المتوسطة
 * فأكبر لأن الموبايل يعرض البطاقات دائمًا.
 */
export function ViewToggle({ value, onChange, className = "" }: ViewToggleProps) {
  const base =
    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors";

  return (
    <div
      role="group"
      aria-label="طريقة عرض القائمة"
      className={`hidden items-center rounded-lg border border-line bg-paper-muted p-0.5 md:inline-flex ${className}`}
    >
      <button
        type="button"
        aria-pressed={value === "table"}
        onClick={() => onChange("table")}
        className={`${base} ${
          value === "table"
            ? "bg-paper-elevated text-ink shadow-sm"
            : "text-ink-400 hover:text-ink"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 9h18M3 14h18M9 4v16" />
        </svg>
        جدول
      </button>
      <button
        type="button"
        aria-pressed={value === "cards"}
        onClick={() => onChange("cards")}
        className={`${base} ${
          value === "cards"
            ? "bg-paper-elevated text-ink shadow-sm"
            : "text-ink-400 hover:text-ink"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <rect x="3" y="4" width="8" height="7" rx="1.5" />
          <rect x="13" y="4" width="8" height="7" rx="1.5" />
          <rect x="3" y="13" width="8" height="7" rx="1.5" />
          <rect x="13" y="13" width="8" height="7" rx="1.5" />
        </svg>
        بطاقات
      </button>
    </div>
  );
}
