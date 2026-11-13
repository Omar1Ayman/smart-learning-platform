"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "theme";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // localStorage blocked (private mode / disabled) — fall back to system.
  }
  return "system";
}

function resolveTheme(t: Theme): ResolvedTheme {
  if (t === "light" || t === "dark") return t;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeClass(t: Theme) {
  const resolved = resolveTheme(t);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.setAttribute("data-theme", resolved);
}

/**
 * Wave A5 — theme management.
 *
 * Three-way switch (light / dark / system). "system" follows the OS via
 * `prefers-color-scheme` and reacts live to OS changes.
 *
 * Flash prevention is handled by an inline `<script>` in app/layout.tsx
 * that runs BEFORE first paint — it reads localStorage and applies the
 * `.dark` class to <html>. So this hook only needs to keep React state
 * and the DOM in sync after hydration.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  // Hydrate from localStorage after mount.
  useEffect(() => {
    const stored = readStoredTheme();
    setThemeState(stored);
    setResolved(resolveTheme(stored));
    applyThemeClass(stored);
  }, []);

  // React to OS preference changes while in "system" mode.
  useEffect(() => {
    if (theme !== "system") return;
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const r = mq.matches ? "dark" : "light";
      setResolved(r);
      applyThemeClass("system");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // ignore — theme still applies for this session
    }
    applyThemeClass(t);
    setResolved(resolveTheme(t));
  }, []);

  // Cycle: light → dark → system → light …
  const toggle = useCallback(() => {
    const next: Theme =
      theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
  }, [theme, setTheme]);

  return { theme, resolved, setTheme, toggle };
}