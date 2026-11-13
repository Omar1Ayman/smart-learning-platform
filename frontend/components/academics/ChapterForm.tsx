"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FormErrorSummary } from "@/components/ui/FormErrorSummary";
import { FormFooter } from "@/components/ui/FormFooter";
import { Input } from "@/components/ui/Input";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";

const chapterSchema = z.object({
  name: z.string().min(1, "الاسم مطلوب").max(150),
  order: z.coerce.number().int().min(1, "الترتيب يجب أن يكون 1 أو أكثر").default(1),
});

export type ChapterFormValues = z.infer<typeof chapterSchema>;

interface ChapterFormProps {
  onSubmit: (values: ChapterFormValues) => Promise<void>;
  onCancel?: () => void;
  defaultOrder?: number;
  initialValues?: Partial<ChapterFormValues>;
}

export function ChapterForm({
  onSubmit,
  onCancel,
  defaultOrder = 1,
  initialValues,
}: ChapterFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, dirtyFields, isSubmitted },
  } = useForm<z.input<typeof chapterSchema>, unknown, ChapterFormValues>({
    resolver: zodResolver(chapterSchema),
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
        label="اسم فصل المنهج"
        hint="مثال: الفصل الأول، الجبر، الوحدة الأولى"
        required
        error={errors.name?.message}
        {...register("name")}
      />

      <Input
        label="الترتيب"
        type="number"
        min={1}
        hint="ترتيب ظهور الفصل داخل المادة"
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