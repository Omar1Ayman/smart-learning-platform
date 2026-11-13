"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { FormErrorSummary } from "@/components/ui/FormErrorSummary";
import { FormFooter } from "@/components/ui/FormFooter";
import { Input } from "@/components/ui/Input";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import {
  academicYearSchema,
  type AcademicYearFormValues,
} from "@/lib/validation/schemas";

interface AcademicYearFormProps {
  onSubmit: (values: AcademicYearFormValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  initialValues?: Partial<AcademicYearFormValues>;
}

export function AcademicYearForm({
  onSubmit,
  onCancel,
  submitLabel,
  initialValues,
}: AcademicYearFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, dirtyFields, isSubmitted },
  } = useForm<AcademicYearFormValues>({
    resolver: zodResolver(academicYearSchema),
    mode: "onTouched",
    defaultValues: { ...initialValues },
  });

  useUnsavedChangesWarning(Object.keys(dirtyFields).length > 0);
  const isEdit = !!initialValues;
  const buttonLabel = submitLabel ?? (isEdit ? "حفظ التعديلات" : "حفظ");

  const errorMessages = Object.entries(errors)
    .map(([field, err]) => {
      const label =
        {
          name: "الاسم",
          start_date: "تاريخ البداية",
          end_date: "تاريخ النهاية",
        }[field] ?? field;
      return err?.message ? `${label}: ${err.message}` : null;
    })
    .filter(Boolean) as string[];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <FormErrorSummary messages={isSubmitted ? errorMessages : []} />

      <Input
        label="اسم السنة"
        hint="مثال: 2026/2027"
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

      <FormFooter
        isSubmitting={isSubmitting}
        submitLabel={buttonLabel}
        onCancel={onCancel}
      />
    </form>
  );
}