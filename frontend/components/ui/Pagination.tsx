"use client";

import { ChevronLeft, ChevronRight } from "./icons";

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

/**
 * Professional pagination — page numbers with ellipsis + range display.
 *
 * Replaces the plain "prev/next" pair that makes long lists feel broken.
 * Numbers ≤ 7 always shown. Larger lists use ellipsis around the current
 * page (1 ... 4 5 6 ... 20) so the user can jump anywhere in one click.
 */
function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, 4, "...", total];
  if (current >= total - 2)
    return [1, "...", total - 3, total - 2, total - 1, total];
  return [1, "...", current - 1, current, current + 1, "...", total];
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  isLoading,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);
  const pages = getPageNumbers(page, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-paper-elevated px-4 py-3">
      <p className="text-xs text-ink-400">
        عرض <span className="font-medium text-ink">{start}</span>–
        <span className="font-medium text-ink">{end}</span> من{" "}
        <span className="font-medium text-ink">{totalItems}</span>
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || isLoading}
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-paper-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="الصفحة السابقة"
        >
          <ChevronRight size={14} />
        </button>

        {pages.map((p, idx) =>
          p === "..." ? (
            <span
              key={`ellipsis-${idx}`}
              className="flex h-8 w-8 items-center justify-center text-xs text-ink-300"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              disabled={isLoading}
              className={`flex h-8 min-w-[32px] items-center justify-center rounded-md px-2 text-sm font-medium transition-colors ${
                p === page
                  ? "bg-ink text-white dark:bg-accent dark:text-[#111827]"
                  : "text-ink hover:bg-paper-muted"
              }`}
              aria-current={p === page ? "page" : undefined}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || isLoading}
          className="flex h-8 w-8 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-paper-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="الصفحة التالية"
        >
          <ChevronLeft size={14} />
        </button>
      </div>
    </div>
  );
}