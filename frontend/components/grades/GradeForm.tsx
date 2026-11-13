"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { StageForm } from "@/components/stages/StageForm";
import { Button } from "@/components/ui/Button";
import { FormErrorSummary } from "@/components/ui/FormErrorSummary";
import { FormFooter } from "@/components/ui/FormFooter";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { createStage, listStages } from "@/lib/api/stages";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import {
  gradeSchema,
  type GradeFormValues,
  type StageFormValues,
} from "@/lib/validation/schemas";

interface GradeFormProps {
  onSubmit: (values: GradeFormValues) => Promise<void>;
  onCancel?: () => void;
  initialValues?: Partial<GradeFormValues>;
  // ─── Save & Add Another ───
  keepOpen?: boolean;
  onKeepOpenChange?: (checked: boolean) => void;
}

export function GradeForm({
  onSubmit,
  onCancel,
  initialValues,
  keepOpen = false,
  onKeepOpenChange,
}: GradeFormProps) {
  const [stageModalOpen, setStageModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: stages, isLoading: stagesLoading } = useQuery({
    queryKey: ["stages"],
    queryFn: () => listStages(),
  });

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting, dirtyFields, isSubmitted },
  } = useForm<z.input<typeof gradeSchema>, unknown, GradeFormValues>({
    resolver: zodResolver(gradeSchema),
    mode: "onTouched",
    defaultValues: { order: 1, ...initialValues },
  });

  useUnsavedChangesWarning(Object.keys(dirtyFields).length > 0);
  const isEdit = !!initialValues;
  
  const errorMessages = Object.entries(errors)
    .map(([field, err]) => {
      const label =
        { stage: "المرحلة", name: "اسم الصف", order: "الترتيب" }[field] ??
        field;
      return err?.message ? `${label}: ${err.message}` : null;
    })
    .filter(Boolean) as string[];

  async function handleCreateStage(values: StageFormValues) {
    const created = await createStage(values);
    await queryClient.invalidateQueries({ queryKey: ["stages"] });
    setValue("stage", created.id, { shouldValidate: true });
    setStageModalOpen(false);
  }

  return (
    <>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormErrorSummary messages={isSubmitted ? errorMessages : []} />

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Select
              label="المرحلة"
              required
              options={(stages?.results ?? []).map((s) => ({
                value: s.id,
                label: s.name,
              }))}
              placeholder={
                stagesLoading ? "جارٍ التحميل..." : "اختر المرحلة"
              }
              disabled={stagesLoading}
              error={errors.stage?.message}
              {...register("stage")}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setStageModalOpen(true)}
            className="shrink-0"
          >
            + جديدة
          </Button>
        </div>

        <Input
          label="اسم الصف"
          hint="مثال: أولى ثانوي، الصف الأول"
          required
          error={errors.name?.message}
          {...register("name")}
        />

        <Input
          label="الترتيب"
          type="number"
          min={1}
          hint="ترتيب ظهور الصف في القوائم (1 = الأول)"
          required
          error={errors.order?.message}
          {...register("order")}
        />

        <FormFooter
          isSubmitting={isSubmitting}
          submitLabel={isEdit ? "حفظ التعديلات" : "حفظ"}
          onCancel={onCancel}
          showKeepOpen={!isEdit} // Only show in create mode
          keepOpen={keepOpen}
          onKeepOpenChange={onKeepOpenChange}
        />
      </form>

      <QuickCreateModal
        open={stageModalOpen}
        onClose={() => setStageModalOpen(false)}
        title="إضافة مرحلة"
      >
        <StageForm
          onSubmit={handleCreateStage}
          onCancel={() => setStageModalOpen(false)}
        />
      </QuickCreateModal>
    </>
  );
}