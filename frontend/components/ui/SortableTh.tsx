"use client";

import type { ReactNode } from "react";
import type { SortDirection } from "@/lib/hooks/useTableSort";

interface SortableThProps {
  children: ReactNode;
  field: string;
  sortField: string | null;
  sortDir: SortDirection | null;
  onToggle: (field: string) => void;
  className?: string;
}

/**
 * رأس عمود قابل للترتيب: نقرة = تصاعدي، نقرة ثانية = تنازلي، ثالثة = افتراضي.
 */
export function SortableTh({
  children,
  field,
  sortField,
  sortDir,
  onToggle,
  className = "",
}: SortableThProps) {
  const active = sortField === field;

  return (
    <th
      scope="col"
      aria-sort={
        active ? (sortDir === "asc" ? "ascending" : "descending") : "none"
      }
      className={`px-4 py-4 text-xs font-semibold ${className}`}
    >
      <button
        type="button"
        onClick={() => onToggle(field)}
        title={
          active && sortDir === "asc"
            ? "اضغط للترتيب تنازليًا"
            : active
              ? "اضغط لإلغاء الترتيب"
              : "اضغط للترتيب"
        }
        className={`inline-flex items-center gap-1 rounded transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
          active
            ? "text-accent-dark dark:text-accent"
            : "text-ink-500"
        }`}
      >
        {children}
        <span
          aria-hidden="true"
          className={`inline-block w-3 text-center text-[10px] leading-none transition-opacity ${
            active ? "opacity-100" : "opacity-30 group-hover:opacity-70"
          }`}
        >
          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}
