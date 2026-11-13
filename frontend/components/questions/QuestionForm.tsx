"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { SmartSelect } from "@/components/common/SmartSelect";
import { QuestionBankForm } from "@/components/questions/QuestionBankForm";
import { Button } from "@/components/ui/Button";
import { Check, Info, X } from "@/components/ui/icons";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { createQuestionBank, listQuestionBanks } from "@/lib/api/questions";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import {
  questionSchema,
  type QuestionBankFormValues,
  type QuestionFormValues,
} from "@/lib/validation/schemas";

const TYPE_LABEL: Record<string, string> = {
  MCQ: "اختيار من متعدد",
  TRUE_FALSE: "صح / خطأ",
  SHORT_ANSWER: "إجابة قصيرة",
  ESSAY: "مقالي",
};

const DIFFICULTY_LABEL: Record<string, string> = {
  EASY: "سهل",
  MEDIUM: "متوسط",
  HARD: "صعب",
};

const TRUE_FALSE_CANONICAL: Array<{ text: string; is_correct: boolean }> = [
  { text: "صح", is_correct: true },
  { text: "خطأ", is_correct: false },
];

interface QuestionFormProps {
  onSubmit: (values: QuestionFormValues) => Promise<void>;
  onCancel?: () => void;
  initialValues?: {
    bank: string;
    text: string;
    question_type: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "ESSAY";
    difficulty: "EASY" | "MEDIUM" | "HARD";
    topic: string;
    points: number;
    accepted_answers_text: string;
    options: { text: string; is_correct: boolean }[];
  };
  submitLabel?: string;
  /**
   * Batch 16: pre-select a question type when opened from the type
   * picker. Ignored when `initialValues` is provided (edit mode).
   */
  initialType?: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "ESSAY";
}

function normalizeTrueFalseOptions(
  options: Array<{ text: string; is_correct: boolean }> | undefined
): Array<{ text: string; is_correct: boolean }> {
  if (!options || options.length !== 2) return TRUE_FALSE_CANONICAL;
  const correct = options.find((o) => o.is_correct);
  const correctIsFalse = correct && correct.text.trim() === "خطأ";
  return correctIsFalse
    ? [
        { text: "صح", is_correct: false },
        { text: "خطأ", is_correct: true },
      ]
    : TRUE_FALSE_CANONICAL;
}

export function QuestionForm({
  onSubmit,
  onCancel,
  initialValues,
  submitLabel,
  initialType,
}: QuestionFormProps) {
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const isEdit = !!initialValues;

  const { data: banks, isLoading: banksLoading } = useQuery({
    queryKey: ["question-banks"],
    queryFn: () => listQuestionBanks(),
  });

  const normalizedInitial = initialValues
    ? {
        ...initialValues,
        options:
          initialValues.question_type === "TRUE_FALSE"
            ? normalizeTrueFalseOptions(initialValues.options)
            : initialValues.options,
      }
    : undefined;

  const computedDefaults = (() => {
    if (initialValues) return normalizedInitial;
    const base = { difficulty: "MEDIUM" as const, points: 1 };
    if (initialType === "TRUE_FALSE") {
      return {
        ...base,
        question_type: "TRUE_FALSE" as const,
        options: TRUE_FALSE_CANONICAL.map((o) => ({ ...o })),
      };
    }
    if (initialType === "MCQ") {
      return {
        ...base,
        question_type: "MCQ" as const,
        options: [
          { text: "", is_correct: true },
          { text: "", is_correct: false },
        ],
      };
    }
    if (initialType === "SHORT_ANSWER" || initialType === "ESSAY") {
      return {
        ...base,
        question_type: initialType,
        options: [],
      };
    }
    return base;
  })();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting, dirtyFields, isSubmitted },
  } = useForm<z.input<typeof questionSchema>, unknown, QuestionFormValues>({
    resolver: zodResolver(questionSchema),
    mode: "onTouched",
    defaultValues: computedDefaults,
  });


  useUnsavedChangesWarning(Object.keys(dirtyFields).length > 0);

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "options",
  });

  // `fields` is a static snapshot — reads via useWatch for live values.
  const watchedOptions = useWatch({ control, name: "options" }) ?? [];

  const questionType = useWatch({ control, name: "question_type" });
  const needsOptions = questionType === "MCQ" || questionType === "TRUE_FALSE";
  const needsAcceptedAnswers = questionType === "SHORT_ANSWER";
  const isTrueFalse = questionType === "TRUE_FALSE";

  const optionsRootError =
    (errors.options as { root?: { message?: string } } | undefined)?.root
      ?.message ??
    (errors.options as { message?: string } | undefined)?.message;

  const errorMessages = Object.entries(errors)
    .map(([field, err]) => {
      const label =
        {
          bank: "بنك الأسئلة",
          text: "نص السؤال",
          question_type: "نوع السؤال",
          difficulty: "الصعوبة",
          points: "النقاط",
          accepted_answers_text: "الإجابات المقبولة",
          options: "الاختيارات",
        }[field] ?? field;
      const message =
        field === "options"
          ? optionsRootError
          : (err as { message?: string } | undefined)?.message;
      return message ? `${label}: ${message}` : null;
    })
    .filter(Boolean) as string[];

  async function handleCreateBank(values: QuestionBankFormValues) {
    const created = await createQuestionBank(values);
    await queryClient.invalidateQueries({ queryKey: ["question-banks"] });
    setValue("bank", created.id, { shouldValidate: true });
    setBankModalOpen(false);
  }

  function handleTypeChange(type: string) {
    const newType = type as QuestionFormValues["question_type"];

    if (newType === "TRUE_FALSE") {
      replace(TRUE_FALSE_CANONICAL.map((o) => ({ ...o })));
    } else if (newType === "MCQ") {
      replace([
        { text: "", is_correct: true },
        { text: "", is_correct: false },
      ]);
    } else if (newType === "SHORT_ANSWER" || newType === "ESSAY") {
      replace([]);
    }

    setValue("question_type", newType, { shouldValidate: false });
  }

  function handleToggleCorrect(index: number) {
    // FIX: iterate over `watchedOptions.length`, NOT `fields.length`.
    // `fields` is a stale snapshot that only updates after append/replace/
    // remove rerender — a just-appended option is not in `fields` yet.
    // Iterating over `fields` would miss it → radio state silently wrong.
    const optionCount = watchedOptions.length;
    for (let i = 0; i < optionCount; i++) {
      setValue(`options.${i}.is_correct`, i === index, {
        shouldValidate: false,
        shouldDirty: true,
      });
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
        className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pe-1"
        noValidate
      >
        {isSubmitted && errorMessages.length > 0 && (
          <div className="p-3 text-sm border rounded-lg border-danger/30 bg-danger/5 text-danger">
            <p className="font-medium">
              يرجى تصحيح {errorMessages.length} حقل قبل الحفظ:
            </p>
            <ul className="mt-1 list-disc space-y-0.5 ps-5 text-xs">
              {errorMessages.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        <Controller
          name="bank"
          control={control}
          render={({ field }) => (
            <SmartSelect
              label="بنك الأسئلة *"
              value={field.value ?? ""}
              onChange={field.onChange}
              isLoading={banksLoading}
              options={(banks?.results ?? []).map((b) => ({
                value: b.id,
                label: b.name,
              }))}
              onCreateNew={() => setBankModalOpen(true)}
              createLabel="+ إضافة بنك"
              error={errors.bank?.message}
            />
          )}
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">
            نوع السؤال <span className="text-danger">*</span>
          </label>
          <Controller
            name="question_type"
            control={control}
            render={({ field }) => (
              <select
                value={field.value ?? ""}
                onChange={(e) => {
                  field.onChange(e.target.value);
                  handleTypeChange(e.target.value);
                }}
                disabled={isEdit}
                className="px-3 py-2 text-sm transition-all bg-paper-elevated border rounded-lg outline-none border-line text-ink focus:border-ink focus:ring-2 focus:ring-ink/10 disabled:bg-paper-muted disabled:text-ink-400"
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
            )}
          />
          {errors.question_type && (
            <p className="text-xs text-danger">{errors.question_type.message}</p>
          )}
          {isEdit && (
            <p className="text-xs text-ink-400">
              لا يمكن تغيير نوع السؤال بعد إنشائه.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">
            نص السؤال <span className="text-danger">*</span>
          </label>
          <textarea
            rows={3}
            placeholder={
              isTrueFalse
                ? "مثال: الشمس تشرق من الشرق."
                : "اكتب نص السؤال بالكامل..."
            }
            className={`rounded-lg border bg-paper-elevated px-3 py-2 text-sm text-ink outline-none transition-all focus:border-ink focus:ring-2 focus:ring-ink/10 ${
              errors.text ? "border-danger" : "border-line"
            }`}
            {...register("text")}
          />
          {errors.text && (
            <p className="text-xs text-danger">{errors.text.message}</p>
          )}
        </div>

        {needsOptions && (
          <div className="flex flex-col gap-2">
            <div>
              <label className="text-sm font-medium text-ink">
                {isTrueFalse ? "الإجابة الصحيحة" : "الاختيارات"}{" "}
                <span className="font-normal text-ink-400">
                  {isTrueFalse
                    ? "(اختر 'صح' أو 'خطأ')"
                    : "(حدّد الإجابة الصحيحة)"}
                </span>
              </label>
              {isTrueFalse && (
                <p className="mt-1 flex items-start gap-1.5 rounded-md bg-info/5 px-2 py-1.5 text-xs text-info">
                  <Info size={12} className="mt-0.5 shrink-0" />
                  النصان &quot;صح&quot; و &quot;خطأ&quot; ثابتان — لا يمكن
                  تعديلهما. اختر الإجابة الصحيحة فقط:
                  <strong className="mx-1">صح</strong>
                  (السؤال صحيح) أو
                  <strong className="mx-1">خطأ</strong>
                  (السؤال غير صحيح).
                </p>
              )}
            </div>

            {fields.map((field, index) => {
              const isSelectedCorrect =
                watchedOptions[index]?.is_correct ?? false;

              return (
                <div
                  key={field.id}
                  className={`flex items-center gap-2 rounded-lg border p-2 transition-colors ${
                    isSelectedCorrect && isTrueFalse
                      ? "border-success/40 bg-success/5"
                      : "border-transparent"
                  }`}
                >
                  <input
                    type="radio"
                    name="correct-option"
                    checked={isSelectedCorrect}
                    onChange={() => handleToggleCorrect(index)}
                    className="w-4 h-4 cursor-pointer shrink-0 accent-ink"
                    aria-label={`تحديد ${
                      watchedOptions[index]?.text || `اختيار ${index + 1}`
                    } كإجابة صحيحة`}
                  />
                  <input
                    className={`flex-1 rounded-md border px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-ink/10 ${
                      isTrueFalse
                        ? "cursor-default select-none border-transparent bg-paper-muted font-medium text-ink"
                        : `border-line bg-paper-elevated text-ink focus:border-ink ${
                            errors.options?.[index]?.text ? "border-danger" : ""
                          }`
                    }`}
                    placeholder={isTrueFalse ? "" : `اختيار ${index + 1}`}
                    readOnly={isTrueFalse}
                    aria-readonly={isTrueFalse}
                    tabIndex={isTrueFalse ? -1 : undefined}
                    {...register(`options.${index}.text` as const)}
                  />
                  {isTrueFalse && isSelectedCorrect && (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-success/15 text-success">
                      <Check size={14} />
                    </span>
                  )}
                  {!isTrueFalse && fields.length > 2 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="flex items-center justify-center transition-colors rounded-md h-7 w-7 text-ink-400 hover:bg-danger/5 hover:text-danger"
                      aria-label="حذف هذا الاختيار"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              );
            })}

            {!isTrueFalse && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => append({ text: "", is_correct: false })}
                className="self-start"
              >
                + إضافة اختيار
              </Button>
            )}

            {optionsRootError && (
              <p className="text-xs text-danger">{optionsRootError}</p>
            )}
          </div>
        )}

        {needsAcceptedAnswers && (
          <Input
            label="الإجابات المقبولة"
            hint="افصل بينها بفاصلة — مثال: القاهرة, Cairo, مصر"
            required
            error={errors.accepted_answers_text?.message}
            {...register("accepted_answers_text")}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="الصعوبة"
            options={Object.entries(DIFFICULTY_LABEL).map(([value, label]) => ({
              value,
              label,
            }))}
            error={errors.difficulty?.message}
            {...register("difficulty")}
          />
          <Input
            label="النقاط"
            type="number"
            step="0.5"
            min={0.5}
            required
            error={errors.points?.message}
            {...register("points")}
          />
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 pt-3 -mx-1 border-t border-line bg-paper-elevated">
          {onCancel ? (
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              إلغاء
            </Button>
          ) : (
            <div />
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? "جارٍ الحفظ..."
              : submitLabel ??
                (isEdit ? "حفظ التعديلات" : "حفظ (سيُرسل للمراجعة)")}
          </Button>
        </div>
      </form>

      <QuickCreateModal
        open={bankModalOpen}
        onClose={() => setBankModalOpen(false)}
        title="إضافة بنك أسئلة"
      >
        <QuestionBankForm
          onSubmit={handleCreateBank}
          onCancel={() => setBankModalOpen(false)}
        />
      </QuickCreateModal>
    </>
  );
}