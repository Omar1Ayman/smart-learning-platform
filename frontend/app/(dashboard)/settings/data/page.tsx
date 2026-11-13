"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { listAcademicYears } from "@/lib/api/academicYears";
import {
  commitStudentImport,
  downloadImportTemplate,
  downloadTenantExport,
  previewStudentImport,
} from "@/lib/api/tenantOps";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type { ImportPreviewResponse } from "@/types";

export default function DataSettingsPage() {
  const { data: years, isLoading: yearsLoading } = useQuery({
    queryKey: ["academic-years"],
    queryFn: () => listAcademicYears(),
  });

  const [exporting, setExporting] = useState(false);
  const [selectedYear, setSelectedYear] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExport() {
    setExporting(true);
    try {
      await downloadTenantExport();
      toastSuccess("تم تنزيل نسخة من بياناتك بنجاح");
    } catch (err) {
      toastError(err, "تعذّر تصدير البيانات.");
    } finally {
      setExporting(false);
    }
  }

  const previewMutation = useMutation({
    mutationFn: () => previewStudentImport(file!, selectedYear),
    onSuccess: (data) => setPreview(data),
    onError: (err) => toastError(err, "تعذّرت المعاينة. تأكد من صحة الملف."),
  });

  const commitMutation = useMutation({
    mutationFn: () => commitStudentImport(file!, selectedYear),
    onSuccess: (data) => {
      toastSuccess(
        `تم استيراد ${data.result.created_students} طالب (${data.result.skipped} تم تخطيهم)`
      );
      setPreview(null);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err) => toastError(err, "تعذّر الاستيراد."),
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display text-ink">إدارة البيانات</h1>
        <p className="mt-1 text-sm text-ink-400">
          تصدير بياناتك أو استيراد طلاب دفعة واحدة من ملف Excel.
        </p>
      </div>

      {/* ============ EXPORT (Premium Card) ============ */}
      <div className="card overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-l from-accent/5 to-transparent pointer-events-none" />
        <div className="p-6 relative">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold font-display text-ink flex items-center gap-2">
                <span className="text-xl">📦</span> تصدير البيانات
              </h2>
              <p className="mt-1 text-sm text-ink-400 max-w-lg leading-relaxed">
                نزّل نسخة احتياطية كاملة من بيانات مؤسستك (CSV داخل ملف ZIP). 
                يمكنك فتحها في Excel. (ملاحظة: ملفات الفيديو والـ PDF غير مضمنة).
              </p>
            </div>
            <Button
              onClick={handleExport}
              disabled={exporting}
              variant="secondary"
              className="shrink-0"
            >
              {exporting ? "جارٍ التحضير..." : "تنزيل النسخة الاحتياطية"}
            </Button>
          </div>
        </div>
      </div>

      {/* ============ IMPORT (Smart UX) ============ */}
      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-lg font-bold font-display text-ink">
              استيراد الطلاب دفعة واحدة
            </h2>
            <p className="mt-1 text-sm text-ink-400">
              أضف عشرات أو مئات الطلاب من ملف Excel أو CSV في خطوة واحدة.
            </p>
          </div>
          <Button variant="ghost" onClick={downloadImportTemplate} className="text-sm">
            ⬇️ تحميل قالب الاستيراد
          </Button>
        </div>

        <div className="flex flex-col gap-5">
          {/* Academic Year Selector */}
          <div className="flex flex-col gap-1.5 max-w-sm">
            <label className="text-sm font-medium text-ink-700">
              السنة الدراسية <span className="text-danger">*</span>
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
              disabled={yearsLoading}
            >
              <option value="">اختر السنة الدراسية...</option>
              {(years?.results ?? []).map((y) => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
          </div>

          {/* Drag & Drop File Zone */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-700">ملف البيانات</label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors cursor-pointer ${
                file ? "border-accent/50 bg-accent/5" : "border-line hover:bg-ink-50/50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setPreview(null);
                }}
                className="hidden"
              />
              <span className="text-3xl mb-2">{file ? "📄" : "📤"}</span>
              <p className="text-sm font-semibold text-ink">
                {file ? file.name : "اضغط لاختيار ملف أو اسحبه هنا"}
              </p>
              <p className="text-xs text-ink-400 mt-1">CSV أو XLSX — الحد الأقصى 10 ميجابايت</p>
            </div>
          </div>

          {file && selectedYear && !preview && (
            <Button
              onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending}
              className="w-full sm:w-auto self-start"
            >
              {previewMutation.isPending ? "جارٍ فحص الملف..." : "فحص الملف (بدون حفظ)"}
            </Button>
          )}

          {/* ============ PREVIEW SECTION ============ */}
          {preview && (
            <div className="mt-4 flex flex-col gap-4 animate-fade-in">
              {/* Summary Metric Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="card p-4 text-center border-line bg-paper-muted/30">
                  <p className="text-xs text-ink-400">الإجمالي</p>
                  <p className="mt-1 text-2xl font-bold text-ink">{preview.summary.total}</p>
                </div>
                <div className="card p-4 text-center border-success/30 bg-success/5">
                  <p className="text-xs text-success-dark font-medium">صالح</p>
                  <p className="mt-1 text-2xl font-bold text-success">{preview.summary.valid}</p>
                </div>
                <div className="card p-4 text-center border-accent/30 bg-accent/5">
                  <p className="text-xs text-accent-dark font-medium">سيتم تخطيه</p>
                  <p className="mt-1 text-2xl font-bold text-accent-dark">{preview.summary.skipped}</p>
                </div>
                <div className={`card p-4 text-center ${preview.summary.errors > 0 ? 'border-danger/30 bg-danger/5' : 'border-line'}`}>
                  <p className={`text-xs font-medium ${preview.summary.errors > 0 ? 'text-danger' : 'text-ink-400'}`}>أخطاء</p>
                  <p className={`mt-1 text-2xl font-bold ${preview.summary.errors > 0 ? 'text-danger' : 'text-ink'}`}>{preview.summary.errors}</p>
                </div>
              </div>

              {/* Preview Table (Truncated for safety) */}
              <div className="overflow-hidden rounded-xl border border-line">
                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-sm relative">
                    <thead className="bg-ink-50 text-start text-ink-700 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 font-medium text-start">#</th>
                        <th className="px-4 py-3 font-medium text-start">البريد</th>
                        <th className="px-4 py-3 font-medium text-start">الاسم</th>
                        <th className="px-4 py-3 font-medium text-start">المجموعة</th>
                        <th className="px-4 py-3 font-medium text-start">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* نعرض أول 100 صف فقط للحفاظ على أداء المتصفح */}
                      {preview.rows.slice(0, 100).map((r) => (
                        <tr key={r.row} className="border-b border-line last:border-0 hover:bg-ink-50/30">
                          <td className="px-4 py-3 text-ink-400">{r.row}</td>
                          <td className="px-4 py-3 font-medium text-ink">{r.email || "—"}</td>
                          <td className="px-4 py-3 text-ink-700">
                            {[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-ink-400">{r.group_name || "—"}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                              r.status === "valid" ? "bg-success/10 text-success" 
                              : r.status === "skip" ? "bg-accent/10 text-accent-dark" 
                              : "bg-danger/10 text-danger"
                            }`}>
                              {r.status === "valid" ? "سيُنشأ" : r.status === "skip" ? "سيُتخطّى" : "خطأ"}
                            </span>
                            {r.errors.length > 0 && (
                              <p className="mt-1 text-[11px] text-danger font-medium">{r.errors.join(" · ")}</p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.rows.length > 100 && (
                  <div className="bg-ink-50 p-2 text-center text-xs text-ink-500">
                    يتم عرض أول 100 صف فقط من أصل {preview.rows.length} صف.
                  </div>
                )}
              </div>

              {/* Actions */}
              {preview.summary.errors === 0 && preview.summary.valid > 0 && (
                <div className="p-4 rounded-xl border border-success/30 bg-success/5 flex items-center justify-between gap-4">
                  <p className="text-sm text-ink-700">
                    الملف جاهز! سيتم إنشاء <strong className="text-success">{preview.summary.valid}</strong> حساب طالب جديد.
                  </p>
                  <Button
                    onClick={() => commitMutation.mutate()}
                    disabled={commitMutation.isPending}
                    variant="secondary"
                    className="shrink-0 bg-success text-white hover:bg-success/90"
                  >
                    {commitMutation.isPending ? "جارٍ الاستيراد..." : `تنفيذ الاستيراد الآن`}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}