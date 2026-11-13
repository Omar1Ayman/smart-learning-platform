"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AcademicYearStatus } from "@/types";

/**
 * Global active-year store.
 *
 * Phase 1.6 — كل صفحة قائمة تقرأ السنة النشطة من هنا لفلترة الاستعلامات.
 * يُحفظ في localStorage حتى يبقى عبر إعادة تحميل الصفحة.
 *
 * القاعدة:
 *   - activeYearId === null → المستخدم لم يختر سنة بعد
 *   - activeYearStatus === "ARCHIVED" → القراءة فقط
 */
interface ActiveYearState {
  activeYearId: string | null;
  activeYearName: string | null;
  activeYearStatus: AcademicYearStatus | null;

  setActiveYear: (year: {
    id: string;
    name: string;
    status: string;
  }) => void;
  clearActiveYear: () => void;
}

export const useActiveYearStore = create<ActiveYearState>()(
  persist(
    (set) => ({
      activeYearId: null,
      activeYearName: null,
      activeYearStatus: null,

      setActiveYear: (year) =>
        set({
          activeYearId: year.id,
          activeYearName: year.name,
          activeYearStatus: year.status as AcademicYearStatus,
        }),

      clearActiveYear: () =>
        set({
          activeYearId: null,
          activeYearName: null,
          activeYearStatus: null,
        }),
    }),
    {
      name: "smart-learning-active-year",
      // Persist only the data, not the methods.
      partialize: (state) => ({
        activeYearId: state.activeYearId,
        activeYearName: state.activeYearName,
        activeYearStatus: state.activeYearStatus,
      }),
    }
  )
);

/** Convenience hook — is the current year read-only? */
export function useIsActiveYearReadOnly(): boolean {
  return useActiveYearStore((s) => s.activeYearStatus === "ARCHIVED");
}