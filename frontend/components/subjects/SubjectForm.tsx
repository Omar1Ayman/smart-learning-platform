"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { FormErrorSummary } from "@/components/ui/FormErrorSummary";
import { FormFooter } from "@/components/ui/FormFooter";
import { Input } from "@/components/ui/Input";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import { subjectSchema, type SubjectFormValues } from "@/lib/validation/schemas";

interface SubjectFormProps {
  onSubmit: (values: SubjectFormValues) => Promise<void>;
  onCancel?: () => void;
  initialValues?: Partial<SubjectFormValues>;
  keepOpen?: boolean;
  onKeepOpenChange?: (checked: boolean) => void;
}

export function SubjectForm({ onSubmit, onCancel, initialValues , keepOpen = false,onKeepOpenChange }: SubjectFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, dirtyFields, isSubmitted },
  } = useForm<SubjectFormValues>({
    resolver: zodResolver(subjectSchema),
    mode: "onTouched",
    defaultValues: { ...initialValues },
  });

  useUnsavedChangesWarning(Object.keys(dirtyFields).length > 0);
  const isEdit = !!initialValues;

  const errorMessages = Object.entries(errors)
    .map(([field, err]) => {
      const label = { name: "الاسم", code: "الكود" }[field] ?? field;
      return err?.message ? `${label}: ${err.message}` : null;
    })
    .filter(Boolean) as string[];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <FormErrorSummary messages={isSubmitted ? errorMessages : []} />

      <Input
        label="اسم المادة"
        hint="مثال: أحياء، رياضيات، لغة عربية"
        required
        error={errors.name?.message}
        {...register("name")}
      />

      <Input
        label="الكود (اختياري)"
        hint="رمز مختصر للمرجعية الداخلية — مثال: BIO-101"
        error={errors.code?.message}
        {...register("code")}
      />

      <FormFooter
        isSubmitting={isSubmitting}
        showKeepOpen={!isEdit} // Only show in create mode
        keepOpen={keepOpen}
        onKeepOpenChange={onKeepOpenChange}
        submitLabel={isEdit ? "حفظ التعديلات" : "حفظ"}
        onCancel={onCancel}
      />
    </form>
  );
}