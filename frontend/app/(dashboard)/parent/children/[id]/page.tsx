"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";
import { PageShell } from "@/components/ui/PageShell";
import {
  ATTENDANCE_STATUS_LABEL,
  ATTENDANCE_STATUS_STYLE,
  RELATIONSHIP_LABEL,
  getMyChild,
} from "@/lib/api/parent";
import type { ParentChildRecentAttendance, ParentChildRecentAttempt } from "@/types";

export default function ParentChildDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const q = useQuery({
    queryKey: ["parent", "child", id],
    queryFn: () => getMyChild(id),
  });

  if (q.isLoading) {
    return (
      <PageShell title="جارٍ التحميل..." isLoading loadingVariant="cards">
        {null}
      </PageShell>
    );
  }

  if (q.isError || !q.data) {
    return (
      <PageShell
        title="تعذّر تحميل بيانات الطالب"
        isError
        errorMessage="قد يكون الطالب غير مرتبط بحسابك أو حدثت مشكلة في الاتصال."
        onRetry={() => q.refetch()}
        isEmpty={false}
        isLoading={false}
      >
        {null}
      </PageShell>
    );
  }

  const child = q.data;
  const fullName =
    [child.first_name, child.last_name].filter(Boolean).join(" ") || child.email;

  return (
    <div className="flex flex-col gap-6">
      {/* Back link */}
      <Link
        href="/parent"
        className="text-sm text-ink-400 hover:text-ink"
      >
        ← أبنائي
      </Link>

      {/* Hero card */}
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-l from-accent/10 to-transparent px-6 py-5">
          <div className="flex flex-wrap items-start gap-4">
            <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-ink text-2xl font-bold text-white">
              {child.first_name?.[0]?.toUpperCase() ||
                child.email[0]?.toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl font-bold text-ink">
                {fullName}
              </h1>
              <p className="mt-1 text-sm text-ink-400">{child.email}</p>
              {child.student_code && (
                <p className="mt-1 font-mono text-xs text-ink-400">
                  {child.student_code}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-info/10 px-2.5 py-0.5 text-xs font-medium text-info">
                  {RELATIONSHIP_LABEL[child.relationship] ?? child.relationship}
                </span>
                {child.is_primary && (
                  <span className="rounded-full bg-accent/20 px-2.5 py-0.5 text-xs font-medium text-accent-dark">
                    جهة اتصال أساسية
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {child.current_enrollment && (
          <div className="border-t border-line px-6 py-4">
            <div className="grid gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-ink-400">المرحلة</p>
                <p className="mt-0.5 text-ink">
                  {child.current_enrollment.stage_name}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-400">الصف</p>
                <p className="mt-0.5 text-ink">
                  {child.current_enrollment.grade_name}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-400">المجموعة</p>
                <p className="mt-0.5 text-ink">
                  {child.current_enrollment.group_name}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-400">السنة الدراسية</p>
                <p className="mt-0.5 text-ink">
                  {child.current_enrollment.academic_year_name}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label="نسبة الحضور"
          value={
            child.attendance.percentage !== null
              ? `${child.attendance.percentage}%`
              : "—"
          }
          hint={`${child.attendance.total_sessions} حصة مسجلة`}
          accent={
            child.attendance.percentage === null
              ? "default"
              : child.attendance.percentage >= 80
              ? "success"
              : child.attendance.percentage >= 50
              ? "warning"
              : "danger"
          }
        />
        <StatCard
          label="متوسط الامتحانات"
          value={
            child.exams.average_percentage !== null
              ? `${child.exams.average_percentage}%`
              : "—"
          }
          hint={`${child.exams.total_graded} امتحان مصحح`}
          accent={
            child.exams.average_percentage === null
              ? "default"
              : child.exams.average_percentage >= 70
              ? "success"
              : child.exams.average_percentage >= 40
              ? "warning"
              : "danger"
          }
        />
        <StatCard
          label="كود الطالب"
          value={child.student_code ?? "—"}
          hint="يُستخدم في تسجيل الحضور"
          mono
        />
      </div>

      {/* Recent attendance */}
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-ink">
            آخر سجلات الحضور
          </h2>
          <span className="text-[11px] text-ink-400">
            {child.recent_attendance.length} سجل
          </span>
        </div>
        {child.recent_attendance.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-400">
            لا توجد سجلات حضور بعد
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {child.recent_attendance.map((r, idx) => (
              <AttendanceRow key={idx} record={r} />
            ))}
          </ul>
        )}
      </section>

      {/* Recent attempts */}
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-ink">
            آخر الامتحانات
          </h2>
          <span className="text-[11px] text-ink-400">
            {child.recent_attempts.length} محاولة
          </span>
        </div>
        {child.recent_attempts.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-400">
            لم يُكمل أي امتحان بعد
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {child.recent_attempts.map((a) => (
              <AttemptRow key={a.attempt_id} attempt={a} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  hint,
  accent = "default",
  mono,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "default" | "success" | "warning" | "danger";
  mono?: boolean;
}) {
  const color = {
    default: "text-ink",
    success: "text-success",
    warning: "text-accent-dark",
    danger: "text-danger",
  }[accent];

  return (
    <div className="card p-4 text-center">
      <p className="text-xs text-ink-400">{label}</p>
      <p
        className={`mt-1 font-display text-2xl font-bold ${color} ${
          mono ? "font-mono text-base" : ""
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[10px] text-ink-400">{hint}</p>}
    </div>
  );
}

function AttendanceRow({ record }: { record: ParentChildRecentAttendance }) {
  const style = ATTENDANCE_STATUS_STYLE[record.status] ?? "bg-ink-50 text-ink-700";
  const label = ATTENDANCE_STATUS_LABEL[record.status] ?? record.status;

  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{record.group_name}</p>
        <p className="mt-0.5 text-xs text-ink-400">
          {new Date(record.date).toLocaleDateString("ar-EG", {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}{" "}
          · {record.start_time} - {record.end_time}
        </p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${style}`}>
        {label}
      </span>
    </li>
  );
}

function AttemptRow({ attempt }: { attempt: ParentChildRecentAttempt }) {
  const isPassed = attempt.is_passed === true;
  const isFailed = attempt.is_passed === false;

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {attempt.assessment_title}
        </p>
        <p className="mt-0.5 text-xs text-ink-400">
          محاولة #{attempt.attempt_number} · {attempt.score ?? "—"}/
          {attempt.max_score} · {attempt.percentage}%
        </p>
      </div>
      <div className="shrink-0">
        {isPassed && (
          <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
            ✓ ناجح
          </span>
        )}
        {isFailed && (
          <span className="rounded-full bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger">
            ✗ راسب
          </span>
        )}
        {!isPassed && !isFailed && (
          <span className="rounded-full bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-400">
            {attempt.status === "SUBMITTED" ? "بانتظار التصحيح" : "—"}
          </span>
        )}
      </div>
    </li>
  );
}