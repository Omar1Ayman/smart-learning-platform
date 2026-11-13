"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { archiveYear } from "@/lib/api/rollover";
import { useActiveYearStore } from "@/lib/hooks/useActiveYear";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type {
  AcademicYear,
  PrepareNextYearResponse,
} from "@/types";

interface Step4Props {
  year: AcademicYear;
  preparedYear: PrepareNextYearResponse | null;
  promotedCount: number | null;
  onArchived: () => void;
}

export function Step4Archive({
  year,
  preparedYear,
  promotedCount,
  onArchived,
}: Step4Props) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const activeYearId = useActiveYearStore((s) => s.activeYearId);
  const clearActiveYear = useActiveYearStore((s) => s.clearActiveYear);

  const archiveMutation = useMutation({
    mutationFn: async () => {
      await archiveYear(year.id);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["academic-years"] }),
        queryClient.invalidateQueries({ queryKey: ["setup-status"] }),
      ]);

      if (activeYearId === year.id) {
        clearActiveYear();
      }

      toastSuccess(`تم أرشفة ${year.name}`);
      onArchived();
    },
    onError: (err) => toastError(err, "تعذّرت الأرشفة."),
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold font-display text-ink">
          أرشفة السنة
        </h2>
        <p className="mt-1 text-sm text-ink-400">
          الخطوة الأخيرة: أرشفة <strong>{year.name}</strong>. بعد الأرشفة،
          تصبح السنة للقراءة فقط.
        </p>
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-line bg-paper-muted/20 p-4">
        <p className="mb-3 text-sm font-medium text-ink-700">ملخص العملية</p>
        <ul className="space-y-2 text-sm text-ink-700">
          {preparedYear ? (
            <>
              <li className="flex items-center gap-2">
                <span className="text-success">✓</span>
                تم تجهيز السنة الجديدة وتفعيلها:{" "}
                <strong>{preparedYear.new_year_name}</strong>
              </li>
              {preparedYear.copied.terms !== undefined && (
                <li className="flex items-center gap-2 ps-5 text-xs text-ink-400">
                  — نسخ {preparedYear.copied.terms} ترم
                </li>
              )}
              {preparedYear.copied.groups !== undefined && (
                <li className="flex items-center gap-2 ps-5 text-xs text-ink-400">
                  — نسخ {preparedYear.copied.groups} مجموعة
                </li>
              )}
              {preparedYear.copied.courses !== undefined && (
                <li className="flex items-center gap-2 ps-5 text-xs text-ink-400">
                  — نسخ {preparedYear.copied.courses} كورس
                </li>
              )}
            </>
          ) : (
            <li className="flex items-center gap-2">
              <span className="text-accent">⚠️</span>
              لن تُنشأ سنة جديدة. أرشفة فقط.
            </li>
          )}
          {promotedCount !== null && promotedCount > 0 && (
            <li className="flex items-center gap-2">
              <span className="text-success">✓</span>
              تمت ترقية {promotedCount} طالب
            </li>
          )}
          <li className="flex items-center gap-2">
            <span className="text-ink-400">→</span>
            ستُؤرشف <strong>{year.name}</strong> (قراءة فقط)
          </li>
        </ul>
      </div>

      {!preparedYear && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
          <p className="text-sm text-accent-dark">
            ⚠️ لن تُنشأ أو تُفعّل سنة جديدة في هذه العملية. تأكد من وجود سنة
            نشطة أخرى قبل الأرشفة، وإلا ستحتاج لإنشاء سنة وتفعيلها يدويًا.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <Button
          variant="ghost"
          onClick={() => router.push("/academic-years")}
        >
          إلغاء (بدون أرشفة)
        </Button>
        <Button
          variant="danger"
          onClick={() => archiveMutation.mutate()}
          disabled={archiveMutation.isPending}
        >
          {archiveMutation.isPending
            ? "جارٍ الأرشفة..."
            : `أرشفة ${year.name} الآن`}
        </Button>
      </div>
    </div>
  );
}