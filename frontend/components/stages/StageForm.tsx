"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { stageSchema, type StageFormValues } from "@/lib/validation/schemas";

export function StageForm({ onSubmit }: { onSubmit: (values: StageFormValues) => Promise<void> }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StageFormValues>({ resolver: zodResolver(stageSchema), defaultValues: { order: 1 } });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <Input label="اسم المرحلة (مثال: الثانوية)" error={errors.name?.message} {...register("name")} />
      <Input label="الترتيب" type="number" min={1} error={errors.order?.message} {...register("order")} />
      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? "جارٍ الحفظ..." : "حفظ"}
      </Button>
    </form>
  );
}
