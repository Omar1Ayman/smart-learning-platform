"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { TermForm } from "@/components/terms/TermForm";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import { createTerm, listTerms } from "@/lib/api/terms";
import type { TermFormValues } from "@/lib/validation/schemas";

export default function TermsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["terms"],
    queryFn: listTerms,
  });

  async function handleCreate(values: TermFormValues) {
    await createTerm(values);
    await queryClient.invalidateQueries({ queryKey: ["terms"] });
    setModalOpen(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">الترمات</h1>
        <Button onClick={() => setModalOpen(true)}>+ إضافة ترم</Button>
      </div>

      {isLoading && <Spinner />}
      {isError && <ErrorState message="تعذّر تحميل الترمات." />}
      {!isLoading && !isError && data?.results.length === 0 && (
        <EmptyState title="لا توجد ترمات بعد" description="أضف ترمًا واختر له سنة دراسية، أو أنشئ واحدة أثناء الإضافة." />
      )}

      {!isLoading && !isError && data && data.results.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-ink-50 text-start text-ink-700">
              <tr>
                <th className="px-4 py-3 text-start font-medium">الاسم</th>
                <th className="px-4 py-3 text-start font-medium">البداية</th>
                <th className="px-4 py-3 text-start font-medium">النهاية</th>
                <th className="px-4 py-3 text-start font-medium">الترتيب</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((term) => (
                <tr key={term.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{term.name}</td>
                  <td className="px-4 py-3 text-ink-400">{term.start_date}</td>
                  <td className="px-4 py-3 text-ink-400">{term.end_date}</td>
                  <td className="px-4 py-3 text-ink-400">{term.order}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <QuickCreateModal open={modalOpen} onClose={() => setModalOpen(false)} title="إضافة ترم">
        <TermForm onSubmit={handleCreate} />
      </QuickCreateModal>
    </div>
  );
}
