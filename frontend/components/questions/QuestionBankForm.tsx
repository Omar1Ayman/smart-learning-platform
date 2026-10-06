"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { questionBankSchema, type QuestionBankFormValues } from "@/lib/validation/schemas";

export function QuestionBankForm({ onSubmit }: { onSubmit: (values: QuestionBankFormValues) => Promise<void> }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<QuestionBankFormValues>({ resolver: zodResolver(questionBankSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <Input label="اسم بنك الأسئلة" error={errors.name?.message} {...register("name")} />
      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? "جارٍ الحفظ..." : "حفظ"}
      </Button>
    </form>
  );
}
