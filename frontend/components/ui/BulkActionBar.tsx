"use client";

import { Trash, X } from "@/components/ui/icons";

interface BulkActionBarProps {
  count: number;
  onClearSelection: () => void;
  onDeleteSelected?: () => void;
  extraActions?: React.ReactNode;
}

/**
 * Sticky action bar that appears above the table when one or more rows
 * are selected. Positioned `top-16` to sit below the Topbar (h-16).
 * Uses a high z-index but stays under modals (z-40) so ConfirmDialog
 * correctly overlays it.
 */
export function BulkActionBar({
  count,
  onClearSelection,
  onDeleteSelected,
  extraActions,
}: BulkActionBarProps) {
  if (count === 0) return null;

  return (
    <div className="sticky top-16 z-30 flex items-center justify-between gap-3 rounded-lg bg-ink px-4 py-2 text-sm text-white shadow-lg animate-slide-in-up dark:bg-paper-elevated dark:text-ink">
      <div className="flex items-center gap-3">
        <span className="font-medium">تم تحديد {count} عنصر</span>
        <button
          onClick={onClearSelection}
          className="flex items-center gap-1 text-xs text-white/70 transition-colors hover:text-white"
        >
          <X size={12} />
          إلغاء التحديد
        </button>
      </div>
      <div className="flex items-center gap-2">
        {extraActions}
        {onDeleteSelected && (
          <button
            onClick={onDeleteSelected}
            className="flex items-center gap-1.5 rounded-md bg-paper-muted px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-paper"
          >
            <Trash size={14} />
            حذف المحدد ({count})
          </button>
        )}
      </div>
    </div>
  );
}