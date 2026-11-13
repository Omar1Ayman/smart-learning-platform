"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ResourcePage } from "@/components/common/ResourcePage";
import type { FilterDef } from "@/components/ui/DataTable";
import { TermForm } from "@/components/terms/TermForm";
import { listAcademicYears } from "@/lib/api/academicYears";
import {
  createTerm,
  deleteTerm,
  listTerms,
  updateTerm,
} from "@/lib/api/terms";
import type { TermFormValues } from "@/lib/validation/schemas";
import { toastError } from "@/lib/utils/toast";

interface TermRow {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  order: number;
  academic_year: string;
}

export default function TermsPage() {
  const queryClient = useQueryClient();
  const { data: years } = useQuery({
    queryKey: ["academic-years"],
    queryFn: () => listAcademicYears(),
  });
  const yearMap = useMemo(
    () => new Map((years?.results ?? []).map((y) => [y.id, y.name])),
    [years]
  );

  const [yearFilter, setYearFilter] = useState("");
  const filterValues = useMemo(() => ({ year: yearFilter }), [yearFilter]);

  const filters = useMemo<FilterDef<TermRow>[]>(
    () => [
      {
        key: "year",
        label: "السنوات",
        options: (years?.results ?? []).map((y) => ({
          value: y.id,
          label: y.name,
        })),
        match: (row, v) => row.academic_year === v,
      },
    ],
    [years]
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["terms"] });

  return (
    <ResourcePage<TermRow, TermFormValues>
      title="الترمات"
      queryKey={["terms"]}
      queryFn={listTerms}
      columns={[
        {
          header: "الاسم",
          render: (t) => <span className="font-medium text-ink">{t.name}</span>,
          sortValue: (t) => t.name,
        },
        {
          header: "السنة",
          render: (t) => (
            <span className="text-xs text-ink-400">
              {yearMap.get(t.academic_year) ?? "—"}
            </span>
          ),
          sortValue: (t) => yearMap.get(t.academic_year) ?? "",
        },
        {
          header: "البداية",
          render: (t) => <span className="text-ink-400">{t.start_date}</span>,
          sortValue: (t) => t.start_date,
        },
        {
          header: "النهاية",
          render: (t) => <span className="text-ink-400">{t.end_date}</span>,
          sortValue: (t) => t.end_date,
        },
        {
          header: "الترتيب",
          render: (t) => <span className="text-ink-400">{t.order}</span>,
          sortValue: (t) => t.order,
        },
      ]}
      searchPredicate={(t, q) =>
        t.name.toLowerCase().includes(q) ||
        (yearMap.get(t.academic_year) ?? "").toLowerCase().includes(q)
      }
      searchPlaceholder="ابحث باسم الترم..."
      filters={filters}
      filterValues={filterValues}
      onFilterChange={(_, value) => setYearFilter(value)}
      createLabel="+ إضافة ترم"
      formTitle="إضافة ترم"
      FormComponent={TermForm}
      EditFormComponent={TermForm}
      rowToFormValues={(t) => ({
        academic_year: t.academic_year,
        name: t.name,
        start_date: t.start_date,
        end_date: t.end_date,
        order: t.order,
      })}
      deleteLabel={(t) => t.name}
      onSubmit={async (values) => {
        try {
          await createTerm(values);
          await invalidate();
        } catch (err) {
          toastError(err, "تعذّرت إضافة الترم.");
          throw err;
        }
      }}
      onUpdate={async (id, values) => {
        try {
          await updateTerm(id, values);
          await invalidate();
        } catch (err) {
          toastError(err, "تعذّر تحديث الترم.");
          throw err;
        }
      }}
      onDelete={async (id) => {
        try {
          await deleteTerm(id);
          await invalidate();
        } catch (err) {
          toastError(err, "تعذّر حذف الترم.");
          throw err;
        }
      }}
      emptyTitle="لا توجد ترمات بعد"
      emptyDescription="أضف ترمًا واختر له سنة دراسية، أو أنشئ واحدة أثناء الإضافة."
    />
  );
}