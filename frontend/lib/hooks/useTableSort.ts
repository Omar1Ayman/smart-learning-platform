"use client";

import { useCallback, useMemo } from "react";
import { useUrlState } from "./useUrlState";

export type SortDirection = "asc" | "desc";

/**
 * حالة الترتيب لجدول، مربوطة بمعامل `sort` في الرابط بصيغة DRF:
 *   "first_name"  → تصاعدي
 *   "-first_name" → تنازلي
 *   ""            → الترتيب الافتراضي
 *
 * دورة النقر على العمود: تصاعدي ← تنازلي ← افتراضي.
 */
export function useTableSort(defaultOrdering?: string) {
  const [raw, setRaw] = useUrlState("sort", "");

  const field = useMemo(
    () => (raw.startsWith("-") ? raw.slice(1) : raw) || null,
    [raw]
  );

  const dir = useMemo<SortDirection | null>(
    () => (raw.startsWith("-") ? "desc" : raw ? "asc" : null),
    [raw]
  );

  const toggle = useCallback(
    (f: string) => {
      setRaw((prev) => {
        const prevField = prev.startsWith("-") ? prev.slice(1) : prev;
        const prevDir = prev.startsWith("-") ? "desc" : prev ? "asc" : null;
        if (prevField !== f) return f;
        if (prevDir === "asc") return `-${f}`;
        return "";
      });
    },
    [setRaw]
  );

  return {
    ordering: raw || defaultOrdering,
    field,
    dir,
    toggle,
  };
}
