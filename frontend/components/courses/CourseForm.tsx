"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { SmartSelect } from "@/components/common/SmartSelect";
import { GradeForm } from "@/components/grades/GradeForm";
import { SubjectForm } from "@/components/subjects/SubjectForm";
import { FormErrorSummary } from "@/components/ui/FormErrorSummary";
import { FormFooter } from "@/components/ui/FormFooter";
import { Input } from "@/components/ui/Input";
import { listAcademicYears } from "@/lib/api/academicYears";
import { createGrade, listGrades } from "@/lib/api/grades";
import { createSubject, listSubjects } from "@/lib/api/subjects";
import { listStages } from "@/lib/api/stages";
import { listTerms } from "@/lib/api/terms";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import {
  courseSchema,
  type CourseFormValues,
  type GradeFormValues,
  type SubjectFormValues,
} from "@/lib/validation/schemas";

interface CourseFormProps {
  onSubmit: (values: CourseFormValues) => Promise<void>;
  onCancel?: () => void;
  initialGrade?: string;
  initialValues?: Partial<CourseFormValues>;
  initialAcademicYear?: string;
  // ─── Save & Add Another ───
  keepOpen?: boolean;
  onKeepOpenChange?: (checked: boolean) => void;
}

export function CourseForm({
  onSubmit,
  onCancel,
  initialGrade,
  initialValues,
  initialAcademicYear,
  keepOpen = false,
  onKeepOpenChange,
}: CourseFormProps) {
  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [gradeModalOpen, setGradeModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: subjects, isLoading: subjectsLoading } = useQuery({
    queryKey: ["subjects"],
    queryFn: () => listSubjects(),
  });
  const { data: grades, isLoading: gradesLoading } = useQuery({
    queryKey: ["grades"],
    queryFn: () => listGrades(),
  });
  const { data: stages } = useQuery({
    queryKey: ["stages"],
    queryFn: () => listStages(),
  });
  const { data: years } = useQuery({
    queryKey: ["academic-years"],
    queryFn: () => listAcademicYears(),
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting, dirtyFields, isSubmitted },
  } = useForm<CourseFormValues>({
    resolver: zodResolver(courseSchema),
    mode: "onTouched",
    defaultValues: {
      ...(initialGrade ? { grade: initialGrade } : {}),
      ...(initialAcademicYear ? { academic_year: initialAcademicYear } : {}),
      ...initialValues,
    },
  });

  useUnsavedChangesWarning(Object.keys(dirtyFields).length > 0);
  const isEdit = !!initialValues;
  const selectedYear = useWatch({ control, name: "academic_year" });

  const { data: terms } = useQuery({
    queryKey: ["terms", selectedYear],
    queryFn: () => listTerms(),
    enabled: true,
  });
  const filteredTerms = (terms?.results ?? []).filter(
    (t) => !selectedYear || t.academic_year === selectedYear
  );

  // تجميع الصفوف حسب المرحلة (مثل ما فعلنا في المجموعات)
  const gradesByStage = useMemo(() => {
    if (!grades?.results || !stages?.results) return [];
    
    const stageMap = new Map(stages.results.map(s => [s.id, s.name]));
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

  const errorMessages = Object.entries(errors)
    .map(([field, err]) => {
      const label =
        {
          subject: "المادة",
          grade: "الصف",
          name: "اسم المادة الدراسية",
          academic_year: "السنة الدراسية",
          term: "الترم",
        }[field] ?? field;
      return err?.message ? `${label}: ${err.message}` : null;
    })
    .filter(Boolean) as string[];

  async function handleCreateSubject(values: SubjectFormValues) {
    const created = await createSubject(values);
    await queryClient.invalidateQueries({ queryKey: ["subjects"] });
    setValue("subject", created.id, { shouldValidate: true });
    setSubjectModalOpen(false);
  }

  async function handleCreateGrade(values: GradeFormValues) {
    const created = await createGrade(values);
    await queryClient.invalidateQueries({ queryKey: ["grades"] });
    setValue("grade", created.id, { shouldValidate: true });
    setGradeModalOpen(false);
  }

  function handleYearChange(value: string) {
    setValue("academic_year", value, { shouldValidate: true });
    setValue("term", "");
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <FormErrorSummary messages={isSubmitted ? errorMessages : []} />

        <Controller
          name="subject"
          control={control}
          render={({ field }) => (
            <SmartSelect
              label="المادة *"
              value={field.value ?? ""}
              onChange={field.onChange}
              isLoading={subjectsLoading}
              options={(subjects?.results ?? []).map((s) => ({
                value: s.id,
                label: s.name,
              }))}
              onCreateNew={() => setSubjectModalOpen(true)}
              createLabel="+ إضافة مادة"
              error={errors.subject?.message}
            />
          )}
        />

        {/* حقل الصف - قائمة مجمعة */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">
            الصف <span className="text-danger">*</span>
          </label>
          <div className="flex gap-2">
            <Controller
              name="grade"
              control={control}
              render={({ field }) => (
                <select
                  {...field}
                  disabled={gradesLoading || !!initialGrade}
                  className={`flex-1 rounded-lg border bg-paper-elevated px-3 py-2 text-sm text-ink outline-none transition-all focus:border-ink focus:ring-2 focus:ring-ink/10 disabled:bg-paper-muted ${
                    errors.grade ? "border-danger" : "border-line"
                  }`}
                >
                  <option value="">
                    {gradesLoading ? "جارٍ التحميل..." : "اختر الصف..."}
                  </option>
                  {gradesByStage.map((group) => (
                    <optgroup key={group.stageName} label={group.stageName}>
                      {group.grades.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
            />
            <button
              type="button"
              onClick={() => setGradeModalOpen(true)}
              disabled={!!initialGrade}
              className="shrink-0 rounded-lg bg-paper-elevated px-4 py-2 text-sm font-medium text-ink border border-line hover:bg-paper-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + صف
            </button>
          </div>
          {errors.grade && <p className="text-xs text-danger">{errors.grade.message}</p>}
        </div>

        <Input
          label="اسم المادة الدراسية"
          hint="مثال: رياضيات — الأول الثانوي"
          required
          error={errors.name?.message}
          {...register("name")}
        />

        <div className="rounded-lg border border-line p-3">
          <p className="mb-2 text-xs font-medium text-ink-400">
            النطاق الزمني{" "}
            <span className="font-normal">
              (السنة الدراسية مطلوبة — الترم اختياري)
            </span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Controller
              name="academic_year"
              control={control}
              render={({ field }) => (
                <SmartSelect
                  label="السنة الدراسية *"
                  value={field.value ?? ""}
                  onChange={handleYearChange}
                  options={(years?.results ?? []).map((y) => ({
                    value: y.id,
                    label: y.name,
                  }))}
                  disabled={!!initialAcademicYear}
                  error={errors.academic_year?.message}
                />
              )}
            />
            <Controller
              name="term"
              control={control}
              render={({ field }) => (
                <SmartSelect
                  label="الترم (اختياري)"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  options={filteredTerms.map((t) => ({
                    value: t.id,
                    label: t.name,
                  }))}
                  error={errors.term?.message}
                />
              )}
            />
          </div>
          {selectedYear && (
            <p className="mt-2 text-xs text-ink-400">
              المادة ستكون خاصة بالسنة المختارة. اترك الترم فارغاً إذا كانت
              المادة للسنة كاملة.
            </p>
          )}
        </div>

        <FormFooter
          isSubmitting={isSubmitting}
          submitLabel={isEdit ? "حفظ التعديلات" : "حفظ"}
          onCancel={onCancel}
          showKeepOpen={!isEdit}
          keepOpen={keepOpen}
          onKeepOpenChange={onKeepOpenChange}
        />
      </form>

      <QuickCreateModal
        open={subjectModalOpen}
        onClose={() => setSubjectModalOpen(false)}
        title="إضافة مادة"
      >
        <SubjectForm
          onSubmit={handleCreateSubject}
          onCancel={() => setSubjectModalOpen(false)}
        />
      </QuickCreateModal>

      <QuickCreateModal
        open={gradeModalOpen}
        onClose={() => setGradeModalOpen(false)}
        title="إضافة صف"
      >
        <GradeForm
          onSubmit={handleCreateGrade}
          onCancel={() => setGradeModalOpen(false)}
        />
      </QuickCreateModal>
    </>
  );
}