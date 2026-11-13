"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use, useState } from "react";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { CourseForm } from "@/components/courses/CourseForm";
import { GroupForm } from "@/components/groups/GroupForm";
import { Button } from "@/components/ui/Button";
import { ErrorState, Spinner } from "@/components/ui/States";
import { createCourse } from "@/lib/api/courses";
import { getGradeDetail } from "@/lib/api/grades";
import { createGroup } from "@/lib/api/groups";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type { CourseFormValues, GroupFormValues } from "@/lib/validation/schemas";

export default function GradeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [courseOpen, setCourseOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["grade-detail", id],
    queryFn: () => getGradeDetail(id),
  });

  async function handleCreateCourse(values: CourseFormValues) {
    try {
      await createCourse(values);
      await queryClient.invalidateQueries({ queryKey: ["grade-detail", id] });
      await queryClient.invalidateQueries({ queryKey: ["courses"] });
      toastSuccess("تمت إضافة المادة الدراسية");
      setCourseOpen(false);
      refetch();
    } catch (err) {
      toastError(err, "تعذّرت إضافة المادة.");
    }
  }

  async function handleCreateGroup(values: GroupFormValues) {
    try {
      await createGroup(values);
      await queryClient.invalidateQueries({ queryKey: ["grade-detail", id] });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      toastSuccess("تمت إضافة المجموعة");
      setGroupOpen(false);
      refetch();
    } catch (err) {
      toastError(err, "تعذّرت إضافة المجموعة.");
    }
  }

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message="تعذّر تحميل بيانات الصف." />;

  const s = data.summary;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <Link href="/grades" className="text-sm text-ink-400 hover:text-ink">
          ← الصفوف
        </Link>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">{data.grade.name}</h1>
        <p className="mt-1 text-sm text-ink-400">
          {s.courses_count} مادة · {s.groups_count} مجموعة · {s.teachers_count} معلم ·{" "}
          {s.total_students} طالب
        </p>
      </div>

      {/* Courses */}
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-bold text-ink">المواد الدراسية</h2>
          <Button onClick={() => setCourseOpen(true)} className="text-sm">
            + إضافة مادة
          </Button>
        </div>
        {data.courses.length === 0 ? (
          <p className="text-sm text-ink-400">
            لم تُضف مواد دراسية بعد. اضغط «+ إضافة مادة» للبدء.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {data.courses.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/courses/${c.id}`}
                    className="text-sm font-medium text-ink hover:underline"
                  >
                    {c.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {c.subject_name}
                    {c.academic_year_name && ` · ${c.academic_year_name}`}
                    {c.term_name && ` · ${c.term_name}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Groups */}
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-bold text-ink">المجموعات</h2>
          <Button onClick={() => setGroupOpen(true)} className="text-sm">
            + إضافة مجموعة
          </Button>
        </div>
        {data.groups.length === 0 ? (
          <p className="text-sm text-ink-400">
            لا توجد مجموعات. اضغط «+ إضافة مجموعة» للبدء.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {data.groups.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/groups/${g.id}`}
                    className="text-sm font-medium text-ink hover:underline"
                  >
                    {g.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {g.academic_year} · {g.student_count} طالب
                    {g.capacity && ` / ${g.capacity}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Teachers (read-only from grade page — assigned via groups page) */}
      <section className="card p-5">
        <h2 className="mb-3 font-display text-base font-bold text-ink">المعلمون</h2>
        {data.teachers.length === 0 ? (
          <p className="text-sm text-ink-400">
            لا يوجد معلمون مسندون لهذا الصف. أضفهم من صفحة المادة أو المجموعة.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {data.teachers.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/team/${t.id}`}
                    className="text-sm font-medium text-ink hover:underline"
                  >
                    {t.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-400">{t.courses.join(" · ")}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Modals */}
      <QuickCreateModal
        open={courseOpen}
        onClose={() => setCourseOpen(false)}
        title={`إضافة مادة دراسية — ${data.grade.name}`}
      >
        <CourseForm onSubmit={handleCreateCourse} initialGrade={id} />
      </QuickCreateModal>

      <QuickCreateModal
        open={groupOpen}
        onClose={() => setGroupOpen(false)}
        title={`إضافة مجموعة — ${data.grade.name}`}
      >
        <GroupForm onSubmit={handleCreateGroup} initialGrade={id} />
      </QuickCreateModal>
    </div>
  );
}