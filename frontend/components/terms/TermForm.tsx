"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { AcademicYearForm } from "@/components/academic-years/AcademicYearForm";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { SmartSelect } from "@/components/common/SmartSelect";
import { FormErrorSummary } from "@/components/ui/FormErrorSummary";
import { FormFooter } from "@/components/ui/FormFooter";
import { Input } from "@/components/ui/Input";
import { createAcademicYear, listAcademicYears } from "@/lib/api/academicYears";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import {
  termSchema,
  type AcademicYearFormValues,
  type TermFormValues,
} from "@/lib/validation/schemas";

interface TermFormProps {
  onSubmit: (values: TermFormValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  initialValues?: Partial<TermFormValues>;
  keepOpen?: boolean;
  onKeepOpenChange?: (checked: boolean) => void;
}

export function TermForm({
  onSubmit,
  onCancel,
  submitLabel,
  initialValues,
  keepOpen = false,onKeepOpenChange
}: TermFormProps) {
  const [yearModalOpen, setYearModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: years, isLoading: yearsLoading } = useQuery({
    queryKey: ["academic-years"],
    queryFn: () => listAcademicYears(),
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting, dirtyFields, isSubmitted },
  } = useForm<z.input<typeof termSchema>, unknown, TermFormValues>({
    resolver: zodResolver(termSchema),
    mode: "onTouched",
    defaultValues: { order: 1, ...initialValues },
  });

  useUnsavedChangesWarning(Object.keys(dirtyFields).length > 0);
  const isEdit = !!initialValues;
  const buttonLabel = submitLabel ?? (isEdit ? "حفظ التعديلات" : "حفظ");

  const errorMessages = Object.entries(errors)
    .map(([field, err]) => {
      const label =
        {
          academic_year: "السنة الدراسية",
          name: "الاسم",
          start_date: "تاريخ البداية",
          end_date: "تاريخ النهاية",
          order: "الترتيب",
        }[field] ?? field;
      return err?.message ? `${label}: ${err.message}` : null;
    })
    .filter(Boolean) as string[];

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

        <Controller
          name="academic_year"
          control={control}
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
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
                createLabel="+ إضافة سنة دراسية"
                error={errors.academic_year?.message}
              />
              {!errors.academic_year && (
                <p className="text-xs text-ink-400">
                  السنة التي ينتمي إليها هذا الترم
                </p>
              )}
            </div>
          )}
        />

        <Input
          label="اسم الترم"
          hint="مثال: الترم الأول، الترم الثاني"
          required
          error={errors.name?.message}
          {...register("name")}
        />

        <Input
          label="تاريخ البداية"
          type="date"
          required
          error={errors.start_date?.message}
          {...register("start_date")}
        />

        <Input
          label="تاريخ النهاية"
          type="date"
          hint="يجب أن يكون بعد تاريخ البداية"
          required
          error={errors.end_date?.message}
          {...register("end_date")}
        />

        <Input
          label="الترتيب"
          type="number"
          min={1}
          hint="ترتيب ظهور الترم داخل السنة (1 = الأول)"
          required
          error={errors.order?.message}
          {...register("order")}
        />

        <FormFooter
          isSubmitting={isSubmitting}
          submitLabel={buttonLabel}
          showKeepOpen={!isEdit} // Only show in create mode
          keepOpen={keepOpen}
          onKeepOpenChange={onKeepOpenChange}
          onCancel={onCancel}
        />
      </form>

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