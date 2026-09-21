"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AcademicYearForm } from "@/components/academic-years/AcademicYearForm";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import { createAcademicYear, listAcademicYears } from "@/lib/api/academicYears";
import type { AcademicYearFormValues } from "@/lib/validation/schemas";

export default function AcademicYearsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["academic-years"],
    queryFn: listAcademicYears,
  });

  async function handleCreate(values: AcademicYearFormValues) {
    await createAcademicYear(values);
    await queryClient.invalidateQueries({ queryKey: ["academic-years"] });
    setModalOpen(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">السنوات الدراسية</h1>
        <Button onClick={() => setModalOpen(true)}>+ إضافة سنة دراسية</Button>
      </div>

      {isLoading && <Spinner />}
      {isError && <ErrorState message="تعذّر تحميل السنوات الدراسية." />}
      {!isLoading && !isError && data?.results.length === 0 && (
        <EmptyState title="لا توجد سنوات دراسية بعد" description="ابدأ بإضافة أول سنة دراسية لمؤسستك." />
      )}

      {!isLoading && !isError && data && data.results.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-ink-50 text-start text-ink-700">
              <tr>
                <th className="px-4 py-3 text-start font-medium">الاسم</th>
                <th className="px-4 py-3 text-start font-medium">البداية</th>
                <th className="px-4 py-3 text-start font-medium">النهاية</th>
                <th className="px-4 py-3 text-start font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((year) => (
                <tr key={year.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{year.name}</td>
                  <td className="px-4 py-3 text-ink-400">{year.start_date}</td>
                  <td className="px-4 py-3 text-ink-400">{year.end_date}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        year.is_active ? "bg-success/10 text-success" : "bg-ink-50 text-ink-400"
                      }`}
                    >
                      {year.is_active ? "نشطة" : "غير نشطة"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <QuickCreateModal open={modalOpen} onClose={() => setModalOpen(false)} title="إضافة سنة دراسية">
        <AcademicYearForm onSubmit={handleCreate} />
      </QuickCreateModal>
    </div>
  );
}
