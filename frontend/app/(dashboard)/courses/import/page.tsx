"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CheckCircle, Download, Upload, XCircle } from "@/components/ui/icons";
import { ErrorState } from "@/components/ui/States";
import {
  commitCurriculumImport,
  downloadCurriculumTemplate,
  previewCurriculumImport,
  type CurriculumImportPreview,
} from "@/lib/api/academics";
import { useAuthStore } from "@/lib/auth/store";
import { extractErrorMessage, toastError, toastSuccess } from "@/lib/utils/toast";

const CREATE_LABEL: Record<string, string> = {
  stages: "مراحل",
  grades: "صفوف",
  subjects: "مواد أكاديمية",
  courses: "مواد دراسية",
  chapters: "فصول",
  lessons: "دروس",
};

export default function ImportCurriculumPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canImport = role === "OWNER" || role === "ADMIN";

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CurriculumImportPreview | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewMutation = useMutation({
    mutationFn: () => previewCurriculumImport(file!),
    onSuccess: (data) => setPreview(data),
    onError: (err) => toastError(err, "تعذّرت المعاينة."),
  });

  const commitMutation = useMutation({
    mutationFn: () => commitCurriculumImport(file!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["stages"] });
      queryClient.invalidateQueries({ queryKey: ["grades"] });
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      queryClient.invalidateQueries({ queryKey: ["setup-status"] });
      const r = data.result;
      toastSuccess(
        `تم إنشاء ${r.created_courses} مادة، ${r.created_chapters} فصل، ${r.created_lessons} درس`
      );
      setTimeout(() => router.push("/courses"), 800);
    },
    onError: (err) => {
      const msg = extractErrorMessage(err, "تعذّر الاستيراد.");
      toastError(new Error(msg), "");
    },
  });

  const canPreview =
    !!file && !previewMutation.isPending && !commitMutation.isPending;
  const canCommit =
    !!preview &&
    preview.summary.errors === 0 &&
    preview.summary.valid > 0 &&
    !commitMutation.isPending;

  if (!canImport) {
    return (
      <ErrorState message="هذا الإجراء متاح فقط لمالك أو مسؤول المؤسسة." />
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <Link href="/courses" className="text-sm text-ink-400 hover:text-ink">
          ← المواد الدراسية
        </Link>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">
          استيراد المنهج الدراسي
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          ارفع ملف Excel يحتوي على المراحل والصفوف والمواد والفصول والدروس
          دفعة واحدة.
        </p>
      </div>

      {/* Step 1: template */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
                1
              </span>
              حمّل القالب
            </h2>
            <p className="mt-1 text-sm text-ink-400">
              يحتوي على 5 أمثلة توضح الشكل. كل صف = درس داخل (سنة، مرحلة،
              صف، مادة، مادة دراسية، فصل).
            </p>
            <p className="mt-2 rounded-md bg-info/5 px-2 py-1.5 text-xs text-info">
              ℹ️ السنة الدراسية يجب أن تكون موجودة مسبقًا. أنشئها من صفحة
              «السنوات الدراسية» أولاً.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => downloadCurriculumTemplate().catch(() => {})}
            className="shrink-0"
          >
            <Download size={14} />
            تحميل
          </Button>
        </div>
      </div>

      {/* Step 2: upload */}
      <div className="card p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
            2
          </span>
          ارفع الملف
        </h2>
        <p className="mt-1 text-sm text-ink-400">
          CSV أو XLSX — الحد الأقصى 10 ميجابايت.
        </p>

        <div className="mt-3 flex flex-col gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
            }}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
          />

          {file && !preview && (
            <Button
              onClick={() => previewMutation.mutate()}
              disabled={!canPreview}
              variant="secondary"
            >
              <Upload size={14} />
              {previewMutation.isPending
                ? "جارٍ الفحص..."
                : "فحص الملف (بدون حفظ)"}
            </Button>
          )}

          {preview && (
            <>
              {/* Per-level create counts */}
              <div className="grid grid-cols-3 gap-2 rounded-lg border border-line bg-ink-50/30 p-3 sm:grid-cols-6">
                {Object.entries(preview.will_create).map(([key, count]) => (
                  <div key={key} className="text-center">
                    <p className="text-[10px] text-ink-400">
                      {CREATE_LABEL[key]}
                    </p>
                    <p
                      className={`mt-1 font-display text-lg font-bold ${
                        count > 0 ? "text-ink" : "text-ink-300"
                      }`}
                    >
                      {count}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-4 gap-2 rounded-lg border border-line bg-paper-muted/30 p-3">
                <div className="text-center">
                  <p className="text-xs text-ink-400">الإجمالي</p>
                  <p className="mt-1 font-display text-lg font-bold text-ink">
                    {preview.summary.total}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-ink-400">صالح</p>
                  <p className="mt-1 font-display text-lg font-bold text-success">
                    {preview.summary.valid}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-ink-400">مُتخطّى</p>
                  <p className="mt-1 font-display text-lg font-bold text-accent-dark">
                    {preview.summary.skip}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-ink-400">أخطاء</p>
                  <p
                    className={`mt-1 font-display text-lg font-bold ${
                      preview.summary.errors > 0 ? "text-danger" : "text-ink-400"
                    }`}
                  >
                    {preview.summary.errors}
                  </p>
                </div>
              </div>

              {preview.summary.errors > 0 && (
                <div className="rounded-lg bg-danger/5 px-3 py-2 text-sm text-danger">
                  {preview.summary.errors} سطر به أخطاء — صحّح الملف وأعد
                  الرفع.
                </div>
              )}

              {/* Rows table */}
              <div className="max-h-96 overflow-y-auto rounded-lg border border-line">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-ink-50 text-start text-ink-700">
                    <tr>
                      <th className="px-2 py-2 text-start font-medium">#</th>
                      <th className="px-2 py-2 text-start font-medium">السنة</th>
                      <th className="px-2 py-2 text-start font-medium">الصف</th>
                      <th className="px-2 py-2 text-start font-medium">المادة الدراسية</th>
                      <th className="px-2 py-2 text-start font-medium">الفصل / الدرس</th>
                      <th className="px-2 py-2 text-start font-medium">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => (
                      <tr
                        key={r.row}
                        className={`border-b border-line last:border-0 ${
                          r.status === "error"
                            ? "bg-danger/5"
                            : r.status === "skip"
                            ? "bg-accent/5"
                            : ""
                        }`}
                      >
                        <td className="px-2 py-2 text-ink-400">{r.row}</td>
                        <td className="px-2 py-2 text-xs text-ink-700">
                          {r.academic_year}
                        </td>
                        <td className="max-w-[100px] truncate px-2 py-2 text-xs text-ink-700">
                          {r.stage} · {r.grade}
                        </td>
                        <td className="max-w-[140px] truncate px-2 py-2 text-xs text-ink-700">
                          {r.course}
                        </td>
                        <td className="max-w-[180px] truncate px-2 py-2 text-xs text-ink-700">
                          {r.chapter}
                          {r.lesson && ` · ${r.lesson}`}
                        </td>
                        <td className="px-2 py-2">
                          {r.status === "valid" && (
                            <span className="inline-flex items-center gap-1 text-xs text-success">
                              <CheckCircle size={12} /> صالح
                            </span>
                          )}
                          {r.status === "skip" && (
                            <span className="text-xs text-accent-dark">
                              مُتخطّى
                            </span>
                          )}
                          {r.status === "error" && (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1 text-xs text-danger">
                                <XCircle size={12} /> خطأ
                              </span>
                              <span className="text-[10px] text-danger">
                                {r.errors.join(" · ")}
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Step 3: commit */}
              {preview.summary.errors === 0 && preview.summary.valid > 0 && (
                <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                  <p className="text-sm font-medium text-ink-700">
                    جاهز للاستيراد
                  </p>
                  <p className="mt-1 text-xs text-ink-400">
                    سيُنشأ {preview.will_create.courses} مادة دراسية،{" "}
                    {preview.will_create.chapters} فصل،{" "}
                    {preview.will_create.lessons} درس. العناصر الموجودة
                    ستُعاد استخدامها.
                  </p>
                  <Button
                    onClick={() => commitMutation.mutate()}
                    disabled={!canCommit}
                    className="mt-3"
                  >
                    {commitMutation.isPending
                      ? "جارٍ الاستيراد..."
                      : `تنفيذ الاستيراد (${preview.summary.valid} صف)`}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}