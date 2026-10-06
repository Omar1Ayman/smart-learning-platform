"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { QuestionForm } from "@/components/questions/QuestionForm";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import { approveQuestion, createQuestion, listQuestions, rejectQuestion, type ReviewStatus } from "@/lib/api/questions";
import { useAuthStore } from "@/lib/auth/store";
import type { QuestionFormValues } from "@/lib/validation/schemas";

const STATUS_LABEL: Record<ReviewStatus, string> = {
  PENDING: "قيد المراجعة",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
};
const STATUS_STYLE: Record<ReviewStatus, string> = {
  PENDING: "bg-accent/20 text-ink-700",
  APPROVED: "bg-success/10 text-success",
  REJECTED: "bg-danger/10 text-danger",
};

export default function QuestionsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canReview = role === "OWNER" || role === "ADMIN";

  const { data, isLoading, isError } = useQuery({ queryKey: ["questions"], queryFn: listQuestions });

  async function handleCreate(values: QuestionFormValues) {
    await createQuestion({
      bank: values.bank,
      text: values.text,
      question_type: values.question_type,
      difficulty: values.difficulty,
      topic: values.topic,
      points: String(values.points),
      accepted_answers: values.accepted_answers_text
        ? values.accepted_answers_text.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
      options: values.options?.map((o, i) => ({ text: o.text, is_correct: o.is_correct, order: i + 1 })),
    });
    await queryClient.invalidateQueries({ queryKey: ["questions"] });
    setModalOpen(false);
  }

  async function handleApprove(id: string) {
    await approveQuestion(id);
    await queryClient.invalidateQueries({ queryKey: ["questions"] });
  }

  async function handleReject(id: string) {
    const note = window.prompt("سبب الرفض (اختياري):") ?? "";
    await rejectQuestion(id, note);
    await queryClient.invalidateQueries({ queryKey: ["questions"] });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">الأسئلة</h1>
        <Button onClick={() => setModalOpen(true)}>+ إضافة سؤال</Button>
      </div>

      {isLoading && <Spinner />}
      {isError && <ErrorState message="تعذّر تحميل الأسئلة." />}
      {!isLoading && !isError && data?.results.length === 0 && (
        <EmptyState title="لا توجد أسئلة بعد" description="أضف سؤالك الأول — سيُرسل للمراجعة تلقائيًا." />
      )}

      {!isLoading && !isError && data && data.results.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-ink-50 text-start text-ink-700">
              <tr>
                <th className="px-4 py-3 text-start font-medium">السؤال</th>
                <th className="px-4 py-3 text-start font-medium">الحالة</th>
                {canReview && <th className="px-4 py-3 text-start font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {data.results.map((q) => (
                <tr key={q.id} className="border-b border-line last:border-0">
                  <td className="max-w-xs truncate px-4 py-3 font-medium text-ink">{q.text}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[q.review_status]}`}>
                      {STATUS_LABEL[q.review_status]}
                    </span>
                  </td>
                  {canReview && (
                    <td className="flex gap-2 px-4 py-3">
                      {q.review_status === "PENDING" && (
                        <>
                          <Button variant="secondary" onClick={() => handleApprove(q.id)}>
                            اعتماد
                          </Button>
                          <Button variant="ghost" onClick={() => handleReject(q.id)}>
                            رفض
                          </Button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <QuickCreateModal open={modalOpen} onClose={() => setModalOpen(false)} title="إضافة سؤال">
        <QuestionForm onSubmit={handleCreate} />
      </QuickCreateModal>
    </div>
  );
}
