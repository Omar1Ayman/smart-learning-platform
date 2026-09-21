"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { academicYearSchema, type AcademicYearFormValues } from "@/lib/validation/schemas";

interface AcademicYearFormProps {
  onSubmit: (values: AcademicYearFormValues) => Promise<void>;
  submitLabel?: string;
}

export function AcademicYearForm({ onSubmit, submitLabel = "حفظ" }: AcademicYearFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AcademicYearFormValues>({ resolver: zodResolver(academicYearSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <Input label="الاسم (مثال: 2026/2027)" error={errors.name?.message} {...register("name")} />
      <Input label="تاريخ البداية" type="date" error={errors.start_date?.message} {...register("start_date")} />
      <Input label="تاريخ النهاية" type="date" error={errors.end_date?.message} {...register("end_date")} />
      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? "جارٍ الحفظ..." : submitLabel}
      </Button>
    </form>
  );
}
