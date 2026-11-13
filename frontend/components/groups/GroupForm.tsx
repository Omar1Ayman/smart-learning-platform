"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { AcademicYearForm } from "@/components/academic-years/AcademicYearForm";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { SmartSelect } from "@/components/common/SmartSelect";
import { GradeForm } from "@/components/grades/GradeForm";
import { FormErrorSummary } from "@/components/ui/FormErrorSummary";
import { FormFooter } from "@/components/ui/FormFooter";
import { Input } from "@/components/ui/Input";
import { createAcademicYear, listAcademicYears } from "@/lib/api/academicYears";
import { createGrade, listGrades } from "@/lib/api/grades";
import { listStages } from "@/lib/api/stages";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import {
  groupSchema,
  type AcademicYearFormValues,
  type GradeFormValues,
  type GroupFormValues,
} from "@/lib/validation/schemas";

interface GroupFormProps {
  onSubmit: (values: GroupFormValues) => Promise<void>;
  onCancel?: () => void;
  initialGrade?: string;
  initialValues?: Partial<GroupFormValues>;
  keepOpen?: boolean;
  onKeepOpenChange?: (checked: boolean) => void;
}

export function GroupForm({
  onSubmit,
  onCancel,
  initialGrade,
  initialValues,
  keepOpen = false,
  onKeepOpenChange,
}: GroupFormProps) {
  const [gradeModalOpen, setGradeModalOpen] = useState(false);
  const [yearModalOpen, setYearModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: grades, isLoading: gradesLoading } = useQuery({
    queryKey: ["grades"],
    queryFn: () => listGrades(),
  });
  const { data: years, isLoading: yearsLoading } = useQuery({
    queryKey: ["academic-years"],
    queryFn: () => listAcademicYears(),
  });
  const { data: stages } = useQuery({
    queryKey: ["stages"],
    queryFn: () => listStages(),
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting, dirtyFields, isSubmitted },
  } = useForm<z.input<typeof groupSchema>, unknown, GroupFormValues>({
    resolver: zodResolver(groupSchema),
    mode: "onTouched",
    defaultValues: {
      ...(initialGrade ? { grade: initialGrade } : {}),
      ...initialValues,
    },
  });

  useUnsavedChangesWarning(Object.keys(dirtyFields).length > 0);
  const isEdit = !!initialValues;

  // تجميع الصفوف حسب المرحلة
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
          grade: "الصف",
          academic_year: "السنة الدراسية",
          name: "اسم المجموعة",
          capacity: "السعة",
        }[field] ?? field;
      return err?.message ? `${label}: ${err.message}` : null;
    })
    .filter(Boolean) as string[];

  async function handleCreateGrade(values: GradeFormValues) {
    const created = await createGrade(values);
    await queryClient.invalidateQueries({ queryKey: ["grades"] });
    setValue("grade", created.id, { shouldValidate: true });
    setGradeModalOpen(false);
  }

  async function handleCreateYear(values: AcademicYearFormValues) {
    const created = await createAcademicYear(values);
    await queryClient.invalidateQueries({ queryKey: ["academic-years"] });
    setValue("academic_year", created.id, { shouldValidate: true });
    setYearModalOpen(false);
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <FormErrorSummary messages={isSubmitted ? errorMessages : []} />

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
                  disabled={gradesLoading}
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
              className="shrink-0 rounded-lg bg-paper-elevated px-4 py-2 text-sm font-medium text-ink border border-line hover:bg-paper-muted transition-colors"
            >
              + صف
            </button>
          </div>
          {errors.grade && <p className="text-xs text-danger">{errors.grade.message}</p>}
        </div>

        <Controller
          name="academic_year"
          control={control}
          render={({ field }) => (
            <SmartSelect
              label="السنة الدراسية *"
              value={field.value ?? ""}
              onChange={field.onChange}
              isLoading={yearsLoading}
              options={(years?.results ?? []).map((y) => ({
                value: y.id,
                label: y.name,
              }))}
              onCreateNew={() => setYearModalOpen(true)}
              createLabel="+ إضافة سنة"
              error={errors.academic_year?.message}
            />
          )}
        />

        <Input
          label="اسم المجموعة"
          hint="مثال: 1ث - أ، مجموعة الأحد والثلاثاء"
          required
          error={errors.name?.message}
          {...register("name")}
        />

        <Input
          label="السعة (اختياري)"
          type="number"
          min={1}
          hint="الحد الأقصى لعدد الطلاب — اتركه فارغًا لعدم التقييد"
          error={errors.capacity?.message}
          {...register("capacity")}
        />

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
        open={gradeModalOpen}
        onClose={() => setGradeModalOpen(false)}
        title="إضافة صف"
      >
        <GradeForm
          onSubmit={handleCreateGrade}
          onCancel={() => setGradeModalOpen(false)}
        />
      </QuickCreateModal>

      <QuickCreateModal
        open={yearModalOpen}
        onClose={() => setYearModalOpen(false)}
        title="إضافة سنة دراسية"
      >
        <AcademicYearForm
          onSubmit={handleCreateYear}
          onCancel={() => setYearModalOpen(false)}
        />
      </QuickCreateModal>
    </>
  );
}