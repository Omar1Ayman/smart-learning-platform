"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { ErrorState, Spinner } from "@/components/ui/States";
import { getClosePreflight } from "@/lib/api/rollover";
import type { AcademicYear } from "@/types";

interface Step1Props {
  year: AcademicYear;
  onNext: () => void;
}

export function Step1Preflight({ year, onNext }: Step1Props) {
  const { data: preflight, isLoading, isError, refetch } = useQuery({
    queryKey: ["close-preflight", year.id],
    queryFn: () => getClosePreflight(year.id),
  });

  if (isLoading) return <Spinner />;
  if (isError || !preflight)
    return (
      <ErrorState
        message="تعذّر فحص الجاهزية."
        onRetry={() => {
          void refetch();
        }}
      />
    );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold font-display text-ink">
          فحص الجاهزية
        </h2>
        <p className="mt-1 text-sm text-ink-400">
          قبل إغلاق <strong>{year.name}</strong>، نتحقق من عدم وجود عمليات
          معلقة.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="المجموعات" value={preflight.stats.groups} />
        <Stat label="الكورسات" value={preflight.stats.courses} />
        <Stat label="الترمات" value={preflight.stats.terms} />
        <Stat label="تسجيلات نشطة" value={preflight.stats.active_enrollments} />
      </div>

      {/* Issues */}
      {preflight.issues.length === 0 ? (
        <div className="rounded-lg border border-success/30 bg-success/5 p-4">
          <div className="flex items-start gap-2">
            <span className="text-lg">✅</span>
            <div>
              <p className="font-medium text-success">السنة جاهزة للإغلاق</p>
              <p className="mt-0.5 text-xs text-ink-700">
                لا توجد مشاكل معلقة. يمكنك المتابعة.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {preflight.issues.map((issue, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 ${
                issue.severity === "error"
                  ? "border-danger/30 bg-danger/5"
                  : "border-accent/30 bg-accent/5"
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="text-lg">
                  {issue.severity === "error" ? "❌" : "⚠️"}
                </span>
                <div>
                  <p
                    className={`text-sm font-medium ${
                      issue.severity === "error"
                        ? "text-danger"
                        : "text-accent-dark"
                    }`}
                  >
                    {issue.message}
                  </p>
                  {issue.severity === "error" && (
                    <p className="mt-0.5 text-xs text-ink-400">
                      يجب معالجة هذا قبل المتابعة.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
        <Button onClick={onNext} disabled={!preflight.can_close}>
          التالي →
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line p-3 text-center">
      <p className="text-xs text-ink-400">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}