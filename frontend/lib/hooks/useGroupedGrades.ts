"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { listGrades } from "@/lib/api/grades";
import { listStages } from "@/lib/api/stages";
import type { GroupedSelectGroup } from "@/components/ui/GroupedSelect";

export function useGroupedGrades() {
  const { data: grades, isLoading: gradesLoading } = useQuery({
    queryKey: ["grades"],
    queryFn: () => listGrades(),
  });
  const { data: stages, isLoading: stagesLoading } = useQuery({
    queryKey: ["stages"],
    queryFn: () => listStages(),
  });

  const groups = useMemo<GroupedSelectGroup[]>(() => {
    if (!grades?.results || !stages?.results) return [];

    const stageMap = new Map(stages.results.map((s) => [s.id, s.name]));
    const grouped = new Map<string, typeof grades.results>();

    for (const grade of grades.results) {
      const stageName = stageMap.get(grade.stage) || "غير محدد";
      if (!grouped.has(stageName)) grouped.set(stageName, []);
      grouped.get(stageName)!.push(grade);
    }

    return Array.from(grouped.entries())
      .sort((a, b) => {
        // Sort stages by their first grade's order (approximation)
        const aOrder = a[1][0]?.order ?? 0;
        const bOrder = b[1][0]?.order ?? 0;
        return aOrder - bOrder;
      })
      .map(([stageName, gradeList]) => ({
        label: stageName,
        options: gradeList
          .sort((a, b) => a.order - b.order)
          .map((g) => ({ value: g.id, label: g.name })),
      }));
  }, [grades, stages]);

  return {
    groups,
    isLoading: gradesLoading || stagesLoading,
  };
}