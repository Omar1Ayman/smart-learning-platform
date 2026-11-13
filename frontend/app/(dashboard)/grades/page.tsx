"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ResourcePage } from "@/components/common/ResourcePage";
import type { FilterDef } from "@/components/ui/DataTable";
import { GradeForm } from "@/components/grades/GradeForm";
import {
  createGrade,
  deleteGrade,
  listGrades,
  updateGrade,
} from "@/lib/api/grades";
import { listStages } from "@/lib/api/stages";
import type { GradeFormValues } from "@/lib/validation/schemas";
import { toastError } from "@/lib/utils/toast";

interface GradeRow {
  id: string;
  name: string;
  order: number;
  stage: string;
}

export default function GradesPage() {
  const queryClient = useQueryClient();
  const { data: stages } = useQuery({
    queryKey: ["stages"],
    queryFn: () => listStages(),
  });
  const stageMap = useMemo(
    () => new Map((stages?.results ?? []).map((s) => [s.id, s.name])),
    [stages]
  );

  const [stageFilter, setStageFilter] = useState("");
  const filterValues = useMemo(
    () => ({ stage: stageFilter }),
    [stageFilter]
  );
  const filters = useMemo<FilterDef<GradeRow>[]>(
    () => [
      {
        key: "stage",
        label: "المراحل",
        options: (stages?.results ?? []).map((s) => ({
          value: s.id,
          label: s.name,
        })),
        match: (g, v) => g.stage === v,
      },
    ],
    [stages]
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["grades"] });

  return (
    <ResourcePage<GradeRow, GradeFormValues>
      title="الصفوف الدراسية"
      queryKey={["grades"]}
      queryFn={listGrades}
      columns={[
        {
          header: "الاسم",
          render: (g) => (
            <Link
              href={`/grades/${g.id}`}
              className="font-medium text-ink hover:underline"
            >
              {g.name}
            </Link>
          ),
          sortValue: (g) => g.name,
        },
        {
          header: "المرحلة",
          render: (g) => (
            <span className="text-ink-400">{stageMap.get(g.stage) ?? "—"}</span>
          ),
          sortValue: (g) => stageMap.get(g.stage) ?? "",
        },
        {
          header: "الترتيب",
          render: (g) => <span className="text-ink-400">{g.order}</span>,
          sortValue: (g) => g.order,
        },
      ]}
      searchPredicate={(g, q) =>
        g.name.toLowerCase().includes(q) ||
        (stageMap.get(g.stage) ?? "").toLowerCase().includes(q)
      }
      searchPlaceholder="ابحث باسم الصف..."
      filters={filters}
      filterValues={filterValues}
      onFilterChange={(key, value) => {
        if (key === "stage") setStageFilter(value);
      }}
      createLabel="+ إضافة صف"
      formTitle="إضافة صف"
      FormComponent={GradeForm}
      EditFormComponent={GradeForm}
      rowToFormValues={(g) => ({
        stage: g.stage,
        name: g.name,
        order: g.order,
      })}
      deleteLabel={(g) => g.name}
      onSubmit={async (values) => {
        try {
          await createGrade(values);
          await invalidate();
        } catch (err) {
          toastError(err, "تعذّرت إضافة الصف.");
          throw err;
        }
      }}
      onUpdate={async (id, values) => {
        try {
          await updateGrade(id, values);
          await invalidate();
        } catch (err) {
          toastError(err, "تعذّر تحديث الصف.");
          throw err;
        }
      }}
      onDelete={async (id) => {
        try {
          await deleteGrade(id);
          await invalidate();
        } catch (err) {
          toastError(err, "تعذّر حذف الصف.");
          throw err;
        }
      }}
      emptyTitle="لا توجد صفوف بعد"
      emptyDescription="أضف صفوفًا لمراحلك الدراسية."
    />
  );
}