"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { ErrorState, Spinner } from "@/components/ui/States";
import {
  createAssessment,
  fetchReach,
  getStaffAssessment,
  listAssessmentQuestions,
  listAssessmentTargets,
  publishAssessment,
  updateAssessment,
} from "@/lib/api/assessments";
import type { WizardBasicInfo, WizardSchedule, WizardSettings, WizardStep } from "@/types";
import {
  Step1BasicInfo,
  Step2Questions,
  Step3Targets,
  Step4Schedule,
  Step5Settings,
  Step6Review,
} from "./wizard-steps";

const STEPS: { n: WizardStep; label: string }[] = [
  { n: 1, label: "الأساسيات" },
  { n: 2, label: "الأسئلة" },
  { n: 3, label: "الفئات" },
  { n: 4, label: "الجدولة" },
  { n: 5, label: "الإعدادات" },
  { n: 6, label: "المراجعة" },
];

const basicSchema = z.object({
  title: z.string().min(2, "العنوان قصير جدًا").max(255),
  assessment_type: z.string().min(1, "اختر نوع الامتحان"),
  description: z.string(),
});

const scheduleSchema = z
  .object({
    starts_at: z.string(),
    ends_at: z.string(),
    duration_minutes: z.string(),
    // S-05: entry-window policy fields.
    late_entry_minutes: z.string(),
    entry_cutoff_minutes: z.string(),
  })
  .refine(
    (d) => !d.starts_at || !d.ends_at || new Date(d.ends_at) > new Date(d.starts_at),
    { message: "وقت الانتهاء يجب أن يكون بعد وقت البدء", path: ["ends_at"] }
  );

const settingsSchema = z.object({
  max_attempts: z.string(),
  passing_score: z.string(),
  randomize_question_order: z.boolean(),
  randomize_option_order: z.boolean(),
  question_count: z.string(),
});

function toIso(dt: string): string | null {
  if (!dt) return null;
  try {
    return new Date(dt).toISOString();
  } catch {
    return null;
  }
}

function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function AssessmentWizard({ assessmentId }: { assessmentId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const step = (parseInt(searchParams.get("step") || "1", 10) || 1) as WizardStep;

  const [stepError, setStepError] = useState<string | null>(null);

  const {
    data: assessment,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["staff-assessment", assessmentId],
    queryFn: () => getStaffAssessment(assessmentId!),
    enabled: !!assessmentId,
  });

  const { data: links } = useQuery({
    queryKey: ["assessment-questions", assessmentId],
    queryFn: () => listAssessmentQuestions(assessmentId!),
    enabled: !!assessmentId,
  });
  const { data: targets } = useQuery({
    queryKey: ["assessment-targets", assessmentId],
    queryFn: () => listAssessmentTargets(assessmentId!),
    enabled: !!assessmentId,
  });
  const { data: reach } = useQuery({
    queryKey: ["assessment-reach", assessmentId],
    queryFn: () => fetchReach(assessmentId!),
    enabled: !!assessmentId,
  });

  const basicForm = useForm<WizardBasicInfo>({
    resolver: zodResolver(basicSchema),
    defaultValues: { title: "", assessment_type: "", description: "" },
  });
  const scheduleForm = useForm<WizardSchedule>({
  resolver: zodResolver(scheduleSchema),
  defaultValues: {
    starts_at: "",
    ends_at: "",
    duration_minutes: "",
    late_entry_minutes: "",
    entry_cutoff_minutes: "",
  },
});
  const settingsForm = useForm<WizardSettings>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      max_attempts: "1",
      passing_score: "",
      question_count: "",
      randomize_question_order: false,
      randomize_option_order: false,
    },
  });

  useEffect(() => {
    if (!assessment) return;
    basicForm.reset({
      title: assessment.title,
      assessment_type: assessment.assessment_type,
      description: assessment.description || "",
    });
        scheduleForm.reset({
      starts_at: toDateTimeLocal(assessment.starts_at),
      ends_at: toDateTimeLocal(assessment.ends_at),
      duration_minutes: assessment.duration_minutes?.toString() ?? "",
      late_entry_minutes: assessment.late_entry_minutes?.toString() ?? "",
      entry_cutoff_minutes: assessment.entry_cutoff_minutes?.toString() ?? "",
    });
    settingsForm.reset({
      max_attempts: assessment.max_attempts.toString(),
      passing_score: assessment.passing_score ?? "",
      question_count: assessment.question_count?.toString() ?? "",
      randomize_question_order: assessment.randomize_question_order,
      randomize_option_order: assessment.randomize_option_order,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment?.id]);

  const createMutation = useMutation({
    mutationFn: (data: WizardBasicInfo) =>
      createAssessment({
        title: data.title,
        assessment_type: data.assessment_type,
        description: data.description,
      }),
    onSuccess: (a) => router.replace(`/assessments/${a.id}/edit?step=2`),
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { error?: { detail?: unknown } } } })
        ?.response?.data?.error?.detail;
      setStepError(
        typeof detail === "string" ? detail : "تعذّر إنشاء الامتحان. تحقق من البيانات."
      );
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => publishAssessment(assessmentId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-assessments"] });
      router.push("/assessments");
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { error?: { detail?: unknown } } } })
        ?.response?.data?.error?.detail;
      setStepError(
        typeof detail === "string"
          ? detail
          : typeof detail === "object" && detail !== null
          ? Object.values(detail as Record<string, string>).join(" · ")
          : "تعذّر النشر."
      );
    },
  });

  const isDraft = assessment?.status === "DRAFT";

  const stepIncomplete =
    (step === 2 && (links?.results.length ?? 0) < 1) ||
    (step === 3 && (targets?.results.length ?? 0) < 1);

  const canPublish =
    (links?.results.length ?? 0) > 0 &&
    (targets?.results.length ?? 0) > 0 &&
    (reach?.students ?? 0) > 0;

  // FIX: goToStep(1) now works even when assessmentId is missing.
  // Previously: `if (!assessmentId) return;` would return before
  // router.push, so clicking "السابق" from step 2/3/... on a broken URL
  // (lost id) did nothing. Now step 1 always navigates to /assessments/new.
  function goToStep(n: WizardStep) {
    if (n === 1) {
      if (assessmentId) {
        router.push(`/assessments/${assessmentId}/edit?step=1`);
      } else {
        router.push("/assessments/new");
      }
      return;
    }
    if (!assessmentId) {
      setStepError("أكمل الخطوة الأولى أولًا لإنشاء الامتحان.");
      router.push("/assessments/new");
      return;
    }
    router.push(`/assessments/${assessmentId}/edit?step=${n}`);
  }

  async function handleNext() {
    setStepError(null);

    if (step > 1 && !assessmentId) {
      setStepError("أكمل الخطوة الأولى أولًا لإنشاء الامتحان.");
      goToStep(1);
      return;
    }

    try {
      if (step === 1) {
        const valid = await basicForm.trigger();
        if (!valid) return;
        const data = basicForm.getValues();
        if (!assessmentId) {
          createMutation.mutate(data);
          return;
        }
        await updateAssessment(assessmentId, {
          title: data.title,
          assessment_type: data.assessment_type,
          description: data.description,
        });
        await queryClient.invalidateQueries({ queryKey: ["staff-assessment", assessmentId] });
        router.push(`/assessments/${assessmentId}/edit?step=2`);
        return;
      }
      if (step === 2) {
        router.push(`/assessments/${assessmentId}/edit?step=3`);
        return;
      }
      if (step === 3) {
        router.push(`/assessments/${assessmentId}/edit?step=4`);
        return;
      }
            if (step === 4) {
        const valid = await scheduleForm.trigger();
        if (!valid) return;
        const v = scheduleForm.getValues();
        await updateAssessment(assessmentId!, {
          starts_at: toIso(v.starts_at),
          ends_at: toIso(v.ends_at),
          duration_minutes: v.duration_minutes ? parseInt(v.duration_minutes, 10) : null,
          // S-05: persist the entry-window policy.
          late_entry_minutes: v.late_entry_minutes
            ? parseInt(v.late_entry_minutes, 10)
            : null,
          entry_cutoff_minutes: v.entry_cutoff_minutes
            ? parseInt(v.entry_cutoff_minutes, 10)
            : 0, // backend default is 0
        });
        await queryClient.invalidateQueries({ queryKey: ["staff-assessment", assessmentId] });
        router.push(`/assessments/${assessmentId}/edit?step=5`);
        return;
      }
      if (step === 5) {
        const valid = await settingsForm.trigger();
        if (!valid) return;
        const v = settingsForm.getValues();
        await updateAssessment(assessmentId!, {
          max_attempts: parseInt(v.max_attempts, 10) || 1,
          passing_score: v.passing_score || null,
          question_count: v.question_count ? parseInt(v.question_count, 10) : null,
          randomize_question_order: v.randomize_question_order,
          randomize_option_order: v.randomize_option_order,
        });
        await queryClient.invalidateQueries({ queryKey: ["staff-assessment", assessmentId] });
        router.push(`/assessments/${assessmentId}/edit?step=6`);
        return;
      }
    } catch {
      setStepError("تعذّر حفظ البيانات. تحقق من الاتصال وحاول مرة أخرى.");
    }
  }

  const nextDisabled = (step === 1 && createMutation.isPending) || step === 6;

  const stepComplete = (n: WizardStep): boolean => {
    if (n === 1) return !!assessment?.title;
    if (n === 2) return (links?.results.length ?? 0) > 0;
    if (n === 3) return (targets?.results.length ?? 0) > 0;
    if (n === 4) return true;
    if (n === 5) return true;
    if (n === 6) return canPublish;
    return false;
  };

  const stepRequirements: Record<WizardStep, string> = {
    1: "أكمل العنوان ونوع الامتحان",
    2: "أضف سؤالًا واحدًا على الأقل",
    3: "أضف فئة مستهدفة واحدة على الأقل",
    4: "",
    5: "",
    6: "",
  };

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorState message="تعذّر تحميل الامتحان." />;

  return (
    <div className="flex flex-col max-w-3xl gap-6 mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => router.push("/assessments")}
            className="text-sm text-ink-400 hover:text-ink"
          >
            ← الامتحانات
          </button>
          <h1 className="mt-1 text-2xl font-bold font-display text-ink">
            {assessmentId ? assessment?.title ?? "..." : "امتحان جديد"}
          </h1>
          {assessment && (
            <span className="mt-1 inline-block rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-ink-700">
              {assessment.status === "DRAFT"
                ? "مسودة"
                : assessment.status === "PUBLISHED"
                ? "منشور"
                : assessment.status}
            </span>
          )}
        </div>
      </div>

      <div className="p-4 card">
        <div className="flex items-center justify-between gap-1">
          {STEPS.map((s, i) => {
            const isActive = s.n === step;
            const isComplete = stepComplete(s.n);
            const isClickable = !!assessmentId || s.n === 1;
            return (
              <div key={s.n} className="flex items-center flex-1 gap-1">
                <button
                  onClick={() => isClickable && goToStep(s.n)}
                  disabled={!isClickable}
                  className={`flex flex-col items-center gap-1 ${
                    isClickable ? "cursor-pointer" : "cursor-not-allowed"
                  }`}
                >
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                      isActive
                        ? "bg-ink text-white dark:bg-accent dark:text-[#111827]"
                        : isComplete
                        ? "bg-success/20 text-success"
                        : "bg-ink-50 text-ink-400"
                    }`}
                  >
                    {isComplete && !isActive ? "✓" : s.n}
                  </span>
                  <span
                    className={`hidden text-xs sm:block ${
                      isActive ? "font-medium text-ink" : "text-ink-400"
                    }`}
                  >
                    {s.label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`h-0.5 flex-1 ${isComplete ? "bg-success/30" : "bg-line"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-6 card">
        {step === 1 && <Step1BasicInfo form={basicForm} />}
        {step === 2 && assessmentId && <Step2Questions assessmentId={assessmentId} />}
        {step === 3 && assessmentId && <Step3Targets assessmentId={assessmentId} />}
        {step === 4 && <Step4Schedule form={scheduleForm} />}
        {step === 5 && <Step5Settings form={settingsForm} />}
        {step === 6 && assessment && (
          <Step6Review
            assessment={assessment}
            questionsCount={links?.results.length ?? 0}
            targetsCount={targets?.results.length ?? 0}
            reachCount={reach?.students ?? 0}
          />
        )}
        {step !== 1 && !assessmentId && (
          <div className="p-4 text-sm border rounded-lg border-danger/30 bg-danger/5 text-danger">
            ⚠️ لا يمكن عرض هذه الخطوة قبل إنشاء الامتحان. عُد للخطوة الأولى.
          </div>
        )}
      </div>

      {stepError && (
        <div className="p-3 text-sm border rounded-lg border-danger/30 bg-danger/5 text-danger">
          {stepError}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {stepIncomplete && (
          <div className="px-3 py-2 text-xs border rounded-lg border-accent/30 bg-accent/5 text-ink-700">
            ⚠️ يمكنك المتابعة الآن، لكن <strong>لن تتمكن من النشر</strong> قبل:{" "}
            {stepRequirements[step]}
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <Button
            variant="ghost"
            onClick={() =>
              step === 1 ? router.push("/assessments") : goToStep((step - 1) as WizardStep)
            }
          >
            {step === 1 ? "إلغاء" : "← السابق"}
          </Button>

          {step < 6 && (
            <Button onClick={handleNext} disabled={nextDisabled}>
              {createMutation.isPending ? "جارٍ الإنشاء..." : "التالي →"}
            </Button>
          )}

          {step === 6 && isDraft && (
            <Button
              onClick={() => publishMutation.mutate()}
              disabled={publishMutation.isPending || !canPublish}
              title={
                !canPublish
                  ? "أضف سؤالًا واحدًا على الأقل وفئة مستهدفة تصل لطالب واحد على الأقل"
                  : undefined
              }
            >
              {publishMutation.isPending ? "جارٍ النشر..." : "نشر الامتحان"}
            </Button>
          )}

          {step === 6 && !isDraft && (
            <Button variant="secondary" disabled>
              الامتحان منشور
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}