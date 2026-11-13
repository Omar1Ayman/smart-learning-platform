"use client";

import { useEffect, useRef, useState } from "react";

export interface ActionMenuItem {
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  ariaLabel?: string;
}

/**
 * Kebab menu (⋮) for per-row actions in tables.
 *
 * Wave Zero follow-up: this is the reusable component that powers the
 * Edit/Delete actions on every resource page. It handles:
 *   - Click-outside to close (bound only while open — no global listener
 *     leaking on unmounted rows).
 *   - Escape key to close.
 *   - Danger variant (red text) for destructive actions.
 *   - Disabled state per item.
 *
 * Usage:
 *   <ActionMenu items={[
 *     { label: "تعديل", onClick: () => openEdit(row) },
 *     { label: "حذف", onClick: () => setDeleteTarget(row), variant: "danger" },
 *   ]} />
 */
export function ActionMenu({ items, ariaLabel = "الإجراءات" }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-paper-muted hover:text-ink"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⋮
      </button>
      {open && (
        <div
          role="menu"
          className="absolute end-0 z-30 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-line bg-paper-elevated shadow-lg"
        >
          {items.map((item, i) => (
            <button
              key={i}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`block w-full px-3 py-2 text-start text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                item.variant === "danger"
                  ? "text-danger hover:bg-danger/5"
                  : "text-ink hover:bg-paper-muted"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}