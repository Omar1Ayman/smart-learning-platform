"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ContentCard } from "@/components/content/ContentCard";
import { ContentForm } from "@/components/content/ContentForm";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ListPage } from "@/components/ui/ListPage";
import { Modal } from "@/components/ui/Modal";
import {
  typesInGroup,
  deleteContent,
  downloadContent,
  listContent,
  updateContent,
  type ContentGroup,
  type ContentItem,
  type UploadProgress,
} from "@/lib/api/content";
import { useCanWriteContent } from "@/lib/auth/useCanWrite";
import { useUrlEnumState } from "@/lib/hooks/useUrlEnumState";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type { ContentFormValues } from "@/lib/validation/schemas";

const PAGE_SIZE = 24;

const GROUP_LABEL: Record<ContentGroup, string> = {
  all: "الكل",
  files: "ملفات",
  texts: "نصوص",
  links: "روابط",
};

const GROUP_KEYS = Object.keys(GROUP_LABEL) as ContentGroup[];

interface TextPreview {
  title: string;
  body: string;
}

export default function ContentPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canWrite = useCanWriteContent();

  const [page, setPage] = useUrlState("p", "1");
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const [group, setGroup] = useUrlEnumState<ContentGroup>(
    "type",
    GROUP_KEYS,
    "all",
  );
  const [status, setStatus] = useUrlState("status", "");
  const [search, setSearch] = useUrlState("q", "");

  const [editTarget, setEditTarget] = useState<ContentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContentItem | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<TextPreview | null>(null);

  const contentTypes = typesInGroup(group);
  const publishedFilter =
    status === "published" ? true : status === "draft" ? false : undefined;

  const query = useQuery({
    queryKey: ["content", pageNum, PAGE_SIZE, search, group, status],
    queryFn: () =>
      listContent({
        page: pageNum,
        page_size: PAGE_SIZE,
        search: search || undefined,
        content_type__in: contentTypes?.join(","),
        is_published: publishedFilter,
        ordering: "-created_at",
      }),
  });

  const items = query.data?.results ?? [];
  const total = query.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasActiveFilter = !!search || group !== "all" || !!status;

  async function handleOpen(item: ContentItem) {
    setOpeningId(item.id);
    try {
      const result = await downloadContent(item.id);
      if (result.kind === "json") {
        if (result.data.external_url) {
          window.open(result.data.external_url, "_blank", "noopener,noreferrer");
        } else if (result.data.text_body) {
          setTextPreview({
            title: item.title,
            body: result.data.text_body,
          });
        } else {
          toastError(new Error("لا يوجد محتوى لعرضه."), "تعذّر فتح المادة التعليمية.");
        }
      } else {
        const url = URL.createObjectURL(result.blob);
        window.open(url, "_blank");
      }
    } catch (error) {
      toastError(error, "تعذّر فتح المادة التعليمية.");
    } finally {
      setOpeningId(null);
    }
  }

  async function handleUpdate(
    values: ContentFormValues,
    file: File | null,
    onProgress?: UploadProgress,
  ) {
    if (!editTarget) return;
    try {
      await updateContent(editTarget.id, {
        ...values,
        file: file ?? undefined,
      }, onProgress);
      await queryClient.invalidateQueries({ queryKey: ["content"] });
      toastSuccess("تم تحديث المادة التعليمية");
      setEditTarget(null);
    } catch (error) {
      toastError(error, "تعذّر تحديث المادة التعليمية.");
    }
  }

  async function handlePublicationToggle(item: ContentItem) {
    try {
      await updateContent(item.id, { is_published: !item.is_published });
      await queryClient.invalidateQueries({ queryKey: ["content"] });
      toastSuccess(
        item.is_published
          ? "تم إلغاء نشر المادة التعليمية"
          : "تم نشر المادة التعليمية",
      );
    } catch (error) {
      toastError(error, "تعذّر تحديث حالة النشر.");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusyDelete(true);
    try {
      await deleteContent(deleteTarget.id);
      await queryClient.invalidateQueries({ queryKey: ["content"] });
      toastSuccess("تم حذف المادة التعليمية");
      setDeleteTarget(null);
    } catch (error) {
      toastError(error, "تعذّر حذف المادة التعليمية.");
    } finally {
      setBusyDelete(false);
    }
  }

  function buildActions(item: ContentItem) {
    return [
      ...(canWrite
        ? [
            {
              label: item.is_published ? "إلغاء النشر" : "نشر",
              onClick: () => handlePublicationToggle(item),
            },
            { label: "تعديل", onClick: () => setEditTarget(item) },
            {
              label: "حذف",
              variant: "danger" as const,
              onClick: () => setDeleteTarget(item),
            },
          ]
        : []),
    ];
  }

  function clearFilters() {
    setSearch("");
    setGroup("all");
    setStatus("");
    setPage("1");
  }

  return (
    <>
      <ListPage
        title="المكتبة التعليمية"
        description={`${total} مادة تعليمية. ابحث عن الملفات والنصوص والروابط، وأضف مادة عامة أو اربطها بصف أو مقرر أو درس.`}
        actions={
          canWrite ? (
            <Button onClick={() => router.push("/content/new")}>
              إضافة مادة تعليمية
            </Button>
          ) : undefined
        }
        tabs={GROUP_KEYS.map((key) => ({ key, label: GROUP_LABEL[key] }))}
        activeTab={group}
        onTabChange={(key) => {
          setGroup(key as ContentGroup);
          setPage("1");
        }}
        searchValue={search}
        searchPlaceholder="ابحث باسم المادة..."
        onSearchChange={(value) => {
          setSearch(value);
          setPage("1");
        }}
        filters={
          canWrite
            ? [
                {
                  key: "status",
                  label: "الحالات",
                  value: status,
                  options: [
                    { value: "published", label: "منشور" },
                    { value: "draft", label: "مسودة" },
                  ],
                  onChange: (value) => {
                    setStatus(value);
                    setPage("1");
                  },
                },
              ]
            : []
        }
        hasActiveFilter={hasActiveFilter}
        onClearFilters={clearFilters}
        isLoading={query.isLoading}
        isError={query.isError}
        errorMessage="تعذّر تحميل المكتبة التعليمية."
        onRetry={() => query.refetch()}
        isEmpty={items.length === 0}
        emptyVariant={hasActiveFilter ? "no-results" : "no-data"}
        emptyIcon="📚"
        emptyTitle={hasActiveFilter ? "لا توجد نتائج مطابقة" : "المكتبة فارغة"}
        emptyDescription={
          hasActiveFilter
            ? "غيّر كلمات البحث أو أزل الفلاتر."
            : canWrite
              ? "أضف ملفًا أو نصًا أو رابطًا. ولإضافة مادة إلى درس، ابدأ من صفحة ذلك الدرس."
              : "ستظهر هنا المواد التعليمية المتاحة لك."
        }
        emptyAction={
          hasActiveFilter ? (
            <Button variant="secondary" onClick={clearFilters}>
              مسح الفلاتر
            </Button>
          ) : canWrite ? (
            <Button onClick={() => router.push("/content/new")}>
              إضافة مادة تعليمية
            </Button>
          ) : undefined
        }
        pagination={
          totalPages > 1
            ? {
                page: pageNum,
                totalPages,
                totalItems: total,
                pageSize: PAGE_SIZE,
                onPageChange: (nextPage) => setPage(String(nextPage)),
                isLoading: query.isFetching,
              }
            : undefined
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <ContentCard
              key={item.id}
              item={item}
              actions={buildActions(item)}
              onOpen={() => handleOpen(item)}
              isOpening={openingId === item.id}
            />
          ))}
        </div>
      </ListPage>

      {canWrite && editTarget && (
        <QuickCreateModal
          open
          onClose={() => setEditTarget(null)}
          title={`تعديل المادة — ${editTarget.title}`}
        >
          <ContentForm
            compact
            onSubmit={handleUpdate}
            onCancel={() => setEditTarget(null)}
            initialValues={{
              title: editTarget.title,
              content_type: editTarget.content_type,
              description: editTarget.description,
              external_url: editTarget.external_url,
              text_body: editTarget.text_body,
              stage: editTarget.stage ?? "",
              grade: editTarget.grade ?? "",
              group: editTarget.group ?? "",
              subject: editTarget.subject ?? "",
              course: editTarget.course ?? "",
              chapter: editTarget.chapter ?? "",
              lesson: editTarget.lesson ?? "",
              academic_year: editTarget.academic_year ?? "",
              term: editTarget.term ?? "",
            }}
            initialFileName={editTarget.original_filename}
          />
        </QuickCreateModal>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="تأكيد الحذف"
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

      <Modal
        open={!!textPreview}
        onClose={() => setTextPreview(null)}
        title={textPreview?.title ?? "معاينة المادة"}
      >
        <div className="max-h-[65vh] overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-ink-700">
          {textPreview?.body}
        </div>
      </Modal>
    </>
  );
}
