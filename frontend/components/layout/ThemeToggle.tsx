"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, Moon, Sun } from "@/components/ui/icons";
import { useTheme, type Theme } from "@/lib/hooks/useTheme";

const ICON = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

const LABEL: Record<Theme, string> = {
  light: "فاتح",
  dark: "داكن",
  system: "النظام",
};

export function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme();
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

  const DisplayIcon =
    theme === "system" ? Monitor : resolved === "dark" ? Moon : Sun;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded-lg p-2 text-ink-400 transition-colors hover:bg-paper-muted hover:text-ink"
        aria-label="تغيير المظهر"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <DisplayIcon size={18} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute end-0 z-30 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-line bg-paper-elevated shadow-dropdown animate-fade-in-scale"
        >
          {(Object.keys(LABEL) as Theme[]).map((t) => {
            const Icon = ICON[t];
            const active = theme === t;
            return (
              <button
                key={t}
                role="menuitem"
                type="button"
                onClick={() => {
                  setTheme(t);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-start text-sm transition-colors ${
                  active
                    ? "bg-paper-muted text-ink" // Fixed: Was bg-ink-50
                    : "text-ink-700 hover:bg-paper-muted" // Fixed: Was hover:bg-ink-50
                }`}
              >
                <Icon size={14} />
                <span className="flex-1">{LABEL[t]}</span>
                {active && <span className="text-xs text-accent">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}