"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ResourcePage } from "@/components/common/ResourcePage";
import type { FilterDef } from "@/components/ui/DataTable";
import { GroupForm } from "@/components/groups/GroupForm";
import { listAcademicYears } from "@/lib/api/academicYears";
import { listGrades } from "@/lib/api/grades";
import { useYearScopedQuery } from "@/lib/hooks/useYearScopedQuery";
import {
  createGroup,
  deleteGroup,
  listGroups,
  updateGroup,
} from "@/lib/api/groups";
import type { GroupFormValues } from "@/lib/validation/schemas";
import { toastError } from "@/lib/utils/toast";

interface GroupRow {
  id: string;
  name: string;
  grade: string;
  capacity: number | null;
  academic_year: string;
  students_count: number;  // جديد
  teachers_count: number;  // جديد
}

export default function GroupsPage() {
  const queryClient = useQueryClient();
  const { data: grades } = useQuery({
    queryKey: ["grades"],
    queryFn: () => listGrades(),
  });
  const { data: years } = useQuery({
    queryKey: ["academic-years"],
    queryFn: () => listAcademicYears(),
  });

  const gradeMap = useMemo(
    () => new Map((grades?.results ?? []).map((g) => [g.id, g.name])),
    [grades]
  );
  const yearMap = useMemo(
    () => new Map((years?.results ?? []).map((y) => [y.id, y.name])),
    [years]
  );

  const [gradeFilter, setGradeFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const filterValues = useMemo(
    () => ({ grade: gradeFilter, academic_year: yearFilter }),
    [gradeFilter, yearFilter]
  );

  const filters = useMemo<FilterDef<GroupRow>[]>(
    () => [
      {
        key: "grade",
        label: "الصفوف",
        options: (grades?.results ?? []).map((g) => ({
          value: g.id,
          label: g.name,
        })),
        match: (row, v) => row.grade === v,
      },
      {
        key: "academic_year",
        label: "السنوات",
        options: (years?.results ?? []).map((y) => ({
          value: y.id,
          label: y.name,
        })),
        match: (row, v) => row.academic_year === v,
      },
    ],
    [grades, years]
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["groups"] });
    const { queryFn: yearScopedQueryFn, enabled: yearEnabled } =
    useYearScopedQuery(listGroups);
  return (
    <div className="page-enter">
      <ResourcePage<GroupRow, GroupFormValues>
        title="المجموعات"
        description="إدارة المجموعات أو الشعب الدراسية وتوزيع الطلاب والمعلمين عليها."
        queryKey={["groups"]}
        queryFn={yearScopedQueryFn}
        queryEnabled={yearEnabled}
        columns={[
          {
            header: "الاسم",
            render: (g) => (
              <Link
                href={`/groups/${g.id}`}
                className="font-medium text-ink hover:underline"
              >
                {g.name}
              </Link>
            ),
            sortValue: (g) => g.name,
          },
          {
            header: "الصف / السنة",
            render: (g) => (
              <div className="flex flex-col">
                <span className="text-sm text-ink-700">{gradeMap.get(g.grade) ?? "—"}</span>
                <span className="text-xs text-ink-400">{yearMap.get(g.academic_year) ?? "—"}</span>
              </div>
            ),
            sortValue: (g) => gradeMap.get(g.grade) ?? "",
          },
          // --- العمود الذكي الجديد: سعة المجموعة ---
          {
            header: "الطلاب / السعة",
            render: (g) => {
              const isFull = g.capacity && g.students_count >= g.capacity;
              return (
                <div className="flex flex-col gap-1 min-w-[100px]">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-ink">{g.students_count} طالب</span>
                    {g.capacity && <span className="text-ink-400">من {g.capacity}</span>}
                  </div>
                  {g.capacity && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                      <div
                        className={`h-full rounded-full transition-all ${isFull ? "bg-danger" : "bg-success"}`}
                        style={{ width: `${Math.min((g.students_count / g.capacity) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            },
            sortValue: (g) => g.students_count,
          },
          // --- العمود الذكي الجديد: المعلمون ---
          {
            header: "المعلمون",
            render: (g) => (
              <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent-dark">
                {g.teachers_count} معلم
              </span>
            ),
            sortValue: (g) => g.teachers_count,
          },
        ]}
        searchPredicate={(g, q) =>
          g.name.toLowerCase().includes(q) ||
          (gradeMap.get(g.grade) ?? "").toLowerCase().includes(q)
        }
        searchPlaceholder="ابحث باسم المجموعة..."
        filters={filters}
        filterValues={filterValues}
        onFilterChange={(key, value) => {
          if (key === "grade") setGradeFilter(value);
          else if (key === "academic_year") setYearFilter(value);
        }}
        createLabel="+ إضافة مجموعة"
        formTitle="إضافة مجموعة"
        FormComponent={GroupForm}
        EditFormComponent={GroupForm}
        rowToFormValues={(g) => ({
          grade: g.grade,
          academic_year: g.academic_year,
          name: g.name,
          capacity: g.capacity ?? undefined,
        })}
        deleteLabel={(g) => g.name}
        onSubmit={async (values) => {
          try {
            await createGroup(values);
            await invalidate();
          } catch (err) {
            toastError(err, "تعذّرت إضافة المجموعة.");
            throw err;
          }
        }}
        onUpdate={async (id, values) => {
          try {
            await updateGroup(id, values);
            await invalidate();
          } catch (err) {
            toastError(err, "تعذّر تحديث المجموعة.");
            throw err;
          }
        }}
        onDelete={async (id) => {
          try {
            await deleteGroup(id);
            await invalidate();
          } catch (err) {
            toastError(err, "تعذّر حذف المجموعة.");
            throw err;
          }
        }}
        emptyTitle="لا توجد مجموعات بعد"
        emptyDescription="أضف مجموعات لصفوفك الدراسية."
      />
    </div>
  );
}