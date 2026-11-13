"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use, useState } from "react";
import { BulkGradingModal } from "@/components/exam/BulkGradingModal";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Download, Search } from "@/components/ui/icons";
import { ErrorState, Spinner } from "@/components/ui/States";
import {
  exportAssessmentResults,
  getStaffAssessment,
} from "@/lib/api/assessments";
import { reopenAttempt, voidAttempt } from "@/lib/api/attempts";
import { apiClient } from "@/lib/api/client";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type { AttemptResult, Paginated } from "@/types";

async function listAttempts(assessmentId: string) {
  const { data } = await apiClient.get<Paginated<AttemptResult>>("/attempts/", {
    params: { assessment: assessmentId },
  });
  return data;
}

export default function AssessmentResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();

  const [reopenTarget, setReopenTarget] = useState<AttemptResult | null>(null);
  const [voidTarget, setVoidTarget] = useState<AttemptResult | null>(null);
  const [bulkGradeOpen, setBulkGradeOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: assessment } = useQuery({
    queryKey: ["staff-assessment", id],
    queryFn: () => getStaffAssessment(id),
  });
  const { data, isLoading, isError } = useQuery({
    queryKey: ["assessment-attempts", id],
    queryFn: () => listAttempts(id),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["assessment-attempts", id] });

  const reopenMutation = useMutation({
    mutationFn: ({ attemptId }: { attemptId: string }) =>
      reopenAttempt(attemptId),
    onSuccess: async () => {
      await invalidate();
      toastSuccess("تم إعادة فتح المحاولة");
      setReopenTarget(null);
    },
    onError: (err) => {
      toastError(err, "تعذّر إعادة فتح المحاولة.");
      setReopenTarget(null);
    },
  });

  const voidMutation = useMutation({
    mutationFn: ({ attemptId }: { attemptId: string }) => voidAttempt(attemptId),
    onSuccess: async () => {
      await invalidate();
      toastSuccess("تم إلغاء المحاولة");
      setVoidTarget(null);
    },
    onError: (err) => {
      toastError(err, "تعذّر إلغاء المحاولة.");
      setVoidTarget(null);
    },
  });

  const exportMutation = useMutation({
    mutationFn: () => exportAssessmentResults(id),
    onSuccess: () => toastSuccess("تم تنزيل ملف النتائج"),
    onError: (err) => toastError(err, "تعذّر تصدير النتائج."),
  });

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorState message="تعذّر تحميل النتائج." />;

  const results = data?.results ?? [];
  const graded = results.filter((r) => r.status === "GRADED");
  const submitted = results.filter((r) => r.status === "SUBMITTED");
  const avg =
    graded.length > 0
      ? Math.round(
          (graded.reduce((s, r) => s + Number(r.score), 0) / graded.length) * 100
        ) / 100
      : null;

  // Only SUBMITTED attempts have pending essays — bulk grading applies
  // to those only.
  const submittedIds = new Set(submitted.map((r) => r.id));
  const selectedSubmitted = submitted.filter((r) => selectedIds.has(r.id));

  function toggleOne(attemptId: string) {
    if (!submittedIds.has(attemptId)) return; // non-submitted rows aren't selectable
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(attemptId)) next.delete(attemptId);
      else next.add(attemptId);
      return next;
    });
  }

  function toggleAllSubmitted() {
    if (selectedSubmitted.length === submitted.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(submitted.map((r) => r.id)));
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            نتائج: {assessment?.title ?? "—"}
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            {results.length} محاولة · {graded.length} مصححة
            {submitted.length > 0 && ` · ${submitted.length} بانتظار التصحيح`}
            {avg !== null && ` · متوسط الدرجات ${avg}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedSubmitted.length > 0 && (
            <Button
              onClick={() => setBulkGradeOpen(true)}
              className="text-sm"
            >
              تصحيح المحدد ({selectedSubmitted.length})
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending || results.length === 0}
            className="text-sm"
          >
            <Download size={14} />
            {exportMutation.isPending ? "..." : "تصدير Excel"}
          </Button>
          <Link href="/assessments">
            <Button variant="ghost" className="text-sm">
              ← رجوع
            </Button>
          </Link>
        </div>
      </div>

      {results.length === 0 && (
        <div className="card p-8 text-center text-ink-400">
          <Search size={32} className="mx-auto mb-3 text-ink-300" />
          لا توجد محاولات بعد. ستظهر هنا بمجرد أن يبدأ الطلاب.
        </div>
      )}

      {results.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-ink-50 text-ink-700">
              <tr>
                <th className="w-10 px-3 py-3">
                  {submitted.length > 0 && (
                    <input
                      type="checkbox"
                      checked={
                        submitted.length > 0 &&
                        selectedSubmitted.length === submitted.length
                      }
                      onChange={toggleAllSubmitted}
                      className="h-4 w-4 cursor-pointer accent-ink"
                      aria-label="تحديد الكل"
                    />
                  )}
                </th>
                <th className="px-4 py-3 text-start font-medium">الطالب</th>
                <th className="px-4 py-3 text-start font-medium">المحاولة</th>
                <th className="px-4 py-3 text-start font-medium">الحالة</th>
                <th className="px-4 py-3 text-start font-medium">الدرجة</th>
                <th className="px-4 py-3 text-start font-medium">النسبة</th>
                <th className="px-4 py-3 text-start font-medium">النتيجة</th>
                <th className="w-12 px-2 py-3" aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const canReopen = r.status !== "IN_PROGRESS";
                const canVoid = r.status !== "VOIDED";
                const selectable = submittedIds.has(r.id);
                const isSelected = selectedIds.has(r.id);
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-line last:border-0 ${
                      isSelected ? "bg-ink-50/60" : ""
                    }`}
                  >
                    <td className="px-3 py-3">
                      {selectable && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(r.id)}
                          className="h-4 w-4 cursor-pointer accent-ink"
                          aria-label="تحديد المحاولة"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
  <div className="min-w-0">
    <p className="truncate text-ink">{r.student_name}</p>
    <p className="truncate text-xs text-ink-400">{r.student_email}</p>
  </div>
</td>
                    <td className="px-4 py-3 text-ink-400">#{r.attempt_number}</td>
                    <td className="px-4 py-3 text-ink-400">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      {r.score} / {r.max_score}
                    </td>
                    <td className="px-4 py-3 text-ink-700">{r.percentage}%</td>
                    <td className="px-4 py-3">
                      {r.is_passed === true && (
                        <span className="text-success">✓ ناجح</span>
                      )}
                      {r.is_passed === false && (
                        <span className="text-danger">✗ راسب</span>
                      )}
                      {r.is_passed === null && (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-end">
                      <ActionMenu
                        items={[
                          {
                            label: "تفاصيل",
                            onClick: () => {
                              window.location.href = `/results/${r.id}`;
                            },
                          },
                          ...(r.status === "SUBMITTED"
                            ? [
                                {
                                  label: "تصحيح منفرد",
                                  onClick: () => {
                                    window.location.href = `/assessments/${id}/results/${r.id}/grade`;
                                  },
                                },
                              ]
                            : []),
                          ...(canReopen
                            ? [
                                {
                                  label: "إعادة فتح",
                                  onClick: () => setReopenTarget(r),
                                },
                              ]
                            : []),
                          ...(canVoid
                            ? [
                                {
                                  label: "إلغاء المحاولة",
                                  variant: "danger" as const,
                                  onClick: () => setVoidTarget(r),
                                },
                              ]
                            : []),
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk grading modal */}
      <BulkGradingModal
        open={bulkGradeOpen}
        onClose={() => setBulkGradeOpen(false)}
        attempts={selectedSubmitted}
        onSuccess={() => {
          setSelectedIds(new Set());
          invalidate();
        }}
      />

      {/* Reopen confirm */}
      <ConfirmDialog
        open={!!reopenTarget}
        title="إعادة فتح المحاولة"
        description={
          reopenTarget
            ? `سيتم إعادة فتح محاولة ${reopenTarget.student_email}. سيحصل الطالب على مهلة جديدة ويكمل من حيث توقّف. الدرجات الحالية ستُلغى وتُحتسب من جديد عند التسليم التالي.`
            : ""
        }
        confirmLabel={reopenMutation.isPending ? "..." : "إعادة فتح"}
        cancelLabel="إلغاء"
        variant="default"
        onConfirm={() => {
          if (reopenTarget) reopenMutation.mutate({ attemptId: reopenTarget.id });
        }}
        onCancel={() => setReopenTarget(null)}
        isPending={reopenMutation.isPending}
      />

      {/* Void confirm */}
      <ConfirmDialog
        open={!!voidTarget}
        title="إلغاء المحاولة"
        description={
          voidTarget
            ? `سيتم إلغاء محاولة ${voidTarget.student_email}. المحاولة الملغاة لا تُحتسب ضد عدد محاولات الطالب — يستطيع البدء من جديد. البيانات محفوظة للسجل.`
            : ""
        }
        confirmLabel={voidMutation.isPending ? "..." : "إلغاء المحاولة"}
        cancelLabel="تراجع"
        variant="danger"
        onConfirm={() => {
          if (voidTarget) voidMutation.mutate({ attemptId: voidTarget.id });
        }}
        onCancel={() => setVoidTarget(null)}
        isPending={voidMutation.isPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    IN_PROGRESS: { label: "قيد التنفيذ", cls: "bg-accent/20 text-ink-700" },
    SUBMITTED: { label: "بانتظار التصحيح", cls: "bg-info/10 text-info" },
    GRADED: { label: "مصححة", cls: "bg-success/10 text-success" },
    EXPIRED: { label: "منتهية", cls: "bg-danger/10 text-danger" },
    VOIDED: { label: "ملغاة", cls: "bg-ink-50 text-ink-400 line-through" },
  };
  const { label, cls } = map[status] ?? {
    label: status,
    cls: "bg-ink-50 text-ink-400",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}