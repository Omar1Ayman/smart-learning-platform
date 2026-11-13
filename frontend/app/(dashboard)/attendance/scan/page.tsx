"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorState, Spinner } from "@/components/ui/States";
import { markAttendanceWithQr } from "@/lib/api/attendance";
import type { AttendanceRecord } from "@/types";

function ScanContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session") ?? "";
  const token = searchParams.get("t") ?? "";
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => markAttendanceWithQr(sessionId, token),
    onSuccess: (data) => setRecord(data),
    onError: (err: unknown) => {
      const detail = (
        err as { response?: { data?: { error?: { detail?: unknown } } } }
      )?.response?.data?.error?.detail;
      setErrorMsg(
        typeof detail === "string" ? detail : "تعذّر تسجيل الحضور. حاول مرة أخرى."
      );
    },
  });

  // Auto-fire once on mount (idempotent — server checks for existing record).
  useEffect(() => {
    if (!sessionId || !token) {
      setErrorMsg("الرابط غير مكتمل — يحتاج session و t.");
      return;
    }
    if (!mutation.isPending && !record && !errorMsg) {
      mutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, token]);

  if (!sessionId || !token) {
    return (
      <ErrorState message="رابط تسجيل الحضور غير صالح. امسح رمز QR من جديد." />
    );
  }

  if (mutation.isPending) {
    return (
      <div className="card max-w-md p-8 text-center">
        <Spinner />
        <p className="mt-3 text-sm text-ink-400">جارٍ تسجيل حضورك...</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="card max-w-md p-8 text-center">
        <p className="font-display text-5xl">⚠️</p>
        <h1 className="mt-4 font-display text-xl font-bold text-ink">
          تعذّر التسجيل
        </h1>
        <p className="mt-2 text-sm text-danger">{errorMsg}</p>
        <p className="mt-3 text-xs text-ink-400">
          جرّب مسح الرمز مرة أخرى، أو اطلب من المعلم تسجيلك يدويًا.
        </p>
        <Link href="/dashboard" className="mt-6 block">
          <Button className="w-full">العودة للوحة التحكم</Button>
        </Link>
      </div>
    );
  }

  if (record) {
    return (
      <div className="card max-w-md p-8 text-center">
        <p className="font-display text-6xl">
          {record.status === "PRESENT" ? "✅" : "⏰"}
        </p>
        <h1 className="mt-4 font-display text-2xl font-bold text-ink">
          {record.status === "PRESENT" ? "تم تسجيل حضورك" : "تم تسجيلك متأخرًا"}
        </h1>
        <p className="mt-2 text-sm text-ink-400">
          {record.check_in_at &&
            `الوقت: ${new Date(record.check_in_at).toLocaleTimeString("ar-EG")}`}
        </p>
        <div className="mt-6 rounded-lg bg-success/5 px-4 py-3 text-sm text-success">
          يمكنك إغلاق هذه الصفحة والعودة للفصل.
        </div>
        <Link href="/dashboard" className="mt-6 block">
          <Button className="w-full">تم</Button>
        </Link>
      </div>
    );
  }

  return null;
}

export default function ScanPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4">
      <Suspense fallback={<Spinner />}>
        <ScanContent />
      </Suspense>
    </div>
  );
}