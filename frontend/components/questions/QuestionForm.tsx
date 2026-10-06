"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { QuestionBankForm } from "@/components/questions/QuestionBankForm";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { SmartSelect } from "@/components/common/SmartSelect";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createQuestionBank, listQuestionBanks } from "@/lib/api/questions";
import { questionSchema, type QuestionBankFormValues, type QuestionFormValues } from "@/lib/validation/schemas";

const TYPE_LABEL: Record<string, string> = {
  MCQ: "اختيار من متعدد",
  TRUE_FALSE: "صح / خطأ",
  SHORT_ANSWER: "إجابة قصيرة",
  ESSAY: "مقالي",
};

interface QuestionFormProps {
  onSubmit: (values: QuestionFormValues) => Promise<void>;
}

export function QuestionForm({ onSubmit }: QuestionFormProps) {
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: banks, isLoading: banksLoading } = useQuery({
    queryKey: ["question-banks"],
    queryFn: listQuestionBanks,
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<QuestionFormValues>({
    resolver: zodResolver(questionSchema),
    defaultValues: { difficulty: "MEDIUM", points: 1, options: [] },
  });

  const { fields, append, remove, replace } = useFieldArray({ control, name: "options" });
  const questionType = useWatch({ control, name: "question_type" });
  const needsOptions = questionType === "MCQ" || questionType === "TRUE_FALSE";
  const needsAcceptedAnswers = questionType === "SHORT_ANSWER";

  async function handleCreateBank(values: QuestionBankFormValues) {
    const created = await createQuestionBank(values);
    await queryClient.invalidateQueries({ queryKey: ["question-banks"] });
    setValue("bank", created.id, { shouldValidate: true });
    setBankModalOpen(false);
  }

  function handleTypeChange(type: string) {
    setValue("question_type", type as QuestionFormValues["question_type"]);
    if (type === "TRUE_FALSE") {
      replace([
        { text: "صح", is_correct: true },
        { text: "خطأ", is_correct: false },
      ]);
    } else if (type === "MCQ" && fields.length === 0) {
      replace([
        { text: "", is_correct: true },
        { text: "", is_correct: false },
      ]);
    } else if (type === "SHORT_ANSWER" || type === "ESSAY") {
      replace([]);
    }
  }

  return (
    <>
      <form
        onSubmit={handleSubmit((values) =>
          onSubmit({
            ...values,
            options: needsOptions ? values.options : undefined,
          })
        )}
        className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto"
        noValidate
      >
        <Controller
          name="bank"
          control={control}
          render={({ field }) => (
            <SmartSelect
              label="بنك الأسئلة"
              value={field.value ?? ""}
              onChange={field.onChange}
              isLoading={banksLoading}
              options={(banks?.results ?? []).map((b) => ({ value: b.id, label: b.name }))}
              onCreateNew={() => setBankModalOpen(true)}
              createLabel="+ إضافة بنك"
              error={errors.bank?.message}
            />
          )}
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink-700">نوع السؤال</label>
          <select
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
            onChange={(e) => handleTypeChange(e.target.value)}
            defaultValue=""
          >
            <option value="" disabled>
              اختر نوعًا
            </option>
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {errors.question_type && <p className="text-xs text-danger">{errors.question_type.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink-700">نص السؤال</label>
          <textarea
            rows={3}
            className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ink"
            {...register("text")}
          />
          {errors.text && <p className="text-xs text-danger">{errors.text.message}</p>}
        </div>

        {needsOptions && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-ink-700">
              الاختيارات <span className="font-normal text-ink-400">(حدّد الإجابة الصحيحة)</span>
            </label>
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct-option"
                  checked={!!field.is_correct}
                  onChange={() => {
                    fields.forEach((_, i) => setValue(`options.${i}.is_correct`, i === index));
                  }}
                />
                <input
                  className="flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ink"
                  placeholder={`اختيار ${index + 1}`}
                  {...register(`options.${index}.text` as const)}
                />
                {questionType === "MCQ" && fields.length > 2 && (
                  <Button type="button" variant="ghost" onClick={() => remove(index)}>
                    حذف
                  </Button>
                )}
              </div>
            ))}
            {questionType === "MCQ" && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => append({ text: "", is_correct: false })}
                className="self-start"
              >
                + إضافة اختيار
              </Button>
            )}
            {errors.options && <p className="text-xs text-danger">{errors.options.message as string}</p>}
          </div>
        )}

        {needsAcceptedAnswers && (
          <Input
            label="الإجابات المقبولة (افصل بينها بفاصلة)"
            error={errors.accepted_answers_text?.message}
            {...register("accepted_answers_text")}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-700">الصعوبة</label>
            <select
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
              {...register("difficulty")}
            >
              <option value="EASY">سهل</option>
              <option value="MEDIUM">متوسط</option>
              <option value="HARD">صعب</option>
            </select>
          </div>
          <Input label="النقاط" type="number" step="0.5" min={0.5} {...register("points")} />
        </div>

        <Button type="submit" disabled={isSubmitting} className="mt-2">
          {isSubmitting ? "جارٍ الحفظ..." : "حفظ (سيُرسل للمراجعة)"}
        </Button>
      </form>

      <QuickCreateModal open={bankModalOpen} onClose={() => setBankModalOpen(false)} title="إضافة بنك أسئلة">
        <QuestionBankForm onSubmit={handleCreateBank} />
      </QuickCreateModal>
    </>
  );
}
