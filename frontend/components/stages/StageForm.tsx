"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FormErrorSummary } from "@/components/ui/FormErrorSummary";
import { FormFooter } from "@/components/ui/FormFooter";
import { Input } from "@/components/ui/Input";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import { stageSchema, type StageFormValues } from "@/lib/validation/schemas";

interface StageFormProps {
  onSubmit: (values: StageFormValues) => Promise<void>;
  onCancel?: () => void;
  initialValues?: Partial<StageFormValues>;
  keepOpen?: boolean;
  onKeepOpenChange?: (checked: boolean) => void;
}

export function StageForm({ onSubmit, onCancel, initialValues ,keepOpen = false, onKeepOpenChange}: StageFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, dirtyFields, isSubmitted },
  } = useForm<z.input<typeof stageSchema>, unknown, StageFormValues>({
    resolver: zodResolver(stageSchema),
    mode: "onTouched", // inline validation on blur
    defaultValues: { order: 1, ...initialValues },
  });

  useUnsavedChangesWarning(Object.keys(dirtyFields).length > 0);
  const isEdit = !!initialValues;

  const errorMessages = Object.entries(errors)
    .map(([field, err]) => {
      const label =
        { name: "الاسم", order: "الترتيب" }[field] ?? field;
      return err?.message ? `${label}: ${err.message}` : null;
    })
    .filter(Boolean) as string[];

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <FormErrorSummary messages={isSubmitted ? errorMessages : []} />

      <Input
        label="اسم المرحلة"
        hint="مثال: الثانوية، الإعدادية"
        required
        error={errors.name?.message}
        {...register("name")}
      />

      <Input
        label="الترتيب"
        type="number"
        min={1}
        hint="ترتيب ظهور المرحلة في القوائم (1 = الأولى)"
        required
        error={errors.order?.message}
        {...register("order")}
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
  );
}