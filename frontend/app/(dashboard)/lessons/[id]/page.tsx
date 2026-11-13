"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use, useState } from "react";
import { ContentForm } from "@/components/content/ContentForm";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import {
  createContent,
  deleteContent,
  updateContent,
  type ContentItem,
  type ContentType,
} from "@/lib/api/content";
import { getLessonDetail } from "@/lib/api/lessons";
import { useCanWriteContent } from "@/lib/auth/useCanWrite";
import { toastError, toastSuccess } from "@/lib/utils/toast";
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

export default function LessonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const canWrite = useCanWriteContent();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ContentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContentItem | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["lesson-detail", id],
    queryFn: () => getLessonDetail(id),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["lesson-detail", id] });
    await queryClient.invalidateQueries({ queryKey: ["content"] });
  };

async function handleCreate(
  values: ContentFormValues,
  file: File | null,
  onProgress?: (pct: number) => void
) {
  if (!data) return;
  try {
    await createContent(
      {
        ...values,
        course: data.course.id,
        chapter: data.chapter.id,
        lesson: data.lesson.id,
        file: file ?? undefined,
      },
      onProgress
    );
    await invalidate();
    toastSuccess("تمت إضافة المادة التعليمية للدرس");
    setCreateOpen(false);
  } catch (err) {
    toastError(err, "تعذّر إضافة المادة التعليمية.");
  }
}
 async function handleUpdate(
  values: ContentFormValues,
  file: File | null,
  onProgress?: (pct: number) => void
) {
  if (!editTarget) return;
  try {
    await updateContent(
      editTarget.id,
      { ...values, file: file ?? undefined },
      onProgress
    );
    await invalidate();
    toastSuccess("تم تحديث المادة التعليمية");
    setEditTarget(null);
  } catch (err) {
    toastError(err, "تعذّر تحديث المادة التعليمية.");
  }
}
  async function handleDelete() {
    if (!deleteTarget) return;
    setBusyDelete(true);
    try {
      await deleteContent(deleteTarget.id);
      await invalidate();
      toastSuccess("تم حذف المادة التعليمية");
      setDeleteTarget(null);
    } catch (err) {
      toastError(err, "تعذّر حذف المادة التعليمية.");
    } finally {
      setBusyDelete(false);
    }
  }

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message="تعذّر تحميل الدرس." />;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <Link
          href={`/courses/${data.course.id}#chapter-${data.chapter.id}`}
          className="text-sm text-ink-400 hover:text-ink"
        >
          ← {data.course.name} · {data.chapter.name}
        </Link>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">
          {data.lesson.name}
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          {data.course.subject_name} · {data.course.grade_name} · {data.chapter.name}
        </p>
      </div>

      {/* Prev/Next nav */}
      <div className="flex items-center justify-between gap-3">
        {data.nav.prev ? (
          <Link href={`/lessons/${data.nav.prev.id}`}>
            <Button variant="ghost" className="text-xs">
              ← {data.nav.prev.name}
            </Button>
          </Link>
        ) : (
          <div />
        )}
        {data.nav.next ? (
          <Link href={`/lessons/${data.nav.next.id}`}>
            <Button variant="ghost" className="text-xs">
              {data.nav.next.name} →
            </Button>
          </Link>
        ) : (
          <div />
        )}
      </div>

      {/* Content list */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-bold text-ink">
            المواد التعليمية للدرس ({data.content.length})
          </h2>
          {canWrite && (
            <Button onClick={() => setCreateOpen(true)} className="text-sm">
              + أضف مادة تعليمية
            </Button>
          )}
        </div>

        {data.content.length === 0 ? (
          <EmptyState
            title="لا يوجد محتوى بعد"
            description={
              canWrite
                ? "أضف ملفًا أو فيديو أو نصًا لهذا الدرس. الدرس نفسه يُدار من صفحة المقرر."
                : "لم يضف المعلم مواد تعليمية لهذا الدرس بعد."
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {data.content.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{c.title}</p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {TYPE_LABEL[c.content_type as ContentType] ?? c.content_type}
                    {!c.is_published && " · غير منشور"}
                  </p>
                </div>
                {canWrite && (
                  <ActionMenu
                    items={[
                      {
                        label: "تعديل",
                        onClick: () => setEditTarget(c as unknown as ContentItem),
                      },
                      {
                        label: "حذف",
                        variant: "danger",
                        onClick: () => setDeleteTarget(c as unknown as ContentItem),
                      },
                    ]}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Create modal — locked scope (this lesson's course/chapter/lesson) */}
      {canWrite && (
        <QuickCreateModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          title={`إضافة مادة تعليمية — ${data.lesson.name}`}
        >
          <ContentForm
            compact
            onSubmit={handleCreate}
            initialScope={{
              course: data.course.id,
              chapter: data.chapter.id,
              lesson: data.lesson.id,
            }}
            lockedScope
          />
        </QuickCreateModal>
      )}

      {/* Edit modal — uses existing content values + scope locked */}
      {canWrite && editTarget && (
        <QuickCreateModal
          open={true}
          onClose={() => setEditTarget(null)}
          title={`تعديل المادة التعليمية — ${editTarget.title}`}
        >
          <ContentForm
            compact
            onSubmit={handleUpdate}
            initialValues={{
              title: editTarget.title,
              content_type: editTarget.content_type,
              description: editTarget.description,
              external_url: editTarget.external_url,
              text_body: editTarget.text_body,
              course: editTarget.course ?? data.course.id,
              chapter: editTarget.chapter ?? data.chapter.id,
              lesson: editTarget.lesson ?? data.lesson.id,
              stage: editTarget.stage ?? "",
              grade: editTarget.grade ?? "",
              group: editTarget.group ?? "",
              subject: editTarget.subject ?? "",
              academic_year: editTarget.academic_year ?? "",
              term: editTarget.term ?? "",
            }}
            initialFileName={editTarget.original_filename}
            lockedScope
          />
        </QuickCreateModal>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="تأكيد حذف المادة التعليمية"
        description={
          deleteTarget
            ? `سيتم حذف "${deleteTarget.title}" نهائيًا. لا يمكن التراجع.`
            : ""
        }
        confirmLabel={busyDelete ? "جارٍ الحذف..." : "حذف نهائي"}
        cancelLabel="إلغاء"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        isPending={busyDelete}
      />
    </div>
  );
}