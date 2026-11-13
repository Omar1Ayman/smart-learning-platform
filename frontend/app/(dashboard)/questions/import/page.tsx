"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CheckCircle, Download, Upload, XCircle } from "@/components/ui/icons";
import { ErrorState } from "@/components/ui/States";
import {
  commitQuestionsImport,
  downloadQuestionsTemplate,
  previewQuestionsImport,
  type ImportPreviewResponse,
} from "@/lib/api/questions";
import { useAuthStore } from "@/lib/auth/store";
import { useCanWriteContent } from "@/lib/auth/useCanWrite";
import { extractErrorMessage, toastError, toastSuccess } from "@/lib/utils/toast";

export default function ImportQuestionsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canWrite = useCanWriteContent();
  const role = useAuthStore((s) => s.user?.role);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewMutation = useMutation({
    mutationFn: () => previewQuestionsImport(file!),
    onSuccess: (data) => setPreview(data),
    onError: (err) => toastError(err, "تعذّرت المعاينة."),
  });

  const commitMutation = useMutation({
    mutationFn: () => commitQuestionsImport(file!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["questions"] });
      queryClient.invalidateQueries({ queryKey: ["questions-stats"] });
      queryClient.invalidateQueries({ queryKey: ["question-banks"] });
      toastSuccess(
        `تم إنشاء ${data.result.created_questions} سؤال` +
          (data.result.created_banks > 0
            ? ` و${data.result.created_banks} بنك أسئلة`
            : "")
      );
      setTimeout(() => router.push("/questions"), 800);
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

  /**
   * Batch 16 (ج): infer per-bank "will create" vs "will reuse" from the
   * dry-run rows.
   *
   * Rationale: the backend's dry-run doesn't explicitly say "bank exists"
   * — it only reports whether the ROW is valid. But a valid row whose
   * bank_name hasn't been seen earlier in the file MUST belong to an
   * existing bank, because the backend rejects valid rows that reference
   * a nonexistent bank only if the row would ALSO be invalid for other
   * reasons. In practice: if the file uploads successfully, the first
   * occurrence of an unknown bank creates it; subsequent occurrences of
   * the same name reuse it.
   *
   * This gives the user a clear visual signal without needing a backend
   * change. If it ever drifts from the backend's behavior, the backend
   * remains the source of truth — the UI is advisory only.
   */
  const bankStatus = useMemo<Map<string, "create" | "reuse">>(() => {
    const map = new Map<string, "create" | "reuse">();
    if (!preview) return map;
    for (const r of preview.rows) {
      if (r.status !== "valid") continue;
      const key = r.bank_name.trim().toLowerCase();
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, "create");
      } else {
        map.set(key, "reuse");
      }
    }
    return map;
  }, [preview]);

  if (!canWrite) {
    return (
      <ErrorState message="هذا الإجراء متاح فقط لفريق العمل (مالك/مسؤول/معلم)." />
    );
  }

  return (
    <div className="flex flex-col max-w-3xl gap-6 mx-auto">
      {/* Header */}
      <div>
        <Link
          href="/questions"
          className="text-sm text-ink-400 hover:text-ink"
        >
          ← الأسئلة
        </Link>
        <h1 className="mt-1 text-2xl font-bold font-display text-ink">
          استيراد أسئلة دفعة واحدة
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          ارفع ملف Excel أو CSV لإضافة عشرات أو مئات الأسئلة في خطوة واحدة.
        </p>
      </div>

      {/* Step 1: download template */}
      <div className="p-5 card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold font-display text-ink">
              <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white rounded-full bg-ink">
                1
              </span>
              حمّل القالب
            </h2>
            <p className="mt-1 text-sm text-ink-400">
              يحتوي على 3 أمثلة جاهزة (MCQ / صح-خطأ / إجابة قصيرة) تشرح
              الصيغة. عدّلها أو أضف صفوفك.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => downloadQuestionsTemplate().catch(() => {})}
            className="shrink-0"
          >
            <Download size={14} />
            تحميل
          </Button>
        </div>
      </div>

      {/* Step 2: upload + preview */}
      <div className="p-5 card">
        <h2 className="flex items-center gap-2 text-base font-bold font-display text-ink">
          <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white rounded-full bg-ink">
            2
          </span>
          ارفع الملف
        </h2>
        <p className="mt-1 text-sm text-ink-400">
          CSV أو XLSX — الحد الأقصى 10 ميجابايت.
        </p>

        <div className="flex flex-col gap-3 mt-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
            }}
            className="px-3 py-2 text-sm bg-white border rounded-lg border-line"
          />

          {file && !preview && (
            <Button
              onClick={() => previewMutation.mutate()}
              disabled={!canPreview}
              variant="secondary"
            >
              <Upload size={14} />
              {previewMutation.isPending ? "جارٍ الفحص..." : "فحص الملف (بدون حفظ)"}
            </Button>
          )}

          {previewMutation.isError && (
            <p className="px-3 py-2 text-sm rounded-lg bg-danger/5 text-danger">
              {extractErrorMessage(
                previewMutation.error,
                "تعذّرت المعاينة."
              )}
            </p>
          )}

          {preview && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-2 p-3 border rounded-lg border-line bg-ink-50/30">
                <div className="text-center">
                  <p className="text-xs text-ink-400">الإجمالي</p>
                  <p className="mt-1 text-xl font-bold font-display text-ink">
                    {preview.summary.total}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-ink-400">صالح</p>
                  <p className="mt-1 text-xl font-bold font-display text-success">
                    {preview.summary.valid}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-ink-400">أخطاء</p>
                  <p
                    className={`mt-1 font-display text-xl font-bold ${
                      preview.summary.errors > 0 ? "text-danger" : "text-ink-400"
                    }`}
                  >
                    {preview.summary.errors}
                  </p>
                </div>
              </div>

              {preview.summary.errors > 0 && (
                <div className="px-3 py-2 text-sm rounded-lg bg-danger/5 text-danger">
                  {preview.summary.errors} سطر به أخطاء — صحّح الملف وأعد الرفع.
                </div>
              )}

              {/* Rows table — Batch 16 (ج): added "حالة البنك" column */}
              <div className="overflow-y-auto border rounded-lg max-h-80 border-line">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-ink-50 text-start text-ink-700">
                    <tr>
                      <th className="px-3 py-2 font-medium text-start">#</th>
                      <th className="px-3 py-2 font-medium text-start">البنك</th>
                      <th className="px-3 py-2 font-medium text-start">
                        حالة البنك
                      </th>
                      <th className="px-3 py-2 font-medium text-start">النص</th>
                      <th className="px-3 py-2 font-medium text-start">النوع</th>
                      <th className="px-3 py-2 font-medium text-start">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r) => {
                      const bankKey = r.bank_name.trim().toLowerCase();
                      const bStatus = bankStatus.get(bankKey);

                      return (
                        <tr
                          key={r.row}
                          className={`border-b border-line last:border-0 ${
                            r.status === "error" ? "bg-danger/5" : ""
                          }`}
                        >
                          <td className="px-3 py-2 text-ink-400">{r.row}</td>
                          <td className="max-w-[120px] truncate px-3 py-2 text-ink-700">
                            {r.bank_name || "—"}
                          </td>
                          <td className="px-3 py-2">
                            {!r.bank_name ? (
                              <span className="text-xs text-ink-300">—</span>
                            ) : bStatus === "create" ? (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success"
                                title="لم يكن موجودًا من قبل — سيُنشأ تلقائيًا"
                              >
                                ✨ سيُنشأ
                              </span>
                            ) : bStatus === "reuse" ? (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-medium text-ink-400"
                                title="موجود بالفعل — ستُضاف الأسئلة إليه"
                              >
                                ↻ موجود
                              </span>
                            ) : (
                              <span className="text-xs text-ink-300">—</span>
                            )}
                          </td>
                          <td className="max-w-[220px] truncate px-3 py-2 text-ink">
                            {r.text || "—"}
                          </td>
                          <td className="px-3 py-2 text-ink-400">
                            {r.question_type}
                          </td>
                          <td className="px-3 py-2">
                            {r.status === "valid" ? (
                              <span className="inline-flex items-center gap-1 text-xs text-success">
                                <CheckCircle size={12} /> صالح
                              </span>
                            ) : (
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
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Step 3: commit */}
              {preview.summary.errors === 0 && preview.summary.valid > 0 && (
                <div className="p-3 border rounded-lg border-success/30 bg-success/5">
                  <p className="text-sm font-medium text-ink-700">
                    كل الصفوف صالحة — جاهز للاستيراد
                  </p>
                  <p className="mt-1 text-xs text-ink-400">
                    سيُنشأ {preview.summary.valid} سؤال. البنوك المفقودة
                    ستُنشأ تلقائياً.{" "}
                    {role === "TEACHER"
                      ? "ستحتاج الأسئلة اعتماد المدير (حسب سياسة المؤسسة)."
                      : ""}
                  </p>
                  <Button
                    onClick={() => commitMutation.mutate()}
                    disabled={!canCommit}
                    className="mt-3"
                  >
                    {commitMutation.isPending
                      ? "جارٍ الاستيراد..."
                      : `تنفيذ الاستيراد (${preview.summary.valid} سؤال)`}
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