"use client";

import Link from "next/link";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { Button } from "@/components/ui/Button";
import { statusBadgeClass, statusLabel } from "@/lib/api/assessments";
import type { StaffAssessment } from "@/types";

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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ar-EG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface AssessmentCardProps {
  assessment: StaffAssessment;
  actions: ActionMenuItem[];
}

export function AssessmentCard({ assessment, actions }: AssessmentCardProps) {
  const targets = assessment.targets_summary ?? [];
  const questionsCount = assessment.questions_count ?? 0;
  const attemptsCount = assessment.attempts_count ?? 0;
  const submissionsCount = assessment.submissions_count ?? 0;

  const hasSchedule = !!(assessment.starts_at || assessment.ends_at);
  const isDraft = assessment.status === "DRAFT";

  return (
    <div className="card flex flex-col gap-4 p-5">
      {/* Header: title + type + status + actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-bold text-ink">
            {assessment.title}
          </h3>
          <p className="mt-1 text-xs text-ink-400">
            {TYPE_LABEL[assessment.assessment_type] ??
              assessment.assessment_type}
            {assessment.created_by_email && (
              <>
                {" "}
                · بواسطة {assessment.created_by_email.split("@")[0]}
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass(
              assessment.status
            )}`}
          >
            {statusLabel(assessment.status)}
          </span>
          {actions.length > 0 && <ActionMenu items={actions} />}
        </div>
      </div>

      {/* Description */}
      {assessment.description && (
        <p className="line-clamp-2 text-sm text-ink-700">
          {assessment.description}
        </p>
      )}

      {/* Targeting */}
      <div className="flex flex-col gap-1.5 rounded-lg bg-paper-muted/40 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-ink-400">
          🎯 الفئة المستهدفة
        </p>
        {targets.length === 0 ? (
          <p className="text-xs text-danger">
            ⚠️ لا يوجد فئة مستهدفة — لن يظهر الامتحان لأي طالب
          </p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {targets.map((t, i) => (
              <span
                key={i}
                className="rounded-full bg-info/10 px-2 py-0.5 text-[11px] font-medium text-info"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Schedule */}
      {hasSchedule && (
        <div className="flex flex-col gap-1.5 rounded-lg bg-accent/5 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-ink-400">
            📅 الجدول الزمني
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-700">
            {assessment.starts_at && (
              <span>
                <span className="text-ink-400">يبدأ: </span>
                {formatDateTime(assessment.starts_at)}
              </span>
            )}
            {assessment.ends_at && (
              <span>
                <span className="text-ink-400">ينتهي: </span>
                {formatDateTime(assessment.ends_at)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-line p-2">
          <p className="text-[10px] text-ink-400">الأسئلة</p>
          <p className="mt-0.5 font-display text-lg font-bold text-ink">
            {questionsCount}
          </p>
        </div>
        <div className="rounded-lg border border-line p-2">
          <p className="text-[10px] text-ink-400">المحاولات</p>
          <p className="mt-0.5 font-display text-lg font-bold text-ink">
            {attemptsCount}
          </p>
        </div>
        <div className="rounded-lg border border-line p-2">
          <p className="text-[10px] text-ink-400">المسلَّمة</p>
          <p
            className={`mt-0.5 font-display text-lg font-bold ${
              submissionsCount > 0 ? "text-success" : "text-ink-400"
            }`}
          >
            {submissionsCount}
          </p>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-3 text-xs text-ink-400">
        {assessment.duration_minutes && (
          <span>⏱ {assessment.duration_minutes} دقيقة</span>
        )}
        <span>🔄 {assessment.max_attempts} محاولة</span>
        {assessment.passing_score && (
          <span>🎯 {assessment.passing_score}%</span>
        )}
        {assessment.randomize_question_order && <span>🔀 خلط</span>}
        <span className="text-ink-300">
          أُنشئ: {formatDate(assessment.created_at)}
        </span>
      </div>

      {/* CTAs */}
      <div className="flex gap-2 border-t border-line pt-3">
        <Link href={`/assessments/${assessment.id}/edit`} className="flex-1">
          <Button variant="secondary" className="w-full">
            {isDraft ? "متابعة التحرير" : "عرض"}
          </Button>
        </Link>
        {assessment.status === "PUBLISHED" && (
          <Link
            href={`/assessments/${assessment.id}/results`}
            className="flex-1"
          >
            <Button variant="ghost" className="w-full">
              النتائج
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}