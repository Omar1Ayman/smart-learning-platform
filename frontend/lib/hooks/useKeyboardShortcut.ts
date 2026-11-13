"use client";

import { useEffect } from "react";

interface Options {
  /** Require Cmd (Mac) or Ctrl (Win/Linux). Default: false. */
  meta?: boolean;
  /** Require Shift. Default: false. */
  shift?: boolean;
  /** Require Alt. Default: false. */
  alt?: boolean;
  /** Fn receives the keyboard event — return false to skip (e.g., in inputs). */
  enabled?: () => boolean;
}

/**
 * Register a keyboard shortcut. Handles both Mac (Meta) and
 * Windows/Linux (Ctrl) for `meta` — the user doesn't have to care.
 *
 * Usage:
 *   useKeyboardShortcut("k", () => setOpen(true), { meta: true });
 */
export function useKeyboardShortcut(
  key: string,
  handler: (e: KeyboardEvent) => void,
  opts: Options = {}
) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (opts.enabled && !opts.enabled()) return;

      const isMac = typeof navigator !== "undefined" &&
        /Mac|iPhone|iPad/.test(navigator.platform);
      const metaOk = opts.meta
        ? isMac
          ? e.metaKey
          : e.ctrlKey
        : true;
      if (opts.meta && !metaOk) return;
      if (opts.shift && !e.shiftKey) return;
      if (opts.alt && !e.altKey) return;

      // Don't trigger inside inputs unless the handler opts out via `enabled`.
      const target = e.target as HTMLElement | null;
      const inInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (inInput && !opts.meta) return;

      if (e.key.toLowerCase() === key.toLowerCase()) {
        e.preventDefault();
        handler(e);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [key, handler, opts.meta, opts.shift, opts.alt, opts.enabled]);
}