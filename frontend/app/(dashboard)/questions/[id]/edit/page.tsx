"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { use } from "react";
import { QuestionForm } from "@/components/questions/QuestionForm";
import { Button } from "@/components/ui/Button";
import { ErrorState, Spinner } from "@/components/ui/States";
import { getQuestion, updateQuestion } from "@/lib/api/questions";
import { toastError, toastSuccess } from "@/lib/utils/toast";

export default function EditQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: question, isLoading, isError } = useQuery({
    queryKey: ["question", id],
    queryFn: () => getQuestion(id),
  });

  if (isLoading) return <Spinner />;
  if (isError || !question) return <ErrorState message="تعذّر تحميل السؤال." />;

  const initialValues = {
    bank: question.bank,
    text: question.text,
    question_type: question.question_type,
    difficulty: question.difficulty,
    topic: question.topic,
    points: Number(question.points),
    accepted_answers_text: question.accepted_answers?.join(", ") ?? "",
    options: question.options?.map((o) => ({ text: o.text, is_correct: o.is_correct })) ?? [],
  };

  async function handleUpdate(values: any) {
    try {
      await updateQuestion(id, {
        bank: values.bank,
        text: values.text,
        question_type: values.question_type,
        difficulty: values.difficulty,
        topic: values.topic,
        points: String(values.points),
        accepted_answers: values.accepted_answers_text
          ? values.accepted_answers_text.split(",").map((s: string) => s.trim()).filter(Boolean)
          : undefined,
        options:
          values.question_type === "MCQ" || values.question_type === "TRUE_FALSE"
            ? values.options?.map((o: any, i: number) => ({
                text: o.text,
                is_correct: o.is_correct,
                order: i + 1,
              }))
            : undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["questions"] });
      await queryClient.invalidateQueries({ queryKey: ["question", id] });
      toastSuccess("تم حفظ التعديلات");
      router.push("/questions");
    } catch (err) {
      toastError(err, "تعذّر حفظ التعديلات.");
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold text-ink">تعديل السؤال</h1>
        <Button variant="ghost" onClick={() => router.push("/questions")}>
          ← رجوع
        </Button>
      </div>
      {question.review_status === "APPROVED" && (
        <div className="mb-4 rounded-lg border border-accent/30 bg-accent/5 p-3 text-sm text-ink-700">
          ⚠️ هذا السؤال معتمد. أي تعديل عليه سيُعيده لمرحلة «قيد المراجعة».
        </div>
      )}
      <div className="card p-6">
        <QuestionForm
          onSubmit={handleUpdate}
          initialValues={initialValues}
          submitLabel="حفظ التعديلات"
        />
      </div>
    </div>
  );
}