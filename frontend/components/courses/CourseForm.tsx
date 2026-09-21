"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { GradeForm } from "@/components/grades/GradeForm";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { SmartSelect } from "@/components/common/SmartSelect";
import { SubjectForm } from "@/components/subjects/SubjectForm";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { listGrades, createGrade } from "@/lib/api/grades";
import { listSubjects, createSubject } from "@/lib/api/subjects";
import type { CourseFormValues, GradeFormValues, SubjectFormValues } from "@/lib/validation/schemas";
import { courseSchema } from "@/lib/validation/schemas";

/**
 * Reference implementation for a *chain* of quick-creates (spec #17 lists
 * Course as one of the places this pattern must show up). Opening
 * "+ إضافة صف" here opens GradeForm in a modal; if that Grade needs a new
 * Stage too, GradeForm opens its own nested modal on top of this one —
 * three levels deep — and every level auto-selects into its parent and
 * closes without losing anything typed in the levels above it.
 */
export function CourseForm({ onSubmit }: { onSubmit: (values: CourseFormValues) => Promise<void> }) {
  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [gradeModalOpen, setGradeModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: subjects, isLoading: subjectsLoading } = useQuery({
    queryKey: ["subjects"],
    queryFn: listSubjects,
  });
  const { data: grades, isLoading: gradesLoading } = useQuery({ queryKey: ["grades"], queryFn: listGrades });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CourseFormValues>({ resolver: zodResolver(courseSchema) });

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

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <Controller
          name="subject"
          control={control}
          render={({ field }) => (
            <SmartSelect
              label="المادة"
              value={field.value ?? ""}
              onChange={field.onChange}
              isLoading={subjectsLoading}
              options={(subjects?.results ?? []).map((s) => ({ value: s.id, label: s.name }))}
              onCreateNew={() => setSubjectModalOpen(true)}
              createLabel="+ إضافة مادة"
              error={errors.subject?.message}
            />
          )}
        />
        <Controller
          name="grade"
          control={control}
          render={({ field }) => (
            <SmartSelect
              label="الصف"
              value={field.value ?? ""}
              onChange={field.onChange}
              isLoading={gradesLoading}
              options={(grades?.results ?? []).map((g) => ({ value: g.id, label: g.name }))}
              onCreateNew={() => setGradeModalOpen(true)}
              createLabel="+ إضافة صف"
              error={errors.grade?.message}
            />
          )}
        />
        <Input label="اسم الكورس" error={errors.name?.message} {...register("name")} />
        <Button type="submit" disabled={isSubmitting} className="mt-2">
          {isSubmitting ? "جارٍ الحفظ..." : "حفظ"}
        </Button>
      </form>

      <QuickCreateModal open={subjectModalOpen} onClose={() => setSubjectModalOpen(false)} title="إضافة مادة">
        <SubjectForm onSubmit={handleCreateSubject} />
      </QuickCreateModal>

      <QuickCreateModal open={gradeModalOpen} onClose={() => setGradeModalOpen(false)} title="إضافة صف">
        <GradeForm onSubmit={handleCreateGrade} />
      </QuickCreateModal>
    </>
  );
}
