"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { subjectSchema, type SubjectFormValues } from "@/lib/validation/schemas";

export function SubjectForm({ onSubmit }: { onSubmit: (values: SubjectFormValues) => Promise<void> }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SubjectFormValues>({ resolver: zodResolver(subjectSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <Input label="اسم المادة (مثال: أحياء)" error={errors.name?.message} {...register("name")} />
      <Input label="الكود (اختياري)" error={errors.code?.message} {...register("code")} />
      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? "جارٍ الحفظ..." : "حفظ"}
      </Button>
    </form>
  );
}
