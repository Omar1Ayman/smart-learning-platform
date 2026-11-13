"use client";

import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorState, Spinner } from "@/components/ui/States";
import { apiClient } from "@/lib/api/client";
import { promoteStudents } from "@/lib/api/rollover";
import type { Grade } from "@/lib/api/grades";
import type { Group } from "@/lib/api/groups";
import type { Stage } from "@/lib/api/stages";
import {
  readRolloverProgress,
  updateRolloverProgress,
  type RolloverAction,
  type RolloverDecision,
} from "@/lib/rollover/progress";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type {
  AcademicYear,
  Enrollment,
  Paginated,
} from "@/types";

interface Step3Props {
  year: AcademicYear;
  newYearId: string;
  storageKey: string | null;
  onPromoted: (count: number) => void;
  onSkip: () => void;
}

interface EnrollmentRow {
  enrollment: Enrollment;
  sourceGroup: Group | null;
  sourceGrade: Grade | null;
}

async function fetchAllResults<T>(
  path: string,
  params: Record<string, string | number>
): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = path;
  let config:
    | { params: Record<string, string | number> }
    | undefined = { params: { ...params, page_size: 200 } };

  while (url) {
    const response = await apiClient.get<Paginated<T>>(url, config);
    const page: Paginated<T> = response.data;
    results.push(...page.results);
    url = page.next;
    config = undefined;
  }

  return results;
}

export function Step3StudentDecisions({
  year,
  newYearId,
  storageKey,
  onPromoted,
  onSkip,
}: Step3Props) {
  const queryClient = useQueryClient();
  const [decisionOverrides, setDecisionOverrides] = useState<
    Record<string, RolloverDecision>
  >({});
  const storageErrorReported = useRef(false);

  // Fetch data needed
  const results = useQueries({
    queries: [
      {
        queryKey: ["rollover-enrollments", year.id],
        queryFn: () =>
          fetchAllResults<Enrollment>("/enrollments/", {
            academic_year: year.id,
            status: "ACTIVE",
          }),
      },
      {
        queryKey: ["rollover-source-groups", year.id],
        queryFn: () =>
          fetchAllResults<Group>("/groups/", { academic_year: year.id }),
      },
      {
        queryKey: ["rollover-target-groups", newYearId],
        queryFn: () =>
          fetchAllResults<Group>("/groups/", { academic_year: newYearId }),
      },
      {
        queryKey: ["rollover-grades"],
        queryFn: () => fetchAllResults<Grade>("/grades/", {}),
      },
      {
        queryKey: ["rollover-stages"],
        queryFn: () => fetchAllResults<Stage>("/stages/", {}),
      },
    ],
  });

  const [enrollQ, sourceGroupsQ, targetGroupsQ, gradesQ, stagesQ] = results;
  const isLoading = results.some((r) => r.isLoading);
  const isError = results.some((r) => r.isError);

  // Build indexes
  const sourceGroupsMap = useMemo(() => {
    const m = new Map<string, Group>();
    (sourceGroupsQ.data ?? []).forEach((g) => m.set(g.id, g));
    return m;
  }, [sourceGroupsQ.data]);

  const gradesMap = useMemo(() => {
    const m = new Map<string, Grade>();
    (gradesQ.data ?? []).forEach((g) => m.set(g.id, g));
    return m;
  }, [gradesQ.data]);

  const stages = useMemo(
    () => stagesQ.data ?? [],
    [stagesQ.data]
  );

  const targetGroups = useMemo(
    () => targetGroupsQ.data ?? [],
    [targetGroupsQ.data]
  );

  const rows: EnrollmentRow[] = useMemo(() => {
    return (enrollQ.data ?? []).map((e) => {
      const sg = sourceGroupsMap.get(e.group) ?? null;
      const grade = sg ? gradesMap.get(sg.grade) ?? null : null;
      return { enrollment: e, sourceGroup: sg, sourceGrade: grade };
    });
  }, [enrollQ.data, sourceGroupsMap, gradesMap]);

  // Compute next grade for a given grade
  const nextGradeOf = useCallback((grade: Grade): Grade | null => {
    const currentStage = stages.find((s) => s.id === grade.stage);
    if (!currentStage) return null;

    // Same stage, higher order
    const allGrades = Array.from(gradesMap.values());
    const sameStageNext = allGrades
      .filter((g) => g.stage === grade.stage && g.order > grade.order)
      .sort((a, b) => a.order - b.order)[0];
    if (sameStageNext) return sameStageNext;

    // Next stage, first grade
    const nextStage = stages
      .filter((s) => s.order > currentStage.order)
      .sort((a, b) => a.order - b.order)[0];
    if (!nextStage) return null;

    return (
      allGrades
        .filter((g) => g.stage === nextStage.id)
        .sort((a, b) => a.order - b.order)[0] ?? null
    );
  }, [gradesMap, stages]);

  const suggestDecision = useCallback((row: EnrollmentRow): RolloverDecision => {
    if (!row.sourceGrade) {
      return { action: "GRADUATE", targetGroup: null };
    }
    const next = nextGradeOf(row.sourceGrade);
    if (next == null) {
      return { action: "GRADUATE", targetGroup: null };
    }
    const candidateGroups = targetGroups.filter((g) => g.grade === next.id);
    if (candidateGroups.length === 0) {
      // No groups for next grade in target year
      return { action: "GRADUATE", targetGroup: null };
    }
    return { action: "PROMOTE", targetGroup: candidateGroups[0].id };
  }, [nextGradeOf, targetGroups]);

  const isDecisionAvailable = useCallback((
    row: EnrollmentRow,
    decision: RolloverDecision | undefined
  ): decision is RolloverDecision => {
    if (!decision) return false;
    if (decision.action === "GRADUATE" || decision.action === "TRANSFER") {
      return decision.targetGroup === null;
    }

    const validGroups =
      decision.action === "PROMOTE"
        ? row.sourceGrade
          ? targetGroups.filter(
              (group) => group.grade === nextGradeOf(row.sourceGrade!)?.id
            )
          : []
        : row.sourceGrade
        ? targetGroups.filter((group) => group.grade === row.sourceGrade!.id)
        : [];
    return validGroups.some((group) => group.id === decision.targetGroup);
  }, [nextGradeOf, targetGroups]);

  const savedDecisions = useMemo(() => {
    if (!storageKey) return {};
    return (
      readRolloverProgress(storageKey, year.id).progress?.decisions ?? {}
    );
  }, [storageKey, year.id]);

  const decisions = useMemo(() => {
    const defaults: Record<string, RolloverDecision> = {};
    for (const row of rows) {
      const saved = savedDecisions[row.enrollment.id];
      defaults[row.enrollment.id] = isDecisionAvailable(row, saved)
        ? saved
        : suggestDecision(row);
    }
    return { ...defaults, ...decisionOverrides };
  }, [
    decisionOverrides,
    isDecisionAvailable,
    rows,
    savedDecisions,
    suggestDecision,
  ]);

  useEffect(() => {
    if (!storageKey || isLoading || isError) return;
    if (
      !updateRolloverProgress(storageKey, year.id, {
        decisions,
      })
    ) {
      if (!storageErrorReported.current) {
        storageErrorReported.current = true;
        toastError(
          new Error("تعذّر حفظ قرارات الطلاب على هذا الجهاز."),
          "قد تحتاج إلى إعادة إدخال القرارات إذا أغلقت الصفحة."
        );
      }
    }
  }, [decisions, isError, isLoading, storageKey, year.id]);

  const promoteMutation = useMutation({
    mutationFn: () => {
      const items = Object.entries(decisions).map(([enrollmentId, dec]) => ({
        enrollment: enrollmentId,
        action: dec.action,
        target_group:
          dec.action === "PROMOTE" || dec.action === "REPEAT"
            ? dec.targetGroup
            : null,
      }));
      return promoteStudents(year.id, {
        target_year: newYearId,
        items,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["enrollments"] });
      toastSuccess(`تمت ترقية ${result.results.length} طالب`);
      onPromoted(result.results.length);
    },
    onError: (err) => toastError(err, "تعذّرت الترقية."),
  });

  function handlePromoteClick() {
    const items = Object.values(decisions);
    const invalid = items.filter(
      (d) =>
        (d.action === "PROMOTE" || d.action === "REPEAT") && !d.targetGroup
    );
    if (invalid.length > 0) {
      toastError(
        new Error(
          `يرجى تحديد مجموعة هدف لـ ${invalid.length} طالب قبل المتابعة.`
        ),
        ""
      );
      return;
    }
    promoteMutation.mutate();
  }

  function setDecision(
    enrollmentId: string,
    patch: Partial<RolloverDecision>
  ) {
    setDecisionOverrides((prev) => ({
      ...prev,
      [enrollmentId]: {
        ...(prev[enrollmentId] ?? decisions[enrollmentId]),
        ...patch,
      },
    }));
  }

  function bulkAction(action: RolloverAction) {
    const next: Record<string, RolloverDecision> = {};
    for (const row of rows) {
      if (action === "GRADUATE" || action === "TRANSFER") {
        next[row.enrollment.id] = { action, targetGroup: null };
      } else {
        const existing = decisions[row.enrollment.id];
        next[row.enrollment.id] = {
          action,
          targetGroup: existing?.targetGroup ?? null,
        };
      }
    }
    setDecisionOverrides((previous) => ({ ...previous, ...next }));
  }

  if (isLoading) return <Spinner />;
  if (isError)
    return (
      <ErrorState
        message="تعذّر تحميل بيانات الترقية."
        onRetry={() => {
          for (const result of results) {
            if (result.isError) void result.refetch();
          }
        }}
      />
    );

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <p className="text-4xl">🎓</p>
        <p className="text-base font-bold text-ink">لا يوجد طلاب نشطون</p>
        <p className="text-sm text-ink-400">
          هذه السنة لا تحتوي على تسجيلات نشطة. يمكنك تخطي الترقية.
        </p>
        <Button onClick={onSkip}>تجاوز → أرشفة</Button>
      </div>
    );
  }

  // Group rows by source grade for display
  const grouped = new Map<string, EnrollmentRow[]>();
  for (const row of rows) {
    const key = row.sourceGrade?.name ?? "بدون صف";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold font-display text-ink">
          ترقية الطلاب ({rows.length})
        </h2>
        <p className="mt-1 text-sm text-ink-400">
          راجع القرارات التلقائية لكل طالب. يمكنك تعديل أي صف قبل الترقية.
        </p>
      </div>

      {/* Bulk actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => bulkAction("PROMOTE")}>
          الكل: ترقية
        </Button>
        <Button variant="secondary" size="sm" onClick={() => bulkAction("GRADUATE")}>
          الكل: تخرّج
        </Button>
      </div>

      {/* Table grouped by grade */}
      <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-line">
        {Array.from(grouped.entries()).map(([gradeName, rowsInGrade]) => (
          <div key={gradeName}>
            <div className="sticky top-0 z-10 border-b border-line bg-ink-50 px-3 py-2">
              <p className="text-xs font-medium text-ink-700">
                {gradeName} ({rowsInGrade.length})
              </p>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {rowsInGrade.map((row) => {
                  const dec = decisions[row.enrollment.id];
                  if (!dec) return null;
                  const next = row.sourceGrade ? nextGradeOf(row.sourceGrade) : null;
                  const promoteTargets = next
                    ? targetGroups.filter((g) => g.grade === next.id)
                    : [];
                  const repeatTargets = row.sourceGrade
                    ? targetGroups.filter((g) => g.grade === row.sourceGrade!.id)
                    : [];
                  const availableTargets =
                    dec.action === "PROMOTE"
                      ? promoteTargets
                      : dec.action === "REPEAT"
                      ? repeatTargets
                      : [];

                  return (
                    <tr key={row.enrollment.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2">
                        <p className="text-sm font-medium text-ink">
                          {row.enrollment.student_name}
                        </p>
                        <p className="text-xs text-ink-400">
                          {row.enrollment.group_name}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={dec.action}
                          onChange={(e) =>
                            setDecision(row.enrollment.id, {
                              action: e.target.value as RolloverAction,
                              targetGroup: null,
                            })
                          }
                          className="rounded-md border border-line px-2 py-1 text-xs"
                        >
                          <option value="PROMOTE" disabled={promoteTargets.length === 0}>
                            ترقية
                          </option>
                          <option value="REPEAT" disabled={repeatTargets.length === 0}>
                            إعادة
                          </option>
                          <option value="GRADUATE">تخرّج</option>
                          <option value="TRANSFER">نقل</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        {(dec.action === "PROMOTE" || dec.action === "REPEAT") &&
                          (availableTargets.length === 0 ? (
                            <span className="text-xs text-danger">
                              لا مجموعات متاحة
                            </span>
                          ) : (
                            <select
                              value={dec.targetGroup ?? ""}
                              onChange={(e) =>
                                setDecision(row.enrollment.id, {
                                  targetGroup: e.target.value || null,
                                })
                              }
                              className="rounded-md border border-line px-2 py-1 text-xs"
                            >
                              <option value="">اختر مجموعة...</option>
                              {availableTargets.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.name}
                                </option>
                              ))}
                            </select>
                          ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <Button variant="ghost" onClick={onSkip}>
          تجاوز → أرشفة
        </Button>
        <Button
          onClick={handlePromoteClick}
          disabled={promoteMutation.isPending}
        >
          {promoteMutation.isPending
            ? "جارٍ الترقية..."
            : `ترقية ${rows.length} طالب →`}
        </Button>
      </div>
    </div>
  );
}