"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { prepareNextYear } from "@/lib/api/rollover";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import { updateRolloverProgress } from "@/lib/rollover/progress";
import type {
  AcademicYear,
  PrepareNextYearInput,
  PrepareNextYearResponse,
} from "@/types";

interface Step2Props {
  year: AcademicYear;
  storageKey: string | null;
  savedInput: PrepareNextYearInput | null;
  onPrepared: (result: PrepareNextYearResponse) => void;
  onSkip: () => void;
  onBack: () => void;
}

function suggestName(currentName: string): string {
  const match = currentName.match(/^(\d{4})\/(\d{4})$/);
  if (match) {
    const y1 = parseInt(match[1], 10) + 1;
    const y2 = parseInt(match[2], 10) + 1;
    return `${y1}/${y2}`;
  }
  return currentName + " (جديد)";
}

function nextDate(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function Step2NewYearInfo({
  year,
  storageKey,
  savedInput,
  onPrepared,
  onSkip,
  onBack,
}: Step2Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(savedInput?.name ?? suggestName(year.name));
  const [startDate, setStartDate] = useState(
    savedInput?.start_date ?? nextDate(year.end_date, 1)
  );
  const [endDate, setEndDate] = useState(
    savedInput?.end_date ?? nextDate(year.end_date, 365)
  );
  const [copyTerms, setCopyTerms] = useState(savedInput?.copy_terms ?? true);
  const [copyGroups, setCopyGroups] = useState(savedInput?.copy_groups ?? true);
  const [copyCourses, setCopyCourses] = useState(
    savedInput?.copy_courses ?? true
  );

  const mutation = useMutation({
    mutationFn: (input: PrepareNextYearInput) =>
      prepareNextYear(year.id, input),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      if (result.reused_existing) {
        toastSuccess(
          result.request_changed
            ? "تم استعادة السنة المجهزة سابقًا بإعداداتها الأصلية."
            : "تم استعادة السنة التي جرى تجهيزها سابقًا."
        );
      }
      onPrepared(result);
    },
    onError: (err) => toastError(err, "تعذّر تجهيز السنة الجديدة."),
  });

  function handlePrepare() {
    const input: PrepareNextYearInput = {
      name,
      start_date: startDate,
      end_date: endDate,
      copy_terms: copyTerms,
      copy_groups: copyGroups,
      copy_courses: copyCourses,
    };
    if (
      storageKey &&
      !updateRolloverProgress(storageKey, year.id, { prepareInput: input })
    ) {
      toastError(
        new Error("تعذّر حفظ بيانات السنة الجديدة على هذا الجهاز."),
        "قد تحتاج إلى إعادة إدخالها إذا أُغلقت الصفحة."
      );
    }
    mutation.mutate(input);
  }

  const endDateError =
    startDate && endDate && endDate <= startDate
      ? "تاريخ النهاية يجب أن يكون بعد البداية."
      : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold font-display text-ink">
          تجهيز السنة الدراسية الجديدة
        </h2>
        <p className="mt-1 text-sm text-ink-400">
          سيتم إنشاء سنة جديدة كمسودة، ثم نسخ الهيكل المختار من{" "}
          <strong>{year.name}</strong>.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Input
          label="اسم السنة"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          label="تاريخ البداية"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          required
        />
        <Input
          label="تاريخ النهاية"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          error={endDateError ?? undefined}
          required
        />
      </div>

      <div className="rounded-lg border border-line bg-paper-muted/20 p-4">
        <p className="mb-3 text-sm font-medium text-ink-700">نسخ الهيكل</p>
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={copyTerms}
              onChange={(e) => setCopyTerms(e.target.checked)}
              className="h-4 w-4 accent-ink"
            />
            الترمات (تُنسَخ مع تعديل تواريخها لتناسب السنة الجديدة)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={copyGroups}
              onChange={(e) => setCopyGroups(e.target.checked)}
              className="h-4 w-4 accent-ink"
            />
            المجموعات (بنفس الأسماء والصفوف)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={copyCourses}
              onChange={(e) => setCopyCourses(e.target.checked)}
              className="h-4 w-4 accent-ink"
            />
            الكورسات (السنة كاملة فقط — الكورسات المرتبطة بترم تُترك)
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}>
            ← السابق
          </Button>
          <Button variant="ghost" onClick={onSkip}>
            تجاوز الإنشاء → أرشفة فقط
          </Button>
        </div>
        <Button
          onClick={handlePrepare}
          disabled={
            mutation.isPending ||
            !name.trim() ||
            !startDate ||
            !endDate ||
            !!endDateError
          }
        >
          {mutation.isPending ? "جارٍ الإنشاء..." : "إنشاء ومتابعة →"}
        </Button>
      </div>
    </div>
  );
}