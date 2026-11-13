"use client";

import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import type { TeacherAssignment } from "@/lib/api/teacherAssignments";

interface AssignmentCardProps {
  assignment: TeacherAssignment;
  actions: ActionMenuItem[];
}

export function AssignmentCard({ assignment, actions }: AssignmentCardProps) {
  const teacherInitial = (assignment.teacher_name || assignment.teacher_email || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  const hasGroups = assignment.groups.length > 0;

  return (
    <div className="card flex flex-col gap-3 p-4 transition-shadow hover:shadow-card-hover">
      {/* Header: teacher avatar + email + actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">
            {teacherInitial}
          </span>
           <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">
              {assignment.teacher_name || assignment.teacher_email}
            </p>
            <p className="mt-0.5 truncate text-xs text-ink-400">
              {assignment.teacher_email}
            </p>
          </div>
        </div>
        <ActionMenu items={actions} />
      </div>

      {/* Course */}
      <div className="rounded-lg bg-paper-muted/50 px-3 py-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-ink-400">
          المادة الدراسية
        </p>
        <p className="mt-0.5 text-sm font-medium text-ink">
          {assignment.course_name}
        </p>
      </div>

      {/* Groups scope */}
      <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
        <p className="text-[10px] font-medium uppercase tracking-wide text-ink-400">
          النطاق
        </p>
        {hasGroups ? (
          <div className="flex flex-wrap gap-1">
            {assignment.group_names.map((g, idx) => (
              <span
                key={`${g}-${idx}`}
                className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-medium text-ink-700"
              >
                {g}
              </span>
            ))}
          </div>
        ) : (
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-info/10 px-2 py-0.5 text-[10px] font-medium text-info">
            🌐 كل مجموعات الصف
          </span>
        )}
      </div>

      {/* Summary line */}
      <div className="flex items-center justify-between border-t border-line pt-2.5 text-xs text-ink-400">
        <span>
          {hasGroups
            ? `${assignment.groups.length} مجموعة محددة`
            : "غير مقيد بمجموعات"}
        </span>
        {assignment.created_at && (
          <span>
            {new Date(assignment.created_at).toLocaleDateString("ar-EG")}
          </span>
        )}
      </div>
    </div>
  );
}