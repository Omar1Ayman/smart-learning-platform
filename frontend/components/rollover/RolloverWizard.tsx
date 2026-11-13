"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorState, Spinner } from "@/components/ui/States";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import { toastError } from "@/lib/utils/toast";
import {
  getRolloverProgressKey,
  readRolloverProgress,
  updateRolloverProgress,
  type RolloverStep,
} from "@/lib/rollover/progress";
import { Step3ActivateYear } from "./Step3ActivateYear";
import type {
  AcademicYear,
  PrepareNextYearInput,
  PrepareNextYearResponse,
} from "@/types";
import { Step1Preflight } from "./Step1Preflight";
import { Step2NewYearInfo } from "./Step2NewYearInfo";
import { Step3StudentDecisions } from "./Step3StudentDecisions";
import { Step4Archive } from "./Step4Archive";

type Step = RolloverStep;

interface RolloverWizardProps {
  yearId: string;
}

export function RolloverWizard({ yearId }: RolloverWizardProps) {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  return (
    <RolloverWizardSession
      key={`${userId ?? "anonymous"}:${yearId}`}
      yearId={yearId}
      userId={userId}
    />
  );
}

function RolloverWizardSession({
  yearId,
  userId,
}: RolloverWizardProps & { userId: string | null }) {
  const router = useRouter();
  const storageKey = userId
    ? getRolloverProgressKey(userId, yearId)
    : null;
  const [step, setStep] = useState<Step>(1);
  const [preparedYear, setPreparedYear] =
    useState<PrepareNextYearResponse | null>(null);
  const [prepareInput, setPrepareInput] =
    useState<PrepareNextYearInput | null>(null);
  const [promotedCount, setPromotedCount] = useState<number | null>(null);
  const [restoredKey, setRestoredKey] = useState<string | null>(null);
  const storageErrorReported = useRef(false);
  const progressRestored = !storageKey || restoredKey === storageKey;

  const { data: year, isLoading, isError, refetch } = useQuery({
    queryKey: ["academic-year", yearId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/academic-years/${yearId}/`);
      return data as AcademicYear;
    },
  });
  const activeStep: Step = year?.status === "ARCHIVED" ? 6 : step;

  useEffect(() => {
    if (!storageKey) return;
    const result = readRolloverProgress(storageKey, yearId);
    if (result.failed && !storageErrorReported.current) {
      storageErrorReported.current = true;
      toastError(
        new Error("تعذّر استعادة تقدم إغلاق السنة من هذا الجهاز."),
        "قد تحتاج إلى إعادة إدخال بعض البيانات."
      );
    }
    if (result.progress) {
      // The loading gate keeps default state out of view until restoration finishes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep(result.progress.step);
      setPreparedYear(result.progress.preparedYear);
      setPrepareInput(result.progress.prepareInput);
      setPromotedCount(result.progress.promotedCount);
    }
    setRestoredKey(storageKey);
  }, [storageKey, yearId]);

  useEffect(() => {
    if (!storageKey || !progressRestored) return;
    if (!updateRolloverProgress(storageKey, yearId, {
      step: activeStep,
      preparedYear,
      prepareInput,
      promotedCount,
    })) {
      if (!storageErrorReported.current) {
        storageErrorReported.current = true;
        toastError(
          new Error("تعذّر حفظ تقدم إغلاق السنة على هذا الجهاز."),
          "يمكنك المتابعة، لكن لا تغلق الصفحة قبل إكمال العملية."
        );
      }
    }
  }, [
    activeStep,
    prepareInput,
    preparedYear,
    promotedCount,
    progressRestored,
    storageKey,
    yearId,
  ]);

  if (!progressRestored) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-4">
        <Spinner />
        <p className="text-sm text-ink-500">جارٍ استعادة تقدم إغلاق السنة...</p>
        <Button
          variant="ghost"
          onClick={() => router.push("/academic-years")}
        >
          ← العودة إلى السنوات الدراسية
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-4">
        <Spinner />
        <Button
          variant="ghost"
          onClick={() => router.push("/academic-years")}
        >
          ← العودة إلى السنوات الدراسية
        </Button>
      </div>
    );
  }
  if (isError || !year) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <ErrorState
          message="تعذّر تحميل السنة الدراسية."
          onRetry={() => {
            void refetch();
          }}
        />
        <Button
          variant="ghost"
          onClick={() => router.push("/academic-years")}
          className="self-start"
        >
          ← العودة إلى السنوات الدراسية
        </Button>
      </div>
    );
  }

  const steps = [
    { n: 1, label: "الجاهزية" },
    { n: 2, label: "إعداد السنة" },
    { n: 3, label: "تفعيلها" },
    { n: 4, label: "قرارات الطلاب" },
    { n: 5, label: "الأرشفة" },
    { n: 6, label: "الإنهاء" },
  ];
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            إغلاق السنة الدراسية: {year.name}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            6 خطوات: فحص الجاهزية، إعداد السنة الجديدة وتفعيلها، مراجعة قرارات
            الطلاب، ثم أرشفة السنة القديمة.
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() => router.push("/academic-years")}
          className="self-start"
        >
          ← العودة إلى السنوات الدراسية
        </Button>
      </div>

      {/* Step indicator */}
      <div className="card p-4">
        <div className="flex items-center justify-between gap-1">
          {steps.map((s, i) => {
            const isActive = s.n === activeStep;
            const isComplete = s.n < activeStep;
            return (
              <div key={s.n} className="flex flex-1 items-center gap-1">
                <div className="flex flex-col items-center gap-1">
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      isActive
                        ? "bg-ink text-white dark:bg-accent dark:text-[#111827]"
                        : isComplete
                        ? "bg-success/20 text-success"
                        : "bg-ink-50 text-ink-400"
                    }`}
                  >
                    {isComplete ? "✓" : s.n}
                  </span>
                  <span
                    className={`hidden text-xs sm:block ${
                      isActive ? "font-medium text-ink" : "text-ink-400"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 ${
                      isComplete ? "bg-success/30" : "bg-line"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="card p-6">
        {activeStep === 1 && (
          <Step1Preflight year={year} onNext={() => setStep(2)} />
        )}

        {activeStep === 2 && (
          <Step2NewYearInfo
            year={year}
            storageKey={storageKey}
            savedInput={prepareInput}
            onPrepared={(result) => {
              setPreparedYear(result);
              setStep(3);
            }}
            onSkip={() => {
              setStep(5);
            }}
            onBack={() => setStep(1)}
          />
        )}

        {activeStep === 3 && preparedYear && (
          <Step3ActivateYear
            sourceYear={year}
            preparedYear={preparedYear}
            onActivated={() => setStep(4)}
          />
        )}

        {activeStep === 4 && preparedYear && (
          <Step3StudentDecisions
            year={year}
            newYearId={preparedYear.new_year_id}
            onPromoted={(result) => {
              setPromotedCount(result);
              setStep(5);
            }}
            onSkip={() => setStep(5)}
            storageKey={storageKey}
          />
        )}

        {activeStep === 5 && (
          <Step4Archive
            year={year}
            preparedYear={preparedYear}
            promotedCount={promotedCount}
            onArchived={() => setStep(6)}
          />
        )}

        {activeStep === 6 && (
          <Step5Done
            year={year}
            preparedYear={preparedYear}
            promotedCount={promotedCount}
            router={router}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 (inline — small enough)
// ─────────────────────────────────────────────────────────────────────────────

function Step5Done({
  year,
  preparedYear,
  promotedCount,
  router,
}: {
  year: AcademicYear;
  preparedYear: PrepareNextYearResponse | null;
  promotedCount: number | null;
  router: ReturnType<typeof useRouter>;
}) {
  const prepared = preparedYear != null;

  return (
    <div className="flex flex-col items-center gap-5 py-8 text-center">
      <div className="text-6xl">🎉</div>
      <div>
        <h2 className="text-xl font-bold font-display text-ink">
          تم إغلاق السنة الدراسية
        </h2>
        <p className="mt-2 max-w-md text-sm text-ink-400">
          تمت أرشفة <strong>{year.name}</strong> بنجاح
          {prepared && (
            <>
              {" "}
              وإنشاء السنة الجديدة <strong>{preparedYear!.new_year_name}</strong>{" "}
              (نشطة الآن)
            </>
          )}
          .
        </p>
      </div>

      {promotedCount !== null && promotedCount > 0 && (
        <div className="rounded-lg border border-success/30 bg-success/5 px-6 py-3 text-sm text-success">
          ✅ تمت ترقية {promotedCount} طالبًا
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => router.push("/academic-years")}>
          العودة للسنوات الدراسية
        </Button>
        {prepared && (
          <Button
            variant="secondary"
            onClick={() => router.push("/dashboard")}
          >
            الانتقال للوحة التحكم
          </Button>
        )}
      </div>
    </div>
  );
}