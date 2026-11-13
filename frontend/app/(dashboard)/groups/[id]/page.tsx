"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { EnrollmentForm } from "@/components/enrollments/EnrollmentForm";
import { TeacherAssignmentForm } from "@/components/teacher-assignments/TeacherAssignmentForm";
import { Button } from "@/components/ui/Button";
import { DetailPage } from "@/components/ui/DetailPage";
import { EmptyStateV3 } from "@/components/ui/EmptyStateV3";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Search } from "@/components/ui/icons";
import { createEnrollment } from "@/lib/api/enrollments";
import { getGroupDetail } from "@/lib/api/groups";
import { createTeacherAssignment } from "@/lib/api/teacherAssignments";
import {
  showResponseWarnings,
  toastError,
  toastSuccess,
} from "@/lib/utils/toast";
import type { EnrollmentFormValues } from "@/lib/validation/schemas";

function enrollmentStatusLabel(status: string): string {
  return (
    {
      ACTIVE: "نشط",
      COMPLETED: "مكتمل",
      TRANSFERRED: "منقول",
      SUSPENDED: "موقوف",
      GRADUATED: "متخرج",
      INACTIVE: "غير نشط",
      ARCHIVED: "مؤرشف",
    }[status] ?? status
  );
}

function enrollmentStatusVariant(
  status: string,
): "success" | "info" | "warning" | "danger" | "neutral" {
  return (
    {
      ACTIVE: "success",
      COMPLETED: "info",
      TRANSFERRED: "neutral",
      SUSPENDED: "danger",
      GRADUATED: "warning",
    }[status] ?? "neutral"
  ) as "success" | "info" | "warning" | "danger" | "neutral";
}

export default function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["group-detail", id],
    queryFn: () => getGroupDetail(id),
  });

  const data = q.data;

  async function handleEnroll(values: EnrollmentFormValues) {
    try {
      const created = await createEnrollment(values);
      showResponseWarnings(created);
      await q.refetch();
      await queryClient.invalidateQueries({ queryKey: ["enrollments"] });
      toastSuccess("تم تسجيل الطالب");
      setEnrollOpen(false);
    } catch (err) {
      toastError(err, "تعذّر تسجيل الطالب.");
    }
  }

  async function handleAssign(values: {
    teacher: string;
    course: string;
    groups?: string[];
  }) {
    try {
      const created = await createTeacherAssignment({
        teacher: values.teacher,
        course: values.course,
        groups: values.groups?.length ? values.groups : [id],
      });
      showResponseWarnings(created);
      await q.refetch();
      await queryClient.invalidateQueries({
        queryKey: ["teacher-assignments"],
      });
      toastSuccess("تمت إضافة التكليف");
      setAssignOpen(false);
    } catch (err) {
      toastError(err, "تعذّرت إضافة التكليف.");
    }
  }

  const filteredStudents = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    if (!term) return data.students;
    return data.students.filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        s.email.toLowerCase().includes(term),
    );
  }, [data, search]);

  const stats = data
    ? [
        {
          label: "الطلاب",
          value: data.summary.students_count,
          hint: data.group.capacity
            ? `من أصل ${data.group.capacity}`
            : "بدون حد أقصى",
        },
        {
          label: "المعلمون",
          value: data.summary.teachers_count,
          accent: "success" as const,
        },
        {
          label: "نسبة الإشغال",
          value: data.group.capacity
            ? `${Math.round(
                (data.summary.students_count / data.group.capacity) * 100,
              )}%`
            : "—",
          accent: (() => {
            if (!data.group.capacity) return "default" as const;
            const ratio = data.summary.students_count / data.group.capacity;
            if (ratio >= 1) return "danger" as const;
            if (ratio >= 0.8) return "warning" as const;
            return "success" as const;
          })(),
        },
      ]
    : undefined;

  const hero = data ? (
    <div className="card overflow-hidden">
      <div className="bg-gradient-to-l from-accent/10 to-transparent px-6 py-5">
        <div className="flex flex-wrap items-start gap-4">
          <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-ink text-2xl font-bold text-white">
            {data.group.name.charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link
                href={`/grades/${data.grade.id}`}
                className="text-ink-700 hover:text-ink hover:underline"
              >
                {data.grade.name}
              </Link>
              <span className="text-ink-300">·</span>
              <Link
                href="/academic-years"
                className="text-ink-700 hover:text-ink hover:underline"
              >
                {data.academic_year.name}
              </Link>
            </div>
          </div>
        </div>

        {data.group.capacity && (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-ink-400">السعة</span>
              <span className="font-medium tabular-nums text-ink">
                {data.summary.students_count} / {data.group.capacity}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink-100">
              <div
                className={`h-full rounded-full transition-all ${
                  data.summary.students_count >= data.group.capacity
                    ? "bg-danger"
                    : data.summary.students_count / data.group.capacity >= 0.8
                      ? "bg-accent"
                      : "bg-success"
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    (data.summary.students_count / data.group.capacity) * 100,
                  )}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;

  const sections = data
    ? [
        {
          key: "teachers",
          title: `المعلمون (${data.teachers.length})`,
          action: (
            <Button
              onClick={() => setAssignOpen(true)}
              className="text-sm"
              disabled={!data}
            >
              + إسناد معلم
            </Button>
          ),
          content:
            data.teachers.length === 0 ? (
              <EmptyStateV3
                variant="no-data"
                icon="👨‍🏫"
                title="لم يُسند معلمون بعد"
                description="أسند معلمًا لهذه المجموعة ليبدأ بتدريسها."
                action={
                  <Button onClick={() => setAssignOpen(true)}>
                    + إسناد أول معلم
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {data.teachers.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-white">
                        {t.name.trim().charAt(0).toUpperCase() || "؟"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/team/${t.id}`}
                          className="block truncate text-sm font-semibold text-ink hover:underline"
                        >
                          {t.name}
                        </Link>
                        <p className="mt-0.5 truncate text-xs text-ink-400">
                          {t.course_name}
                        </p>
                      </div>
                    </div>
                    <Link href={`/team/${t.id}`} className="shrink-0">
                      <Button variant="ghost" className="text-xs">
                        عرض
                      </Button>
                    </Link>
                  </li>
                ))}
              </ul>
            ),
        },
        {
          key: "students",
          title: `الطلاب (${data.summary.students_count})`,
          action: (
            <Button onClick={() => setEnrollOpen(true)} className="text-sm">
              + تسجيل طالب
            </Button>
          ),
          content:
            data.students.length === 0 ? (
              <EmptyStateV3
                variant="no-data"
                icon="🎓"
                title="لا يوجد طلاب في هذه المجموعة"
                description="سجّل أول طالب لتبدأ متابعة تقدمه."
                action={
                  <Button onClick={() => setEnrollOpen(true)}>
                    + تسجيل أول طالب
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-col gap-3">
                {data.students.length > 5 && (
                  <div className="relative">
                    <Search
                      size={16}
                      className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-400"
                    />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="ابحث بالاسم أو البريد..."
                      className="w-full rounded-lg border border-line bg-paper-elevated py-2 pe-9 ps-3 text-sm text-ink outline-none transition-colors focus:border-ink focus:ring-2 focus:ring-ink/10"
                    />
                  </div>
                )}

                {filteredStudents.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-line bg-paper-muted/20 py-6 text-center text-sm text-ink-400">
                    لا توجد نتائج مطابقة لـ &quot;{search}&quot;
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {filteredStudents.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-accent-dark text-sm font-bold text-white">
                            {s.name.trim().charAt(0).toUpperCase() || "؟"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/students/${s.id}`}
                              className="block truncate text-sm font-semibold text-ink hover:underline"
                            >
                              {s.name}
                            </Link>
                            <p className="mt-0.5 truncate text-xs text-ink-400">
                              {s.email}
                              {s.term_name && ` · ${s.term_name}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {s.status !== "ACTIVE" && (
                            <StatusBadge
                              variant={enrollmentStatusVariant(s.status)}
                            >
                              {enrollmentStatusLabel(s.status)}
                            </StatusBadge>
                          )}
                          <Link href={`/students/${s.id}`}>
                            <Button variant="ghost" className="text-xs">
                              عرض
                            </Button>
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ),
        },
      ]
    : undefined;

  const breadcrumb = data
    ? [
        { label: "المجموعات", href: "/groups" },
        { label: data.grade.name, href: `/grades/${data.grade.id}` },
        { label: data.group.name },
      ]
    : undefined;

  return (
    <>
      <DetailPage
        breadcrumb={breadcrumb}
        title={data?.group.name ?? "المجموعة"}
        description={
          data ? `${data.grade.name} · ${data.academic_year.name}` : undefined
        }
        hero={hero}
        stats={stats}
        sections={sections}
        isLoading={q.isLoading}
        isError={q.isError}
        errorMessage="تعذّر تحميل بيانات المجموعة."
        onRetry={() => q.refetch()}
      />

      {data && (
        <>
          <QuickCreateModal
            open={enrollOpen}
            onClose={() => setEnrollOpen(false)}
            title={`تسجيل طالب — ${data.group.name}`}
          >
            <EnrollmentForm onSubmit={handleEnroll} initialGroup={id} />
          </QuickCreateModal>

          <QuickCreateModal
            open={assignOpen}
            onClose={() => setAssignOpen(false)}
            title={`إسناد معلم — ${data.group.name}`}
          >
            <TeacherAssignmentForm
              onSubmit={handleAssign}
              initialGroups={[id]}
              gradeFilter={data.grade.id} 
              academicYearFilter={data.academic_year.id}
            />
          </QuickCreateModal>
        </>
      )}
    </>
  );
}