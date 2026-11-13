"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ContentForm } from "@/components/content/ContentForm";
import { Button } from "@/components/ui/Button";
import { PageShell } from "@/components/ui/PageShell";
import {
  createContent,
  type UploadProgress,
} from "@/lib/api/content";
import { useCanWriteContent } from "@/lib/auth/useCanWrite";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type { ContentFormValues } from "@/lib/validation/schemas";

export default function NewContentPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canWrite = useCanWriteContent();

  async function handleCreate(
    values: ContentFormValues,
    file: File | null,
    onProgress?: UploadProgress,
  ) {
    try {
      await createContent({ ...values, file: file ?? undefined }, onProgress);
      await queryClient.invalidateQueries({ queryKey: ["content"] });
      toastSuccess("تمت إضافة المادة التعليمية");
      router.replace("/content");
    } catch (error) {
      toastError(error, "تعذّرت إضافة المادة التعليمية.");
    }
  }

  if (!canWrite) {
    return (
      <PageShell
        title="إضافة مادة تعليمية"
        description="إضافة المواد التعليمية متاحة للمستخدمين المخوّلين فقط."
      >
        <div className="card flex flex-col items-start gap-4 p-5">
          <p className="text-sm text-ink-600">
            لا تملك صلاحية إضافة مادة تعليمية.
          </p>
          <Button variant="secondary" onClick={() => router.replace("/content")}>
            العودة إلى المكتبة
          </Button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="إضافة مادة تعليمية"
      description="أدخل بيانات المادة وحدد من سيشاهدها. لن تُحفظ إلا بعد الضغط على زر الإضافة."
      breadcrumb={
        <Link
          href="/content"
          className="text-sm font-medium text-accent-dark hover:underline"
        >
          المكتبة التعليمية
        </Link>
      }
    >
      <div className="card mx-auto w-full max-w-3xl p-4 sm:p-6">
        <ContentForm
          onSubmit={handleCreate}
          onCancel={() => router.push("/content")}
        />
      </div>
    </PageShell>
  );
}
