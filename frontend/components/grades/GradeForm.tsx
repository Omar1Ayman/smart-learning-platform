"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { StageForm } from "@/components/stages/StageForm";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { SmartSelect } from "@/components/common/SmartSelect";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createStage, listStages } from "@/lib/api/stages";
import { gradeSchema, type GradeFormValues, type StageFormValues } from "@/lib/validation/schemas";

export function GradeForm({ onSubmit }: { onSubmit: (values: GradeFormValues) => Promise<void> }) {
  const [stageModalOpen, setStageModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: stages, isLoading: stagesLoading } = useQuery({ queryKey: ["stages"], queryFn: listStages });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<GradeFormValues>({ resolver: zodResolver(gradeSchema), defaultValues: { order: 1 } });

  async function handleCreateStage(values: StageFormValues) {
    const created = await createStage(values);
    await queryClient.invalidateQueries({ queryKey: ["stages"] });
    setValue("stage", created.id, { shouldValidate: true });
    setStageModalOpen(false);
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <Controller
          name="stage"
          control={control}
          render={({ field }) => (
            <SmartSelect
              label="المرحلة"
              value={field.value ?? ""}
              onChange={field.onChange}
              isLoading={stagesLoading}
              options={(stages?.results ?? []).map((s) => ({ value: s.id, label: s.name }))}
              onCreateNew={() => setStageModalOpen(true)}
              createLabel="+ إضافة مرحلة"
              error={errors.stage?.message}
            />
          )}
        />
        <Input label="اسم الصف (مثال: أولى ثانوي)" error={errors.name?.message} {...register("name")} />
        <Input label="الترتيب" type="number" min={1} error={errors.order?.message} {...register("order")} />
        <Button type="submit" disabled={isSubmitting} className="mt-2">
          {isSubmitting ? "جارٍ الحفظ..." : "حفظ"}
        </Button>
      </form>

      <QuickCreateModal open={stageModalOpen} onClose={() => setStageModalOpen(false)} title="إضافة مرحلة">
        <StageForm onSubmit={handleCreateStage} />
      </QuickCreateModal>
    </>
  );
}
