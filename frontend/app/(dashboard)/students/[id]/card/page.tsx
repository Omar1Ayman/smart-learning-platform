"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";
import Barcode from "react-barcode";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/Button";
import { PageShell } from "@/components/ui/PageShell";
import { getStudentDetail } from "@/lib/api/profiles";
import { useAuthStore } from "@/lib/auth/store";
import { useCanWrite } from "@/lib/auth/useCanWrite";

export default function StudentCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const tenantName = useAuthStore((s) => s.user?.tenant?.name);
  const canWrite = useCanWrite();

  const q = useQuery({
    queryKey: ["student-detail", id],
    queryFn: () => getStudentDetail(id),
    retry: (count, err) => {
      const status =
        (err as { status?: number })?.status ??
        (err as { response?: { status?: number } })?.response?.status;
      return status === 404 ? false : count < 2;
    },
  });

  const data = q.data;
  const status =
    (q.error as { status?: number } | null)?.status ??
    (q.error as { response?: { status?: number } } | null)?.response?.status;
  const isNotFound = status === 404;

  const fullName = data
    ? [data.first_name, data.last_name].filter(Boolean).join(" ") || data.email
    : "";

  const missingCode = data && !data.student_code;

  return (
    <PageShell
      title="بطاقة الطالب"
      description={fullName || undefined}
      isLoading={q.isLoading}
      isError={q.isError}
      errorMessage={
        isNotFound
          ? "الطالب غير موجود."
          : missingCode
            ? "لا يمكن إصدار البطاقة — لم يُنشأ كود لهذا الطالب بعد."
            : "تعذّر تحميل بيانات الطالب."
      }
      onRetry={isNotFound || missingCode ? undefined : () => q.refetch()}
      actions={
        <>
          <Link href={`/students/${id}`}>
            <Button variant="secondary">← بيانات الطالب</Button>
          </Link>
          {data?.student_code && (
            <Button onClick={() => window.print()}>🖨️ طباعة</Button>
          )}
        </>
      }
    >
      {data && missingCode && (
        <div className="max-w-2xl p-6 mx-auto card border-danger/30 bg-danger/5">
          <p className="text-lg font-bold font-display text-danger">
            ⚠️ لم يُنشأ كود لهذا الطالب بعد
          </p>
          <p className="mt-2 text-sm text-ink-700">
            لا يمكن إصدار بطاقة بدون كود فريد. تواصل مع المسؤول التقني لإكمال
            إعداد البيانات.
          </p>
          {canWrite && (
            <details className="p-3 mt-4 text-xs rounded-lg bg-white/60 text-ink-700">
              <summary className="font-medium cursor-pointer">
                تفاصيل تقنية (للمسؤول)
              </summary>
              <p className="mt-2 text-ink-400">شغّل على السيرفر:</p>
              <pre
                className="p-3 mt-2 overflow-x-auto font-mono text-xs rounded-lg bg-ink-900 text-success"
                dir="ltr"
              >
                python manage.py backfill_student_codes
              </pre>
            </details>
          )}
        </div>
      )}

      {data?.student_code && (
        <>
          <div className="flex justify-center print:block">
            <div
              className="relative w-full max-w-[420px] overflow-hidden rounded-2xl border-2 border-ink/20 bg-white shadow-2xl print:max-w-[85mm] print:rounded-none print:border-0 print:shadow-none"
              style={{ aspectRatio: "85.6 / 54" }}
            >
              <div className="absolute inset-x-0 top-0 h-2 bg-ink" />
              <div className="flex flex-col justify-between h-full px-5 pt-6 pb-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-[10px] font-medium text-ink-400">
                      {tenantName ?? "المؤسسة التعليمية"}
                    </p>
                    <h1 className="mt-0.5 truncate font-display text-lg font-bold leading-tight text-ink">
                      {fullName}
                    </h1>
                  </div>
                  <div className="shrink-0 rounded-md bg-ink px-2 py-1 text-[8px] font-bold text-white">
                    STUDENT
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 py-1">
                  <div className="flex-1 min-w-0">
                    {data.current_enrollment?.grade_name && (
                      <p className="truncate text-[10px] text-ink-700">
                        <span className="text-ink-400">الصف: </span>
                        {data.current_enrollment.grade_name}
                      </p>
                    )}
                    {data.current_enrollment?.group_name && (
                      <p className="truncate text-[10px] text-ink-700">
                        <span className="text-ink-400">المجموعة: </span>
                        {data.current_enrollment.group_name}
                      </p>
                    )}
                    <p className="mt-0.5 truncate font-mono text-[9px] text-ink-400">
                      {data.student_code}
                    </p>
                  </div>
                  <div className="p-1 bg-white border rounded-md shrink-0 border-ink-100">
                    <QRCodeSVG value={data.student_code} size={48} level="M" />
                  </div>
                </div>

                <div className="flex items-center justify-center pt-2 border-t border-dashed border-ink-200">
                  <Barcode
                    value={data.student_code}
                    format="CODE128"
                    width={1.4}
                    height={38}
                    fontSize={11}
                    margin={0}
                    background="#ffffff"
                    lineColor="#111827"
                    displayValue
                  />
                </div>
              </div>
            </div>
          </div>

          <p className="mt-6 text-xs text-center text-ink-400 print:hidden">
            اطبع هذه البطاقة وأعطها للطالب. كل بطاقة عليها باركود فريد يُستخدم
            في تسجيل الحضور عبر جهاز المسح.
          </p>
        </>
      )}
    </PageShell>
  );
}