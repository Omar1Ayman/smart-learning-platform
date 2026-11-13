"use client";

import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorState, Spinner } from "@/components/ui/States";
import { getAttendanceSession } from "@/lib/api/attendance";
import { apiClient } from "@/lib/api/client";
import { extractErrorMessage } from "@/lib/utils/toast";

interface ScanResponse {
  student_id: string;
  student_name: string;
  student_code: string;
  status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";
  check_in_at: string | null;
}

interface LastScan {
  student_name: string;
  status: "PRESENT" | "LATE";
  time: string;
}

export default function CameraScanPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScannedRef = useRef<{ code: string; time: number }>({ code: "", time: 0 });

  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<LastScan | null>(null);
  const [scanCount, setScanCount] = useState(0);

  const { data: session, isLoading } = useQuery({
    queryKey: ["attendance-session", sessionId],
    queryFn: () => getAttendanceSession(sessionId),
  });

  useEffect(() => {
    if (!session || session.status !== "OPEN") return;
    if (!videoRef.current) return;

    const reader = new BrowserMultiFormatReader();
    let mounted = true;

    async function start() {
      try {
        setScanning(true);
        setError(null);
        const controls = await reader.decodeFromVideoDevice(
        undefined, // default camera (usually back)
        videoRef.current!,
        async (result, _err) => {
        if (!mounted || !result) return;
            const code = result.getText().trim();
            if (!code) return;

            // Debounce — camera fires many frames/sec.
            const now = Date.now();
            if (
              lastScannedRef.current.code === code &&
              now - lastScannedRef.current.time < 3000
            ) {
              return;
            }
            lastScannedRef.current = { code, time: now };

            try {
              const { data } = await apiClient.post<ScanResponse>(
                `/attendance/sessions/${sessionId}/scan-card/`,
                { student_code: code }
              );
              setLastScan({
                student_name: data.student_name,
                status: data.status === "LATE" ? "LATE" : "PRESENT",
                time: new Date().toLocaleTimeString("ar-EG", {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              });
              setScanCount((c) => c + 1);
              // Vibrate on success (mobile only)
              if (navigator.vibrate) navigator.vibrate(80);
            } catch (err) {
              setError(extractErrorMessage(err, "تعذّر التسجيل."));
            }
          }
        );
        if (mounted) controlsRef.current = controls;
      } catch {
        if (mounted) {
          setScanning(false);
          setError(
            "تعذّر الوصول للكاميرا. تأكد من إعطاء المتصفح صلاحية الكاميرا."
          );
        }
      }
    }

    start();

    return () => {
      mounted = false;
      controlsRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  if (isLoading) return <Spinner />;
  if (!session || session.status !== "OPEN") {
    return (
      <ErrorState message="الجلسة غير مفتوحة. افتحها أولًا من صفحة الجلسة." />
    );
  }

  return (
    <div className="flex flex-col min-h-screen text-white bg-ink-900">
      <header className="px-4 py-3 border-b shrink-0 border-white/10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-bold font-display">{session.group_name}</p>
            <p className="text-xs text-white/60">مسح البطاقات بالكاميرا</p>
          </div>
          <Link href={`/attendance/${sessionId}`}>
            <Button variant="ghost" className="text-xs text-white hover:bg-white/10">
              ← رجوع
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex flex-col items-center justify-center flex-1 gap-4 p-4">
        <div className="relative w-full max-w-md overflow-hidden bg-black rounded-card">
          <video
            ref={videoRef}
            className="aspect-[3/4] w-full object-cover"
            playsInline
            muted
          />
          {/* Scan target overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="h-2/3 w-4/5 rounded-lg border-4 border-accent/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
              <div className="absolute inset-x-0 top-1/2 h-0.5 animate-pulse bg-accent" />
            </div>
          </div>
          {scanning && (
            <p className="absolute px-3 py-1 text-xs text-white -translate-x-1/2 rounded-full bottom-3 left-1/2 bg-black/60">
              جارٍ المسح...
            </p>
          )}
        </div>

        {lastScan && (
          <div
            className={`w-full max-w-md rounded-card border-2 p-4 text-center ${
              lastScan.status === "LATE"
                ? "border-accent/40 bg-accent/10"
                : "border-success/40 bg-success/10"
            }`}
          >
            <p
              className={`font-display text-lg font-bold ${
                lastScan.status === "LATE" ? "text-accent" : "text-success"
              }`}
            >
              {lastScan.status === "LATE" ? "⏰" : "✓"} {lastScan.student_name}
            </p>
            <p className="mt-1 text-xs text-white/60">
              {lastScan.status === "LATE" ? "متأخر" : "حاضر"} · {lastScan.time}
            </p>
          </div>
        )}

        {error && (
          <div className="w-full max-w-md p-3 text-sm text-center border rounded-lg border-danger/40 bg-danger/10 text-danger">
            {error}
          </div>
        )}

        <p className="text-xs text-white/40">
          تم تسجيل {scanCount} طالب في هذه الجلسة
        </p>
      </main>
    </div>
  );
}