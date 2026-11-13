"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ResourcePage } from "@/components/common/ResourcePage";
import type { FilterDef } from "@/components/ui/DataTable";
import { CourseForm } from "@/components/courses/CourseForm";
import { Upload } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { useYearScopedQuery } from "@/lib/hooks/useYearScopedQuery";
import {
  createCourse,
  deleteCourse,
  duplicateCourse,
  listCourses,
  updateCourse,
} from "@/lib/api/courses";
import { listGrades } from "@/lib/api/grades";
import { listStages } from "@/lib/api/stages";
import { listSubjects } from "@/lib/api/subjects";
import { useCanWrite } from "@/lib/auth/useCanWrite";
import type { CourseFormValues } from "@/lib/validation/schemas";
import { toastError, toastSuccess } from "@/lib/utils/toast";

interface CourseRow {
  id: string;
  name: string;
  subject: string;
  subject_name: string;
  grade: string;
  grade_name: string;
  stage: string;
  stage_name: string;
  academic_year: string;
  academic_year_name: string;
  term: string | null;
  term_name: string | null;
  is_active: boolean;
  lessons_count: number;
  teachers_count: number;
}

export default function CoursesPage() {
  const queryClient = useQueryClient();
  const canWrite = useCanWrite();

  const { data: grades } = useQuery({
    queryKey: ["grades"],
    queryFn: () => listGrades(),
  });
  const { data: stages } = useQuery({
    queryKey: ["stages"],
    queryFn: () => listStages(),
  });
  const { data: subjects } = useQuery({
    queryKey: ["subjects"],
    queryFn: () => listSubjects(),
  });

  // ─── Filters state ───
  const [stageFilter, setStageFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");

  const filterValues = useMemo(
    () => ({ stage: stageFilter, grade: gradeFilter, subject: subjectFilter }),
    [stageFilter, gradeFilter, subjectFilter]
  );

  // ─── تجميع الصفوف حسب المرحلة (لفلتر الصفوف) ───
  const gradesByStage = useMemo(() => {
    if (!grades?.results || !stages?.results) return [];

    const stageMap = new Map(stages.results.map((s) => [s.id, s.name]));
    const grouped = new Map<string, typeof grades.results>();

    for (const grade of grades.results) {
      const stageName = stageMap.get(grade.stage) || "غير محدد";
      if (!grouped.has(stageName)) grouped.set(stageName, []);
      grouped.get(stageName)!.push(grade);
    }

    return Array.from(grouped.entries()).map(([stageName, gradeList]) => ({
      stageName,
      grades: gradeList.sort((a, b) => a.order - b.order),
    }));
  }, [grades, stages]);

  // ─── الصفوف المتاحة بناءً على فلتر المرحلة ───
  const availableGradesForFilter = useMemo(() => {
    if (!grades?.results) return [];

    if (stageFilter) {
      const stageGrades = grades.results.filter((g) => g.stage === stageFilter);
      const stageName = stages?.results.find((s) => s.id === stageFilter)?.name ?? "غير محدد";
      return [{ stageName, grades: stageGrades.sort((a, b) => a.order - b.order) }];
    }

    return gradesByStage;
  }, [grades, stages, stageFilter, gradesByStage]);

  // ─── Filters definitions ───
  const filters = useMemo<FilterDef<CourseRow>[]>(
    () => [
      {
        key: "stage",
        label: "المراحل",
        options: (stages?.results ?? []).map((s) => ({
          value: s.id,
          label: s.name,
        })),
        match: (row, v) => row.stage === v,
      },
      {
        key: "grade",
        label: "الصفوف",
        options: [],
        groups: availableGradesForFilter.map((group) => ({
          label: group.stageName,
          options: group.grades.map((g) => ({
            value: g.id,
            label: g.name,
          })),
        })),
        match: (row, v) => row.grade === v,
      },
      {
        key: "subject",
        label: "المواد",
        options: (subjects?.results ?? []).map((s) => ({
          value: s.id,
          label: s.name,
        })),
        match: (row, v) => row.subject === v,
      },
    ],
    [stages, subjects, availableGradesForFilter]
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["courses"] });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => duplicateCourse(id),
    onSuccess: async (copy) => {
      await invalidate();
      toastSuccess(`تم إنشاء نسخة: ${copy.name}`);
    },
    onError: (err) => toastError(err, "تعذّر نسخ المقرر."),
  });

  // ─── Year-scoped query ───
  const { queryFn: yearScopedQueryFn, enabled: yearEnabled } =
    useYearScopedQuery(listCourses);

  // ─── Reset grade filter when stage changes ───
  const handleStageChange = (value: string) => {
    setStageFilter(value);
    if (value && gradeFilter) {
      const gradeStillValid = grades?.results.some(
        (g) => g.id === gradeFilter && g.stage === value
      );
      if (!gradeStillValid) setGradeFilter("");
    }
  };

  return (
    <div className="page-enter">
      <ResourcePage<CourseRow, CourseFormValues>
        title="المقررات الدراسية"
        description="التدرج: مادة + صف + سنة = مقرر؛ المقرر يحتوي فصول المنهج، وكل فصل يحتوي دروسًا. أضف الملفات والفيديوهات من صفحة الدرس."
        queryKey={["courses"]}
        queryFn={yearScopedQueryFn}
        queryEnabled={yearEnabled}
        extraHeaderActions={
          canWrite ? (
            <Link href="/courses/import">
              <Button variant="secondary">
                <Upload size={14} />
                استيراد المنهج
              </Button>
            </Link>
          ) : null
        }
        columns={[
          {
            header: "الاسم",
            render: (c) => (
              <div className="flex flex-col items-start gap-1">
                <Link
                  href={`/courses/${c.id}`}
                  className="font-medium text-ink hover:underline"
                >
                  {c.name}
                </Link>
                <span className="text-[11px] text-ink-400">
                  افتح المقرر لإدارة فصول المنهج ودروسه
                </span>
              </div>
            ),
            sortValue: (c) => c.name,
          },
          {
            header: "الصف / المادة",
            render: (c) => (
              <span className="text-ink-400">
                {c.grade_name} · {c.subject_name}
              </span>
            ),
            sortValue: (c) => `${c.grade_name} ${c.subject_name}`,
          },
          {
            header: "النطاق",
            render: (c) => (
              <span className="text-xs text-ink-400">
                {c.term_name
                  ? `${c.academic_year_name} · ${c.term_name}`
                  : c.academic_year_name}
              </span>
            ),
            sortValue: (c) => c.academic_year_name ?? "",
          },
          {
            header: "الدروس",
            render: (c) => (
              <span className="inline-flex items-center rounded-full bg-info/10 px-2.5 py-1 text-xs font-medium text-info">
                {c.lessons_count} درس
              </span>
            ),
            sortValue: (c) => c.lessons_count,
          },
          {
            header: "المعلمون",
            render: (c) => (
              <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent-dark">
                {c.teachers_count} معلم
              </span>
            ),
            sortValue: (c) => c.teachers_count,
          },
          {
            header: "الحالة",
            render: (c) => (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  c.is_active
                    ? "bg-success/10 text-success"
                    : "bg-ink-50 text-ink-400"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    c.is_active ? "bg-success" : "bg-ink-400"
                  }`}
                />
                {c.is_active ? "نشط" : "غير نشط"}
              </span>
            ),
            sortValue: (c) => (c.is_active ? 1 : 0),
          },
        ]}
        searchPredicate={(c, q) =>
          c.name.toLowerCase().includes(q) ||
          c.subject_name.toLowerCase().includes(q) ||
          c.grade_name.toLowerCase().includes(q)
        }
        searchPlaceholder="ابحث باسم المقرر..."
        filters={filters}
        filterValues={filterValues}
        onFilterChange={(key, value) => {
          if (key === "stage") handleStageChange(value);
          else if (key === "grade") setGradeFilter(value);
          else if (key === "subject") setSubjectFilter(value);
        }}
        createLabel="+ إضافة مقرر دراسي"
        formTitle="إضافة مقرر دراسي"
        FormComponent={CourseForm}
        EditFormComponent={CourseForm}
        rowToFormValues={(c) => ({
          subject: c.subject,
          grade: c.grade,
          name: c.name,
          academic_year: c.academic_year,
          term: c.term ?? "",
        })}
        deleteLabel={(c) => c.name}
        extraActions={(row) => [
          {
            label: "نسخ المقرر",
            onClick: () => duplicateMutation.mutate(row.id),
            disabled: duplicateMutation.isPending,
          },
        ]}
        onSubmit={async (values) => {
          try {
            await createCourse(values);
            await invalidate();
          } catch (err) {
            toastError(err, "تعذّرت إضافة المقرر.");
            throw err;
          }
        }}
        onUpdate={async (id, values) => {
          try {
            await updateCourse(id, values);
            await invalidate();
          } catch (err) {
            toastError(err, "تعذّر تحديث المقرر.");
            throw err;
          }
        }}
        onDelete={async (id) => {
          try {
            await deleteCourse(id);
            await invalidate();
          } catch (err) {
            toastError(err, "تعذّر حذف المقرر.");
            throw err;
          }
        }}
        emptyTitle="لا توجد مقررات دراسية بعد"
        emptyDescription="ابدأ بإضافة أول مقرر، واختر له المادة الأساسية والصف."
      />
    </div>
  );
}