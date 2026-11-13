"use client";

import { useState } from "react";
import type { ViewMode } from "@/components/ui/ViewToggle";

const STORAGE_KEY = "roster-view-mode";

/**
 * تفضيل طريقة عرض القوائم (جدول/بطاقات)، محفوظ لكل مستخدم في المتصفح.
 * نفس نمط صفحة الامتحانات (lazy initializer + حفظ عند التغيير).
 */
export function useViewMode(defaultMode: ViewMode = "table") {
  const [mode, setMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return defaultMode;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "table" || saved === "cards" ? saved : defaultMode;
  });

  const setModePersisted = (next: ViewMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  return [mode, setModePersisted] as const;
}
