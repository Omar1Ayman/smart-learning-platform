"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Button } from "@/components/ui/Button";
import { DetailPage } from "@/components/ui/DetailPage";
import { EmptyStateV3 } from "@/components/ui/EmptyStateV3";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getTeacherDetail } from "@/lib/api/profiles";

const ASSESSMENT_STATUS: Record<
  string,
  { label: string; variant: "success" | "warning" | "neutral" }
> = {
  DRAFT: { label: "مسودّة", variant: "warning" },
  SCHEDULED: { label: "مجدول", variant: "warning" },
  PUBLISHED: { label: "منشور", variant: "success" },
  CLOSED: { label: "مغلق", variant: "neutral" },
  ARCHIVED: { label: "مؤرشف", variant: "neutral" },
};

export default function TeacherDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();

  const q = useQuery({
    queryKey: ["teacher-detail", id],
    queryFn: () => getTeacherDetail(id),
    retry: (count, err) => {
      const status =
        (err as { status?: number })?.status ??
        (err as { response?: { status?: number } })?.response?.status;
      return status === 404 ? false : count < 2;
    },
  });

  const data = q.data;
  const status =
    (q.error as { status?: number } | null)?.status ??
    (q.error as { response?: { status?: number } } | null)?.response?.status;
  const isNotFound = status === 404;

  const name =
    data &&
    ([data.first_name, data.last_name].filter(Boolean).join(" ") || data.email);

  // ---- hero ----
  const hero = data ? (
    <div className="card overflow-hidden">
      <div className="h-20 bg-gradient-to-l from-ink-50 to-transparent" />
      <div className="-mt-10 flex flex-col gap-4 p-6 sm:flex-row sm:items-end">
        <span
          aria-hidden
          className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-ink font-display text-2xl font-bold text-white ring-4 ring-white"
        >
          {name?.[0]?.toUpperCase() ?? "؟"}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-bold text-ink">{name}</h2>
          <p className="mt-0.5 truncate text-sm text-ink-400">{data.email}</p>
          <div className="mt-2">
            <StatusBadge variant="info">معلّم</StatusBadge>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  // ---- stats (clickable) ----
  const stats = data
    ? [
        {
          label: "الطلاب",
          value: data.students_summary.total_students,
          href: `/students?teacher=${id}`,
        },
        {
          label: "الامتحانات",
          value: data.assessments_summary.total_assessments,
          href: `/assessments?teacher=${id}`,
        },
        {
          label: "منشورة",
          value: data.assessments_summary.published,
          href: `/assessments?teacher=${id}&status=PUBLISHED`,
          accent: "success" as const,
        },
        {
          label: "بحاجة تصحيح",
          value: data.assessments_summary.pending_grading,
          href: `/assessments?teacher=${id}&grading=pending`,
          accent:
            data.assessments_summary.pending_grading > 0
              ? ("warning" as const)
              : ("default" as const),
        },
      ]
    : undefined;

  // ---- sections ----
  const sections = data
    ? [
        {
          key: "assignments",
          title: `التكليفات${
            data.assignments.length > 0 ? ` (${data.assignments.length})` : ""
          }`,
          content:
            data.assignments.length === 0 ? (
              <EmptyStateV3
                variant="no-data"
                icon="📚"
                title="لا توجد تكليفات"
                description="لم يُسند هذا المعلم لأي مادة بعد."
              />
            ) : (
              <ul className="divide-y divide-line">
                {data.assignments.map((a) => (
                  <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium text-ink">
                      {a.course_name}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {a.subject_name} · {a.grade_name} · {a.scope_label}
                    </p>
                    {a.group_names.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {a.group_names.map((g) => (
                          <span
                            key={g}
                            className="rounded-full bg-ink-50 px-2 py-0.5 text-[11px] text-ink-700"
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ),
        },
        {
          key: "recent-assessments",
          title: "آخر الامتحانات",
          action:
            data.recent_assessments.length > 0 ? (
              <Link
                href={`/assessments?teacher=${id}`}
                className="text-xs text-ink-400 hover:text-ink"
              >
                عرض الكل ←
              </Link>
            ) : undefined,
          content:
            data.recent_assessments.length === 0 ? (
              <EmptyStateV3
                variant="no-data"
                icon="📝"
                title="لا توجد امتحانات"
                description="لم ينشئ هذا المعلم أي امتحان بعد."
              />
            ) : (
              <ul className="divide-y divide-line">
                {data.recent_assessments.map((a) => {
                  const meta = ASSESSMENT_STATUS[a.status] ?? {
                    label: a.status,
                    variant: "neutral" as const,
                  };
                  return (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/assessments/${a.id}`}
                          className="block truncate text-sm font-medium text-ink hover:underline"
                        >
                          {a.title}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <StatusBadge variant={meta.variant}>
                            {meta.label}
                          </StatusBadge>
                        </div>
                      </div>
                      <Link href={`/assessments/${a.id}/results`}>
                        <Button variant="ghost" className="text-xs">
                          النتائج
                        </Button>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ),
        },
      ]
    : undefined;

  return (
    <DetailPage
      breadcrumb={[
        { label: "الفريق", href: "/team" },
        { label: name ?? "..." },
      ]}
      title={name ?? "تفاصيل المعلم"}
      description={data?.email}
      actions={
        data && (
          <ActionMenu
            items={[
              {
                label: "إدارة من صفحة الفريق",
                onClick: () => {
                  window.location.href = `/team?highlight=${id}`;
                },
              },
              {
                label: "تحديث البيانات",
                onClick: () =>
                  queryClient.invalidateQueries({
                    queryKey: ["teacher-detail", id],
                  }),
              },
            ]}
          />
        )
      }
      hero={hero}
      stats={stats}
      sections={sections}
      isLoading={q.isLoading}
      isError={q.isError}
      errorMessage={
        isNotFound ? "المعلم غير موجود." : "تعذّر تحميل بيانات المعلم."
      }
      onRetry={isNotFound ? undefined : () => q.refetch()}
    />
  );
}