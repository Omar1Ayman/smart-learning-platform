"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { AcademicYearForm } from "@/components/academic-years/AcademicYearForm";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { SmartSelect } from "@/components/common/SmartSelect";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createAcademicYear, listAcademicYears } from "@/lib/api/academicYears";
import { termSchema, type TermFormValues } from "@/lib/validation/schemas";
import type { AcademicYearFormValues } from "@/lib/validation/schemas";

interface TermFormProps {
  onSubmit: (values: TermFormValues) => Promise<void>;
  submitLabel?: string;
}

/**
 * Reference implementation of spec #16: creating a Term needs an Academic
 * Year, but the person shouldn't have to abandon this form, go create one
 * elsewhere, then come back. The nested QuickCreateModal handles it
 * in-place — on success the new year is auto-selected here and every
 * other field the person already filled in (name, dates, order) is left
 * exactly as it was.
 */
export function TermForm({ onSubmit, submitLabel = "حفظ" }: TermFormProps) {
  const [yearModalOpen, setYearModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: years, isLoading: yearsLoading } = useQuery({
    queryKey: ["academic-years"],
    queryFn: listAcademicYears,
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TermFormValues>({ resolver: zodResolver(termSchema), defaultValues: { order: 1 } });

  async function handleCreateYear(values: AcademicYearFormValues) {
    const created = await createAcademicYear(values);
    await queryClient.invalidateQueries({ queryKey: ["academic-years"] });
    setValue("academic_year", created.id, { shouldValidate: true }); // auto-select, spec #16
    setYearModalOpen(false);
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <Controller
          name="academic_year"
          control={control}
          render={({ field }) => (
            <SmartSelect
              label="السنة الدراسية"
              value={field.value ?? ""}
              onChange={field.onChange}
              isLoading={yearsLoading}
              options={(years?.results ?? []).map((y) => ({ value: y.id, label: y.name }))}
              onCreateNew={() => setYearModalOpen(true)}
              createLabel="+ إضافة سنة دراسية"
              error={errors.academic_year?.message}
            />
          )}
        />
        <Input label="اسم الترم (مثال: الترم الأول)" error={errors.name?.message} {...register("name")} />
        <Input label="تاريخ البداية" type="date" error={errors.start_date?.message} {...register("start_date")} />
        <Input label="تاريخ النهاية" type="date" error={errors.end_date?.message} {...register("end_date")} />
        <Input label="الترتيب" type="number" min={1} error={errors.order?.message} {...register("order")} />
        <Button type="submit" disabled={isSubmitting} className="mt-2">
          {isSubmitting ? "جارٍ الحفظ..." : submitLabel}
        </Button>
      </form>

      {/* Nested inside the Term form, on top of it — the person never
          navigates away. */}
      <QuickCreateModal open={yearModalOpen} onClose={() => setYearModalOpen(false)} title="إضافة سنة دراسية">
        <AcademicYearForm onSubmit={handleCreateYear} />
      </QuickCreateModal>
    </>
  );
}
