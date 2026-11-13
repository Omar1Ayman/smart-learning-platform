"use client";

import Link from "next/link";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import type { Enrollment, EnrollmentStatus } from "@/types";

const STATUS_META: Record<
  EnrollmentStatus,
  { label: string; cls: string; dot: string }
> = {
  ACTIVE: {
    label: "نشط",
    cls: "bg-success/10 text-success",
    dot: "bg-success",
  },
  COMPLETED: {
    label: "مكتمل",
    cls: "bg-info/10 text-info",
    dot: "bg-info",
  },
  GRADUATED: {
    label: "متخرج",
    cls: "bg-accent/20 text-accent-dark",
    dot: "bg-accent",
  },
  FAILED: {                                    
    label: "راسب",
    cls: "bg-danger/10 text-danger",
    dot: "bg-danger",
  },
  TRANSFERRED: {
    label: "منقول",
    cls: "bg-ink-100 text-ink-700",
    dot: "bg-ink-500",
  },
  SUSPENDED: {
    label: "موقوف",
    cls: "bg-danger/10 text-danger",
    dot: "bg-danger",
  },
  INACTIVE: {
    label: "غير نشط",
    cls: "bg-ink-50 text-ink-400",
    dot: "bg-ink-400",
  },
  ARCHIVED: {
    label: "مؤرشف",
    cls: "bg-ink-50 text-ink-400",
    dot: "bg-ink-300",
  },
};

interface EnrollmentCardProps {
  enrollment: Enrollment;
  actions: ActionMenuItem[];
}

export function EnrollmentCard({ enrollment, actions }: EnrollmentCardProps) {
  const status =
    STATUS_META[enrollment.status] ?? {
      label: enrollment.status,
      cls: "bg-ink-50 text-ink-400",
      dot: "bg-ink-400",
    };

  return (
    <div className="card flex flex-col gap-3 p-4 transition-shadow hover:shadow-card-hover">
      {/* Header: student name + email + status + actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">
            {(enrollment.student_name || enrollment.student_email || "?")
              .trim()
              .charAt(0)
              .toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <Link
              href={`/students/${enrollment.student}`}
              className="block truncate text-sm font-semibold text-ink hover:underline"
            >
              {enrollment.student_name || enrollment.student_email}
            </Link>
            <p className="mt-0.5 truncate text-xs text-ink-400">
              {enrollment.student_email}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${status.cls}`}
          >
            <span className={`h-1 w-1 rounded-full ${status.dot}`} />
            {status.label}
          </span>
          <ActionMenu items={actions} />
        </div>
      </div>

      {/* Body: group + year + term */}
      <div className="flex flex-wrap items-center gap-1 border-t border-line pt-2.5">
        <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-medium text-ink-700">
          🏫 {enrollment.group_name}
        </span>
        <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-medium text-ink-700">
          📅 {enrollment.academic_year_name}
        </span>
        {enrollment.term_name && (
          <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-medium text-ink-700">
            🗓️ {enrollment.term_name}
          </span>
        )}
      </div>

      {/* Footer: enrollment date */}
      <div className="flex items-center justify-between border-t border-line pt-2.5 text-xs text-ink-400">
        <span>سُجّل في</span>
        <span>
          {new Date(enrollment.enrolled_at).toLocaleDateString("ar-EG", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
    </div>
  );
}