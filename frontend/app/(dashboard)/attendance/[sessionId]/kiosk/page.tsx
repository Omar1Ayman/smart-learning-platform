"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorState, Spinner } from "@/components/ui/States";
import { getAttendanceSession, type ScanCardResponse } from "@/lib/api/attendance";
import { scanStudentCard } from "@/lib/api/attendance";
import { extractErrorMessage } from "@/lib/utils/toast";

interface RecentScan {
  id: string;
  student_name: string;
  status: "PRESENT" | "LATE";
  time: string;
}

interface Feedback {
  type: "success" | "late" | "duplicate" | "error";
  title: string;
  subtitle?: string;
}

const FEEDBACK_DURATION_MS = 2500;
const DUPLICATE_DEBOUNCE_MS = 3000;

function playTone(
  frequency: number,
  durationMs: number,
  type: OscillatorType = "sine"
) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + durationMs / 1000
    );
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
    setTimeout(() => ctx.close(), durationMs + 100);
  } catch {
    // Audio not available — silent fail
  }
}

function playSuccess() {
  playTone(880, 120);
  setTimeout(() => playTone(1200, 100), 130);
}

function playLate() {
  playTone(660, 150);
  setTimeout(() => playTone(660, 150), 180);
}

function playDuplicate() {
  playTone(520, 200);
}

function playError() {
  playTone(220, 300, "square");
}

export default function AttendanceKioskPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({
    code: "",
    time: 0,
  });
  const processingRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const { data: session, isLoading, isError } = useQuery({
    queryKey: ["attendance-session", sessionId],
    queryFn: () => getAttendanceSession(sessionId),
    refetchInterval: 15_000,
  });

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    focusInput();
    document.addEventListener("click", focusInput);
    document.addEventListener("touchstart", focusInput);
    const id = setInterval(focusInput, 2000);
    return () => {
      document.removeEventListener("click", focusInput);
      document.removeEventListener("touchstart", focusInput);
      clearInterval(id);
    };
  }, [focusInput]);

  // WakeLock — prevents screen sleep during a session.
  useEffect(() => {
    let cancelled = false;

    async function acquire() {
      try {
        if (!("wakeLock" in navigator)) return;
        if (document.visibilityState !== "visible") return;
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          lock.release();
          return;
        }
        wakeLockRef.current = lock;
        lock.addEventListener("release", () => {
          wakeLockRef.current = null;
        });
      } catch {
        // WakeLock can be rejected — silent fail
      }
    }

    acquire();

    function onVisibility() {
      if (document.visibilityState === "visible") acquire();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), FEEDBACK_DURATION_MS);
    return () => clearTimeout(id);
  }, [feedback]);

  async function handleScan(raw: string) {
    const code = raw.trim();
    if (!code || processingRef.current) return;

    const now = Date.now();
    if (
      lastScanRef.current.code === code &&
      now - lastScanRef.current.time < DUPLICATE_DEBOUNCE_MS
    ) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    lastScanRef.current = { code, time: now };

    processingRef.current = true;
    setIsProcessing(true);
    setLocalError(null);

    try {
      const data: ScanCardResponse = await scanStudentCard(sessionId, code);

      if (data.duplicate) {
        playDuplicate();
        setFeedback({
          type: "duplicate",
          title: data.student_name,
          subtitle: "مسجَّل بالفعل ✓",
        });
        if (inputRef.current) inputRef.current.value = "";
        return;
      }

      const isLate = data.status === "LATE";
      if (isLate) {
        playLate();
        setFeedback({
          type: "late",
          title: data.student_name,
          subtitle: "تم التسجيل — متأخر",
        });
      } else {
        playSuccess();
        setFeedback({
          type: "success",
          title: data.student_name,
          subtitle: "حاضر ✓",
        });
      }

      const newScan: RecentScan = {
        id: `${data.student_id}-${now}`,
        student_name: data.student_name,
        status: isLate ? "LATE" : "PRESENT",
        time: new Date().toLocaleTimeString("ar-EG", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setRecentScans((prev) => [newScan, ...prev].slice(0, 10));
    } catch (err) {
      playError();
      const msg = extractErrorMessage(err, "تعذّر تسجيل الحضور.");
      setFeedback({ type: "error", title: "لم يتم التسجيل", subtitle: msg });
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
      if (inputRef.current) inputRef.current.value = "";
      focusInput();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleScan(e.currentTarget.value);
    }
  }

  if (isLoading) return <Spinner />;
  if (isError || !session) return <ErrorState message="تعذّر تحميل الجلسة." />;

  if (session.status !== "OPEN") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-900 p-4 text-white">
        <div className="card max-w-md p-8 text-center">
          <p className="font-display text-4xl">🔒</p>
          <h1 className="mt-4 font-display text-xl font-bold text-ink">
            الجلسة غير مفتوحة
          </h1>
          <p className="mt-2 text-sm text-ink-400">
            افتح الجلسة أولًا قبل تشغيل وضع المسح.
          </p>
          <Link href={`/attendance/${sessionId}`} className="mt-6 block">
            <Button>العودة للجلسة</Button>
          </Link>
        </div>
      </div>
    );
  }

  const feedbackBg =
    feedback?.type === "success"
      ? "bg-success/15 border-success/40"
      : feedback?.type === "late"
      ? "bg-accent/15 border-accent/40"
      : feedback?.type === "duplicate"
      ? "bg-info/15 border-info/40"
      : "bg-danger/15 border-danger/40";

  const feedbackIcon =
    feedback?.type === "success"
      ? "✅"
      : feedback?.type === "late"
      ? "⏰"
      : feedback?.type === "duplicate"
      ? "ℹ️"
      : "❌";

  const feedbackColor =
    feedback?.type === "success"
      ? "text-success"
      : feedback?.type === "late"
      ? "text-accent"
      : feedback?.type === "duplicate"
      ? "text-info"
      : "text-danger";

  return (
    <div className="flex min-h-screen flex-col bg-ink-900 text-white select-none">
      <input
        ref={inputRef}
        type="text"
        onKeyDown={onKeyDown}
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        aria-hidden="true"
        tabIndex={-1}
      />

      <header className="shrink-0 border-b border-white/10 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div>
            <p className="font-display text-lg font-bold">{session.group_name}</p>
            <p className="mt-0.5 text-xs text-white/60">
              {session.date} · {session.start_time} - {session.end_time}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
            <span className="text-xs text-success">قيد التسجيل</span>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-3xl">
          {!feedback ? (
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="flex h-32 w-32 items-center justify-center rounded-full bg-white/5">
                <span className="font-display text-7xl">📷</span>
              </div>
              <div>
                <h1 className="font-display text-4xl font-bold">امسح بطاقتك</h1>
                <p className="mt-2 text-base text-white/60">
                  قرّب البطاقة من الماسح الضوئي
                </p>
                {isProcessing && (
                  <p className="mt-4 text-sm text-accent">جارٍ التحقق...</p>
                )}
              </div>
            </div>
          ) : (
            <div
              className={`flex flex-col items-center gap-4 rounded-card border-2 ${feedbackBg} p-12 text-center`}
            >
              <span className="font-display text-8xl">{feedbackIcon}</span>
              <h2 className={`font-display text-3xl font-bold ${feedbackColor}`}>
                {feedback.title}
              </h2>
              {feedback.subtitle && (
                <p className="text-lg text-white/80">{feedback.subtitle}</p>
              )}
            </div>
          )}

          {localError && !feedback && (
            <p className="mt-6 text-center text-sm text-danger">{localError}</p>
          )}
        </div>
      </main>

      <footer className="shrink-0 border-t border-white/10 bg-ink-800/50">
        <div className="mx-auto grid max-w-5xl gap-4 px-6 py-4 md:grid-cols-[1fr_auto]">
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-wide text-white/40">
              آخر التسجيلات
            </p>
            {recentScans.length === 0 ? (
              <p className="text-xs text-white/30">لم يسجل أحد بعد...</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {recentScans.map((s) => (
                  <div
                    key={s.id}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
                      s.status === "LATE"
                        ? "bg-accent/20 text-accent"
                        : "bg-success/20 text-success"
                    }`}
                  >
                    <span>{s.status === "LATE" ? "⏰" : "✓"}</span>
                    <span className="font-medium">{s.student_name}</span>
                    <span className="text-[10px] opacity-60">{s.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 text-center">
            <div>
              <p className="text-[10px] text-white/40">حاضر</p>
              <p className="font-display text-xl font-bold text-success">
                {session.present_count}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-white/40">متأخر</p>
              <p className="font-display text-xl font-bold text-accent">
                {session.late_count}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-white/40">غائب</p>
              <p className="font-display text-xl font-bold text-danger">
                {session.absent_count}
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}