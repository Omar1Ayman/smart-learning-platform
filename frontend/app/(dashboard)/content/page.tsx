"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { ContentForm } from "@/components/content/ContentForm";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import { createContent, downloadContent, listContent, type ContentType } from "@/lib/api/content";
import type { ContentFormValues } from "@/lib/validation/schemas";

const TYPE_LABEL: Record<ContentType, string> = {
  PDF: "PDF",
  VIDEO: "فيديو",
  IMAGE: "صورة",
  DOCUMENT: "مستند",
  EXTERNAL_LINK: "رابط خارجي",
  TEXT: "نص",
  BOOK: "كتاب",
  SUMMARY: "ملخّص",
  LESSON_EXPLANATION: "شرح درس",
  CHAPTER_RESOURCE: "مرفق فصل",
};

export default function ContentPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({ queryKey: ["content"], queryFn: listContent });

  async function handleCreate(values: ContentFormValues, file: File | null) {
    await createContent({ ...values, file: file ?? undefined });
    await queryClient.invalidateQueries({ queryKey: ["content"] });
    setModalOpen(false);
  }

  async function handleOpen(id: string) {
    setOpeningId(id);
    try {
      const result = await downloadContent(id);
      if (result.kind === "json") {
        if (result.data.external_url) window.open(result.data.external_url, "_blank");
        else alert(result.data.text_body ?? "");
      } else {
        const url = URL.createObjectURL(result.blob);
        window.open(url, "_blank");
      }
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">المحتوى</h1>
        <Button onClick={() => setModalOpen(true)}>+ إضافة محتوى</Button>
      </div>

      {isLoading && <Spinner />}
      {isError && <ErrorState message="تعذّر تحميل المحتوى." />}
      {!isLoading && !isError && data?.results.length === 0 && (
        <EmptyState title="لا يوجد محتوى بعد" description="ارفع ملفًا أو أضف رابطًا أو نصًا ليظهر هنا." />
      )}

      {!isLoading && !isError && data && data.results.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-ink-50 text-start text-ink-700">
              <tr>
                <th className="px-4 py-3 text-start font-medium">العنوان</th>
                <th className="px-4 py-3 text-start font-medium">النوع</th>
                <th className="px-4 py-3 text-start font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((item) => (
                <tr key={item.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{item.title}</td>
                  <td className="px-4 py-3 text-ink-400">{TYPE_LABEL[item.content_type]}</td>
                  <td className="px-4 py-3 text-end">
                    <Button variant="ghost" onClick={() => handleOpen(item.id)} disabled={openingId === item.id}>
                      {openingId === item.id ? "..." : "فتح"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <QuickCreateModal open={modalOpen} onClose={() => setModalOpen(false)} title="إضافة محتوى">
        <ContentForm onSubmit={handleCreate} />
      </QuickCreateModal>
    </div>
  );
}
