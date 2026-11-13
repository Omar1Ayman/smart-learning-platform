"use client";

interface MetricCardProps {
  label: string;
  value: string | number | null;
  hint?: string;
  accent?: "default" | "success" | "warning" | "danger";
}

const ACCENT_STYLE: Record<NonNullable<MetricCardProps["accent"]>, string> = {
  default: "text-ink",
  success: "text-success",
  warning: "text-accent-dark",
  danger: "text-danger",
};

export function MetricCard({ label, value, hint, accent = "default" }: MetricCardProps) {
  return (
    <div className="card p-5">
      <p className="text-xs text-ink-400">{label}</p>
      <p className={`mt-2 font-display text-3xl font-bold ${ACCENT_STYLE[accent]}`}>
        {value ?? "—"}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}