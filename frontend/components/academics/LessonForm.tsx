"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FormErrorSummary } from "@/components/ui/FormErrorSummary";
import { FormFooter } from "@/components/ui/FormFooter";
import { Input } from "@/components/ui/Input";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";

const lessonSchema = z.object({
  name: z.string().min(1, "الاسم مطلوب").max(150),
  order: z.coerce.number().int().min(1, "الترتيب يجب أن يكون 1 أو أكثر").default(1),
});

export type LessonFormValues = z.infer<typeof lessonSchema>;

interface LessonFormProps {
  onSubmit: (values: LessonFormValues) => Promise<void>;
  onCancel?: () => void;
  defaultOrder?: number;
  initialValues?: Partial<LessonFormValues>;
}

export function LessonForm({
  onSubmit,
  onCancel,
  defaultOrder = 1,
  initialValues,
}: LessonFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, dirtyFields, isSubmitted },
  } = useForm<z.input<typeof lessonSchema>, unknown, LessonFormValues>({
    resolver: zodResolver(lessonSchema),
    mode: "onTouched",
    defaultValues: { order: defaultOrder, ...initialValues },
  });

  useUnsavedChangesWarning(Object.keys(dirtyFields).length > 0);
  const isEdit = !!initialValues;

  const errorMessages = Object.entries(errors)
    .map(([field, err]) => {
      const label = { name: "الاسم", order: "الترتيب" }[field] ?? field;
      return err?.message ? `${label}: ${err.message}` : null;
    })
    .filter(Boolean) as string[];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <FormErrorSummary messages={isSubmitted ? errorMessages : []} />

      <Input
        label="اسم الدرس"
        hint="مثال: المعادلات الخطية، المتباينات"
        required
        error={errors.name?.message}
        {...register("name")}
      />

      <Input
        label="الترتيب"
        type="number"
        min={1}
        hint="ترتيب ظهور الدرس داخل الفصل"
        required
        error={errors.order?.message}
        {...register("order")}
      />

      <FormFooter
        isSubmitting={isSubmitting}
        submitLabel={isEdit ? "حفظ التعديلات" : "حفظ"}
        onCancel={onCancel}
      />
    </form>
  );
}