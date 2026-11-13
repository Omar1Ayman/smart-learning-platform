"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { use } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorState, Spinner } from "@/components/ui/States";
import { getAttendanceSession, getSessionQrToken } from "@/lib/api/attendance";

const POLL_INTERVAL_MS = 20_000; // refresh before 30s window expires
const TICK_INTERVAL_MS = 1_000;

export default function SessionQrPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["attendance-session", sessionId],
    queryFn: () => getAttendanceSession(sessionId),
  });

  const { data: qr, isLoading: qrLoading, isError } = useQuery({
    queryKey: ["attendance-qr", sessionId],
    queryFn: () => getSessionQrToken(sessionId),
    enabled: session?.status === "OPEN",
    refetchInterval: POLL_INTERVAL_MS,
  });

  // Local countdown ticking 1s — authoritative expiry comes from the server
  // on each refetch, we just animate smoothly between refetches.
  useEffect(() => {
    if (!qr) return;
    setSecondsLeft(qr.expires_in_seconds);
    const id = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [qr]);

  if (sessionLoading) return <Spinner />;
  if (!session) return <ErrorState message="تعذّر تحميل الجلسة." />;

  if (session.status !== "OPEN") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper p-4">
        <div className="card max-w-md p-8 text-center">
          <p className="font-display text-4xl">🔒</p>
          <h1 className="mt-4 font-display text-xl font-bold text-ink">
            الجلسة غير مفتوحة
          </h1>
          <p className="mt-2 text-sm text-ink-400">
            افتح الجلسة أولًا من صفحة الجلسة قبل عرض رمز QR.
          </p>
          <Link href={`/attendance/${sessionId}`} className="mt-6 block">
            <Button>العودة للجلسة</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-ink-900 text-white">
      {/* Header */}
      <div className="shrink-0 border-b border-white/10 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div>
            <p className="font-display text-lg font-bold">{session.group_name}</p>
            <p className="mt-0.5 text-xs text-white/60">
              {session.date} · {session.start_time} - {session.end_time}
            </p>
          </div>
          <Link href={`/attendance/${sessionId}`}>
            <Button variant="ghost" className="text-white hover:bg-white/10">
              ← رجوع
            </Button>
          </Link>
        </div>
      </div>

      {/* QR area */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex flex-col items-center gap-6">
          <div className="rounded-card bg-white p-8 shadow-2xl">
            {qrLoading ? (
              <div className="flex h-[340px] w-[340px] items-center justify-center">
                <Spinner />
              </div>
            ) : isError || !qr ? (
              <div className="flex h-[340px] w-[340px] flex-col items-center justify-center text-ink">
                <p className="text-sm text-danger">تعذّر تحميل رمز QR</p>
              </div>
            ) : (
              <QRCodeSVG value={qr.qr_url} size={340} level="H" />
            )}
          </div>

          <div className="text-center">
            <p className="font-display text-2xl font-bold">
              امسح الرمز لتسجيل الحضور
            </p>
            <p className="mt-1 text-sm text-white/60">
              الطالب يفتح الكاميرا ويمسح الرمز من هاتفه
            </p>
          </div>

          {qr && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-white/60">يتجدد خلال:</span>
              <span
                className={`font-mono text-lg font-bold tabular-nums ${
                  secondsLeft <= 5 ? "text-danger" : "text-accent"
                }`}
              >
                {secondsLeft}s
              </span>
            </div>
          )}

          {qr && (
            <p className="text-[10px] text-white/40">
              للتأكد من الأمان، الرمز يتجدد تلقائيًا كل {qr.window_seconds} ثانية.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}