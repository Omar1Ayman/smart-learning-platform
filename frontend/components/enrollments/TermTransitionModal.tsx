"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { transitionTerm } from "@/lib/api/enrollments";
import { apiClient } from "@/lib/api/client";
import { listTerms } from "@/lib/api/terms";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type { Enrollment, Paginated } from "@/types";

interface TermTransitionModalProps {
  open: boolean;
  onClose: () => void;
  enrollment: Enrollment;
  onSuccess: () => void;
}

/**
 * Phase 1.14-1.15 — Modal for moving a student from one term/group
 * to another. Same grade, same year — only group + term change.
 *
 * Example use case: a student in Term 1 with group "1ث-أ" is
 * rebalanced to group "1ث-ب" for Term 2.
 */
export function TermTransitionModal({
  open,
  onClose,
  enrollment,
  onSuccess,
}: TermTransitionModalProps) {
  const queryClient = useQueryClient();
  const [targetTermId, setTargetTermId] = useState("");
  const [targetGroupId, setTargetGroupId] = useState("");

  // Fetch terms (same year)
  const { data: terms, isLoading: termsLoading } = useQuery({
    queryKey: ["terms", enrollment.academic_year],
    queryFn: () => listTerms({ academic_year: enrollment.academic_year }),
    enabled: open,
  });

  // Fetch groups (same grade + same year as the source)
  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ["groups-for-transition", enrollment.academic_year, enrollment.group],
    queryFn: async () => {
      // Get source group's grade
      const { data } = await apiClient.get<Paginated<{
        id: string;
        grade: string;
      }>>("/groups/", {
        params: { academic_year: enrollment.academic_year, page_size: 100 },
      });
      const sourceGroup = data.results.find((g) => g.id === enrollment.group);
      if (!sourceGroup) return { results: [] };

      const { data: filtered } = await apiClient.get<Paginated<{
        id: string;
        grade: string;
        name: string;
        academic_year: string;
      }>>("/groups/", {
        params: {
          academic_year: enrollment.academic_year,
          grade: sourceGroup.grade,
          page_size: 100,
        },
      });
      return filtered;
    },
    enabled: open,
  });

  // Filtered options
  const availableTerms = useMemo(() => {
    return (terms?.results ?? []).filter((t) => t.id !== enrollment.term);
  }, [terms, enrollment.term]);

  const availableGroups = useMemo(() => {
    return (groups?.results ?? []).filter((g) => g.id !== enrollment.group);
  }, [groups, enrollment.group]);

  const mutation = useMutation({
    mutationFn: () =>
      transitionTerm(enrollment.id, {
        target_term: targetTermId,
        target_group: targetGroupId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["enrollment"] });
      queryClient.invalidateQueries({ queryKey: ["student"] });
      toastSuccess("تم نقل الطالب للترم الجديد");
      onSuccess();
      onClose();
    },
    onError: (err) => toastError(err, "تعذّر نقل الطالب."),
  });

  const canSubmit = !!targetTermId && !!targetGroupId && !mutation.isPending;

  return (
    <Modal open={open} onClose={onClose} title="نقل بين الترمات">
      <div className="flex flex-col gap-4">
        {/* Source info */}
        <div className="rounded-lg bg-paper-muted/50 p-3 text-sm">
          <p className="text-xs font-medium text-ink-400">التسجيل الحالي</p>
          <p className="mt-1 font-medium text-ink">
            {enrollment.student_name}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">
            {enrollment.group_name} · {enrollment.term_name} ·{" "}
            {enrollment.academic_year_name}
          </p>
        </div>

        {/* Warning */}
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs text-ink-700">
          ℹ️ سيتم إنهاء التسجيل الحالي (COMPLETED) وإنشاء تسجيل جديد في
          الترم والمجموعة الجديدة. السجل السابق محفوظ.
        </div>

        {/* Target term */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink-700">
            الترم الهدف <span className="text-danger">*</span>
          </label>
          <select
            value={targetTermId}
            onChange={(e) => setTargetTermId(e.target.value)}
            disabled={termsLoading}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
          >
            <option value="">
              {termsLoading ? "جارٍ التحميل..." : "اختر الترم..."}
            </option>
            {availableTerms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {availableTerms.length === 0 && !termsLoading && (
            <p className="text-xs text-ink-400">
              لا توجد ترمات أخرى في هذه السنة.
            </p>
          )}
        </div>

        {/* Target group */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink-700">
            المجموعة الهدف <span className="text-danger">*</span>
          </label>
          <select
            value={targetGroupId}
            onChange={(e) => setTargetGroupId(e.target.value)}
            disabled={groupsLoading}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
          >
            <option value="">
              {groupsLoading ? "جارٍ التحميل..." : "اختر المجموعة..."}
            </option>
            {availableGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-ink-400">
            يجب أن تكون في نفس صف المجموعة الحالية (نقل بين صفوف = Rollover).
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
          >
            {mutation.isPending ? "جارٍ النقل..." : "نقل الآن"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}