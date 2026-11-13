"use client";

import Link from "next/link";
import { useActiveYearStore } from "@/lib/hooks/useActiveYear";

/**
 * يظهر في أعلى كل صفحة dashboard:
 *   - لا سنة مختارة → تنبيه "اختر السنة"
 *   - السنة ARCHIVED → تنبيه "قراءة فقط"
 *   - السنة ACTIVE / CLOSING → لا شيء
 */
export function YearReadOnlyBanner() {
  const activeYearId = useActiveYearStore((s) => s.activeYearId);
  const activeYearName = useActiveYearStore((s) => s.activeYearName);
  const activeYearStatus = useActiveYearStore((s) => s.activeYearStatus);

  if (!activeYearId) {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3">
        <span className="text-lg">📅</span>
        <div className="flex-1">
          <p className="text-sm font-bold text-ink">لم تختر السنة الدراسية</p>
          <p className="mt-0.5 text-xs text-ink">
            فعّل سنة دراسية من صفحة السنوات الدراسية لبدء العمل. الصفحات لن
            تحمّل البيانات حتى تختار سنة نشطة.
          </p>
        </div>
        <Link
          href="/academic-years"
          className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-ink/80"
        >
          السنوات الدراسية
        </Link>
      </div>
    );
  }

  if (activeYearStatus === "ARCHIVED") {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-lg border border-ink/30 bg-paper-muted px-4 py-3">
        <span className="text-lg">📦</span>
        <div className="flex-1">
          <p className="text-sm font-bold text-ink">
            {activeYearName} — للقراءة فقط
          </p>
          <p className="mt-0.5 text-xs text-ink">
            هذه السنة مؤرشفة. يمكنك عرض البيانات وتصديرها، لكن لا يمكن
            التعديل أو الإضافة. لفتح سنة جديدة، راجع صفحة السنوات الدراسية.
          </p>
        </div>
      </div>
    );
  }

  return null;
}