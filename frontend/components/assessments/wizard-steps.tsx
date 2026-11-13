"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  addAssessmentQuestion,
  addAssessmentTarget,
  fetchReach,
  listAssessmentQuestions,
  listAssessmentTargets,
  removeAssessmentQuestion,
  removeAssessmentTarget,
  type TargetCreateInput,
} from "@/lib/api/assessments";
import { listGrades } from "@/lib/api/grades";
import { listGroups } from "@/lib/api/groups";
import { listQuestionBanks, listQuestions } from "@/lib/api/questions";
import { listStages } from "@/lib/api/stages";
import { listUsers } from "@/lib/api/users";
import type {
  AssessmentTargetLink,
  StaffAssessment,
  WizardBasicInfo,
  WizardSchedule,
  WizardSettings,
} from "@/types";
import { useState } from "react";

const TYPE_LABEL: Record<string, string> = {
  QUIZ: "اختبار قصير",
  PRACTICE: "تدريب",
  MONTHLY_EXAM: "امتحان شهري",
  MIDTERM: "نصف العام",
  HALF_YEAR_EXAM: "نصف العام",
  FINAL: "نهائي",
  END_OF_TERM: "نهاية الترم",
  END_OF_YEAR: "نهاية العام",
  MOCK_EXAM: "امتحان تجريبي",
  ASSIGNMENT: "واجب",
};

const TARGET_LABEL: Record<string, string> = {
  TENANT: "كل المؤسسة",
  STAGE: "مرحلة",
  GRADE: "صف",
  GROUP: "مجموعة",
  STUDENT: "طالب محدد",
};

// ============================================================================
// Step 1 — Basic info
// ============================================================================

export function Step1BasicInfo({ form }: { form: UseFormReturn<WizardBasicInfo> }) {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold font-display text-ink">الأساسيات</h2>
        <p className="mt-1 text-sm text-ink-400">
          العنوان ونوع الامتحان — الخطوة الأولى والأساسية.
        </p>
      </div>

      <Input
        label="العنوان"
        placeholder="مثال: امتحان نصف العام — الأحياء"
        error={errors.title?.message}
        {...register("title")}
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink-700">نوع الامتحان</label>
        <select
          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none border-line focus:border-ink"
          {...register("assessment_type")}
        >
          <option value="">اختر النوع...</option>
          {Object.entries(TYPE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        {errors.assessment_type && (
          <p className="text-xs text-danger">{errors.assessment_type.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink-700">الوصف (اختياري)</label>
        <textarea
          rows={3}
          placeholder="تعليمات أو ملاحظات للطلاب..."
          className="px-3 py-2 text-sm border rounded-lg outline-none border-line focus:border-ink"
          {...register("description")}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Step 2 — Questions
// ============================================================================

export function Step2Questions({ assessmentId }: { assessmentId: string }) {
  const [bankId, setBankId] = useState("");
  const queryClient = useQueryClient();

  const { data: links } = useQuery({
    queryKey: ["assessment-questions", assessmentId],
    queryFn: () => listAssessmentQuestions(assessmentId),
  });
  const { data: banks } = useQuery({ queryKey: ["question-banks"], queryFn: () => listQuestionBanks() });
  const { data: questions } = useQuery({ queryKey: ["questions", "all"], queryFn: () => listQuestions() });

  const questionMap = new Map((questions?.results ?? []).map((q) => [q.id, q]));
  const linkedIds = new Set((links?.results ?? []).map((l) => l.question));
  const nextOrder = Math.max(0, ...(links?.results ?? []).map((l) => l.order)) + 1;
  const totalPoints = (links?.results ?? []).reduce((sum, l) => {
    const q = questionMap.get(l.question);
    return sum + Number(l.points_override ?? q?.points ?? 0);
  }, 0);

  const approved = (questions?.results ?? []).filter(
    (q) =>
      q.review_status === "APPROVED" &&
      !linkedIds.has(q.id) &&
      (!bankId || q.bank === bankId)
  );

  const approvedTotal = (questions?.results ?? []).filter(
    (q) => q.review_status === "APPROVED"
  ).length;

  async function handleAdd(questionId: string) {
    await addAssessmentQuestion(assessmentId, questionId, nextOrder);
    queryClient.invalidateQueries({ queryKey: ["assessment-questions", assessmentId] });
  }

  async function handleRemove(linkId: string) {
    await removeAssessmentQuestion(linkId);
    queryClient.invalidateQueries({ queryKey: ["assessment-questions", assessmentId] });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold font-display text-ink">الأسئلة</h2>
          <p className="mt-1 text-sm text-ink-400">
            {links?.results.length ?? 0} سؤال · {totalPoints.toFixed(1)} نقطة إجمالًا
          </p>
        </div>
      </div>

      {(!links || links.results.length === 0) && (
        <div className="p-5 border rounded-lg border-accent/30 bg-accent/5">
          <p className="text-base font-bold font-display text-ink">
            لا توجد أسئلة بعد — تحتاج سؤالًا واحدًا على الأقل قبل النشر
          </p>
          <p className="mt-2 text-sm text-ink-700">
            الأسئلة تأتي من بنك أسئلة معتمد. لو عندك أسئلة معتمدة بالفعل، ستظهر أدناه
            مباشرة. لو لا، أضف سؤالًا من صفحة «الأسئلة» أولًا (سيمر بمرحلة مراجعة قبل
            الاعتماد).
          </p>
          {approvedTotal === 0 && (
            <div className="mt-3">
              <Link href="/questions">
                <Button variant="secondary">الذهاب لصفحة الأسئلة →</Button>
              </Link>
            </div>
          )}
        </div>
      )}

      {links && links.results.length > 0 && (
        <ol className="flex flex-col gap-2">
          {links.results
            .sort((a, b) => a.order - b.order)
            .map((link, idx) => {
              const q = questionMap.get(link.question);
              return (
                <li
                  key={link.id}
                  className="flex items-start gap-3 p-3 bg-white border rounded-lg border-line"
                >
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-ink">{q?.text ?? "—"}</p>
                    <p className="mt-1 text-xs text-ink-400">
                      {q?.question_type} · {link.points_override ?? q?.points} نقطة
                    </p>
                  </div>
                  <Button variant="ghost" onClick={() => handleRemove(link.id)}>
                    حذف
                  </Button>
                </li>
              );
            })}
        </ol>
      )}

      {approvedTotal > 0 && (
        <div className="p-4 border rounded-lg border-line">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm font-medium text-ink-700">+ إضافة سؤال</p>
            <select
              value={bankId}
              onChange={(e) => setBankId(e.target.value)}
              className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs"
            >
              <option value="">كل البنوك</option>
              {(banks?.results ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {approved.length === 0 ? (
            <p className="text-xs text-ink-400">
              {bankId
                ? "كل أسئلة هذا البنك مضافة بالفعل أو غير معتمدة."
                : "كل الأسئلة المعتمدة مضافة بالفعل."}
            </p>
          ) : (
            <div className="overflow-y-auto border rounded-lg max-h-64 border-line">
              {approved.map((q) => (
                <div
                  key={q.id}
                  className="flex items-start gap-3 p-3 border-b border-line last:border-0"
                >
                  <div className="flex-1">
                    <p className="text-sm line-clamp-2 text-ink">{q.text}</p>
                    <p className="mt-1 text-xs text-ink-400">
                      {q.question_type} · {q.points} نقطة
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => handleAdd(q.id)}>
                    + إضافة
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Step 3 — Targets
// ============================================================================

export function Step3Targets({ assessmentId }: { assessmentId: string }) {
  const [type, setType] = useState<AssessmentTargetLink["target_type"]>("GRADE");
  const [entityId, setEntityId] = useState("");
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  const { data: targets } = useQuery({
    queryKey: ["assessment-targets", assessmentId],
    queryFn: () => listAssessmentTargets(assessmentId),
  });
  const { data: reach } = useQuery({
    queryKey: ["assessment-reach", assessmentId],
    queryFn: () => fetchReach(assessmentId),
  });

  // Always fetch (we need these for optgroup labels anyway)
  //
  // C-10 NOTE: listStages/listGrades now accept an optional `{ page? }`
  // argument (added for ResourcePage's pagination). React Query always
  // passes its own context object to `queryFn`, not `{ page }` — so passing
  // the function reference directly fails TypeScript's function-arity check.
  // Wrap in an arrow that discards the context and calls with no args.
  const { data: stages } = useQuery({ queryKey: ["stages"], queryFn: () => listStages() });
  const { data: grades } = useQuery({ queryKey: ["grades"], queryFn: () => listGrades() });
  const { data: groups } = useQuery({ queryKey: ["groups"], queryFn: () => listGroups() });
  const { data: students } = useQuery({
    queryKey: ["users", "STUDENT"],
    queryFn: () => listUsers("STUDENT"),
  });

  const stageMap = new Map((stages?.results ?? []).map((s) => [s.id, s.name]));
  const gradeMap = new Map((grades?.results ?? []).map((g) => [g.id, g.name]));

  const gradesByStage = new Map<string, Array<{ id: string; name: string }>>();
  for (const g of grades?.results ?? []) {
    const key = stageMap.get(g.stage) ?? "غير محدد";
    if (!gradesByStage.has(key)) gradesByStage.set(key, []);
    gradesByStage.get(key)!.push({ id: g.id, name: g.name });
  }

  const groupsByGrade = new Map<string, Array<{ id: string; name: string }>>();
  for (const g of groups?.results ?? []) {
    const key = gradeMap.get(g.grade) ?? "غير محدد";
    if (!groupsByGrade.has(key)) groupsByGrade.set(key, []);
    groupsByGrade.get(key)!.push({ id: g.id, name: g.name });
  }

  const flatOptions =
    type === "STAGE"
      ? (stages?.results ?? []).map((s) => ({ id: s.id, label: s.name }))
      : type === "STUDENT"
      ? (students?.results ?? []).map((s) => ({
          id: s.id,
          label: [s.first_name, s.last_name].filter(Boolean).join(" ").trim() || s.email,
        }))
      : [];

  async function handleAdd() {
    setBusy(true);
    try {
      const payload: TargetCreateInput = { assessment: assessmentId, target_type: type };
      if (type === "STAGE") payload.stage = entityId;
      else if (type === "GRADE") payload.grade = entityId;
      else if (type === "GROUP") payload.group = entityId;
      else if (type === "STUDENT") payload.student = entityId;
      await addAssessmentTarget(payload);
      await queryClient.invalidateQueries({ queryKey: ["assessment-targets", assessmentId] });
      await queryClient.invalidateQueries({ queryKey: ["assessment-reach", assessmentId] });
      setEntityId("");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(linkId: string) {
    await removeAssessmentTarget(linkId);
    await queryClient.invalidateQueries({ queryKey: ["assessment-targets", assessmentId] });
    await queryClient.invalidateQueries({ queryKey: ["assessment-reach", assessmentId] });
  }

  const reachCount = reach?.students ?? 0;
  const hasTargets = (targets?.results.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold font-display text-ink">الفئات المستهدفة</h2>
        <p className="mt-1 text-sm text-ink-400">
          {targets?.results.length ?? 0} فئة
          {reachCount > 0 && (
            <>
              {" "}
              ·{" "}
              <span className="font-medium text-accent-dark">
                ~{reachCount} طالب سيظهر له الامتحان
              </span>
            </>
          )}
        </p>
      </div>

      {!hasTargets && (
        <div className="p-5 border rounded-lg border-accent/30 bg-accent/5">
          <p className="text-base font-bold font-display text-ink">
            لم تُحدّد فئة مستهدفة بعد
          </p>
          <p className="mt-2 text-sm text-ink-700">
            بدون فئة مستهدفة، لن يظهر الامتحان لأي طالب حتى لو نُشر. اختر صفًا أو مجموعة
            أو طالبًا محددًا أدناه.
          </p>
        </div>
      )}

      {hasTargets && (
        <ul className="flex flex-col gap-2">
          {targets!.results.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between p-3 bg-white border rounded-lg border-line"
            >
              <span className="text-sm text-ink-700">{TARGET_LABEL[t.target_type]}</span>
              <Button variant="ghost" onClick={() => handleRemove(t.id)}>
                حذف
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="p-4 border rounded-lg border-line">
        <p className="mb-3 text-sm font-medium text-ink-700">+ إضافة فئة</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-ink-400">النوع</label>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as AssessmentTargetLink["target_type"]);
                setEntityId("");
              }}
              className="px-3 py-2 text-sm bg-white border rounded-lg border-line"
            >
              <option value="TENANT">كل المؤسسة</option>
              <option value="STAGE">مرحلة</option>
              <option value="GRADE">صف</option>
              <option value="GROUP">مجموعة</option>
              <option value="STUDENT">طالب محدد</option>
            </select>
          </div>

          {type !== "TENANT" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-ink-400">العنصر</label>
              <select
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                className="min-w-[220px] rounded-lg border border-line bg-white px-3 py-2 text-sm"
              >
                <option value="">اختر...</option>

                {flatOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}

                {type === "GRADE" &&
                  Array.from(gradesByStage.entries()).map(([stageName, gradesList]) => (
                    <optgroup key={stageName} label={stageName}>
                      {gradesList.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}

                {type === "GROUP" &&
                  Array.from(groupsByGrade.entries()).map(([gradeName, groupsList]) => (
                    <optgroup key={gradeName} label={gradeName}>
                      {groupsList.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
              </select>
            </div>
          )}

          <Button
            onClick={handleAdd}
            disabled={busy || (type !== "TENANT" && !entityId)}
            variant="secondary"
          >
            {busy ? "..." : "+ إضافة"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Step 4 — Schedule
// ============================================================================

export function Step4Schedule({ form }: { form: UseFormReturn<WizardSchedule> }) {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold font-display text-ink">الجدولة</h2>
        <p className="mt-1 text-sm text-ink-400">
          متى يُفتح الامتحان ومتى يُغلق. كل الحقول اختيارية.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink-700">وقت البدء</label>
          <input
            type="datetime-local"
            className="px-3 py-2 text-sm border rounded-lg outline-none border-line focus:border-ink"
            {...register("starts_at")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink-700">وقت الانتهاء</label>
          <input
            type="datetime-local"
            className="px-3 py-2 text-sm border rounded-lg outline-none border-line focus:border-ink"
            {...register("ends_at")}
          />
          {errors.ends_at && (
            <p className="text-xs text-danger">{errors.ends_at.message}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink-700">
          مدة الامتحان (بالدقائق)
        </label>
        <input
          type="number"
          min={1}
          placeholder="اتركه فارغًا إن لم يكن هناك حد زمني"
          className="px-3 py-2 text-sm border rounded-lg outline-none border-line focus:border-ink"
          {...register("duration_minutes")}
        />
        <p className="text-xs text-ink-400">
          عند التفعيل، يُغلق الامتحان تلقائيًا للطالب بانتهاء المدة أو عند وقت الانتهاء — أيهما أقرب.
        </p>
      </div>

      {/* S-05 FIX (Milestone 1, Batch 4): expose late_entry_minutes and
          entry_cutoff_minutes in the wizard. Both were fully implemented
          in the backend (Assessment model) and shown to students via
          StudentAssessmentCard, but teachers had no UI to set them. */}
      <div className="p-4 border rounded-lg border-line bg-paper-muted/20">
        <h3 className="mb-1 text-sm font-bold font-display text-ink">
          سياسة الدخول المتأخر
        </h3>
        <p className="mb-3 text-xs text-ink-400">
          تحكم في متى يمكن للطالب البدء. اتركها فارغة للسلوك الافتراضي (يمكن البدء أي وقت داخل النافذة).
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-700">
              مهلة الدخول المتأخر (دقائق)
            </label>
            <input
              type="number"
              min={0}
              placeholder="مثال: 30"
              className="px-3 py-2 text-sm bg-white border rounded-lg outline-none border-line focus:border-ink"
              {...register("late_entry_minutes")}
            />
            <p className="text-[11px] text-ink-400">
              بعد هذا الوقت من بداية النافذة، لا يمكن للطالب البدء.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-700">
              الحد الأدنى للوقت المتبقي (دقائق)
            </label>
            <input
              type="number"
              min={0}
              placeholder="مثال: 10"
              className="px-3 py-2 text-sm bg-white border rounded-lg outline-none border-line focus:border-ink"
              {...register("entry_cutoff_minutes")}
            />
            <p className="text-[11px] text-ink-400">
              الطالب يجب أن يبدأ ولهذا العدد من الدقائق على الأقل قبل إغلاق الامتحان.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Step 5 — Settings
// ============================================================================

export function Step5Settings({ form }: { form: UseFormReturn<WizardSettings> }) {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold font-display text-ink">الإعدادات</h2>
        <p className="mt-1 text-sm text-ink-400">
          عدد المحاولات، درجة النجاح، خيارات العشوائية.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink-700">عدد المحاولات</label>
          <input
            type="number"
            min={1}
            className="px-3 py-2 text-sm border rounded-lg outline-none border-line focus:border-ink"
            {...register("max_attempts")}
          />
          <p className="text-xs text-ink-400">
            كم مرة يستطيع الطالب الدخول لهذا الامتحان.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink-700">درجة النجاح (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            placeholder="اختياري — اترك فارغًا للتصحيح بدون pass/fail"
            className="px-3 py-2 text-sm border rounded-lg outline-none border-line focus:border-ink"
            {...register("passing_score")}
          />
          {errors.passing_score && (
            <p className="text-xs text-danger">{errors.passing_score.message}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink-700">عدد الأسئلة (اختياري)</label>
        <input
          type="number"
          min={1}
          placeholder="اتركه فارغًا لعرض كل الأسئلة المضافة"
          className="px-3 py-2 text-sm border rounded-lg outline-none border-line focus:border-ink"
          {...register("question_count")}
        />
        <p className="text-xs text-ink-400">
          إذا حُدِّد أقل من عدد الأسئلة المضافة، يُختار عشوائيًا عند كل محاولة.
        </p>
      </div>

      <div className="flex flex-col gap-3 p-4 border rounded-lg border-line">
        <label className="flex items-center gap-3 text-sm text-ink-700">
          <input type="checkbox" {...register("randomize_question_order")} />
          خلط ترتيب الأسئلة لكل طالب
        </label>
        <label className="flex items-center gap-3 text-sm text-ink-700">
          <input type="checkbox" {...register("randomize_option_order")} />
          خلط ترتيب الاختيارات داخل كل سؤال
        </label>
      </div>
    </div>
  );
}

// ============================================================================
// Step 6 — Review
// ============================================================================

export function Step6Review({
  assessment,
  questionsCount,
  targetsCount,
  reachCount,
}: {
  assessment: StaffAssessment;
  questionsCount: number;
  targetsCount: number;
  reachCount: number;
}) {
  const checks = [
    { label: "سؤال واحد على الأقل", ok: questionsCount > 0, detail: `${questionsCount} سؤال` },
    {
      label: "فئة مستهدفة واحدة على الأقل",
      ok: targetsCount > 0,
      detail: `${targetsCount} فئة`,
    },
    { label: "طلاب سيصلهم الامتحان", ok: reachCount > 0, detail: `~${reachCount} طالب` },
  ];
  const allOk = checks.every((c) => c.ok);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold font-display text-ink">المراجعة والنشر</h2>
        <p className="mt-1 text-sm text-ink-400">
          راجع كل شيء قبل النشر. بعد النشر، لا يمكن تعديل الأسئلة أو الفئات.
        </p>
      </div>

      <div className="p-4 border rounded-lg border-line bg-ink-50/50">
        <p className="text-base font-bold font-display text-ink">{assessment.title}</p>
        <p className="mt-1 text-xs text-ink-400">
          {TYPE_LABEL[assessment.assessment_type] ?? assessment.assessment_type}
        </p>
        {assessment.description && (
          <p className="mt-3 text-sm text-ink-700">{assessment.description}</p>
        )}
        <div className="flex flex-wrap gap-4 mt-4 text-xs text-ink-400">
          {assessment.duration_minutes && <span>⏱ {assessment.duration_minutes} دقيقة</span>}
          <span>🔄 {assessment.max_attempts} محاولة</span>
          {assessment.passing_score && <span>🎯 النجاح: {assessment.passing_score}%</span>}
          {assessment.randomize_question_order && <span>🔀 خلط الأسئلة</span>}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-ink-700">جاهزية النشر</p>
        {checks.map((c, i) => (
          <div
            key={i}
            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
              c.ok
                ? "border-success/30 bg-success/5 text-ink-700"
                : "border-danger/30 bg-danger/5 text-ink-700"
            }`}
          >
            <span className="flex items-center gap-2">
              <span className={c.ok ? "text-success" : "text-danger"}>
                {c.ok ? "✓" : "✗"}
              </span>
              {c.label}
            </span>
            <span className="text-xs text-ink-400">{c.detail}</span>
          </div>
        ))}
      </div>

      {!allOk && (
        <div className="p-3 text-sm border rounded-lg border-accent/30 bg-accent/10 text-ink-700">
          أكمل العناصر الناقصة أعلاه لتفعيل زر النشر.
        </div>
      )}
    </div>
  );
}