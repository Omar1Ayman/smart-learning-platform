"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { FormErrorSummary } from "@/components/ui/FormErrorSummary";
import { FormFooter } from "@/components/ui/FormFooter";
import { Input } from "@/components/ui/Input";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import {
  questionBankSchema,
  type QuestionBankFormValues,
} from "@/lib/validation/schemas";

interface QuestionBankFormProps {
  onSubmit: (values: QuestionBankFormValues) => Promise<void>;
  onCancel?: () => void;
  initialValues?: Partial<QuestionBankFormValues>;
}

export function QuestionBankForm({
  onSubmit,
  onCancel,
  initialValues,
}: QuestionBankFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, dirtyFields, isSubmitted },
  } = useForm<QuestionBankFormValues>({
    resolver: zodResolver(questionBankSchema),
    mode: "onTouched",
    defaultValues: { ...initialValues },
  });

  useUnsavedChangesWarning(Object.keys(dirtyFields).length > 0);
  const isEdit = !!initialValues;

  const errorMessages = Object.entries(errors)
    .map(([field, err]) => {
      const label = { name: "الاسم", description: "الوصف" }[field] ?? field;
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
        label="اسم البنك"
        hint="مثال: بنك أسئلة الرياضيات — الأول الثانوي"
        required
        error={errors.name?.message}
        {...register("name")}
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-ink">الوصف</label>
        <textarea
          rows={3}
          placeholder="وصف اختياري للبنك..."
          className={`rounded-lg border bg-paper-elevated px-3 py-2 text-sm text-ink outline-none transition-all focus:border-ink focus:ring-2 focus:ring-ink/10 ${
            errors.description ? "border-danger" : "border-line"
          }`}
          {...register("description")}
        />
        {errors.description && (
          <p className="text-xs text-danger">{errors.description.message}</p>
        )}
      </div>

      <FormFooter
        isSubmitting={isSubmitting}
        submitLabel={isEdit ? "حفظ التعديلات" : "حفظ"}
        onCancel={onCancel}
      />
    </form>
  );
}