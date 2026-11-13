"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CloseSessionDialog } from "@/components/attendance/CloseSessionDialog";
import { Button } from "@/components/ui/Button";
import { ErrorState, Spinner } from "@/components/ui/States";
import {
  closeSession,
  getAttendanceSession,
  listSessionRecords,
} from "@/lib/api/attendance";
import { toastError, toastSuccess } from "@/lib/utils/toast";

/**
 * Live attendance dashboard — mobile-first, auto-refresh.
 *
 * Designed for the teacher watching from their phone while the kiosk
 * runs at the door. Every 3 seconds it re-fetches the session and the
 * record list, so the teacher sees students arrive in real-time.
 *
 * Not a management UI — closing is the only action. Full roster editing
 * lives on the parent session page.
 */
export default function LiveAttendancePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmClose, setConfirmClose] = useState(false);

  const { data: session, isLoading, isError } = useQuery({
    queryKey: ["attendance-session", sessionId],
    queryFn: () => getAttendanceSession(sessionId),
    refetchInterval: 3000,
  });

  const { data: records } = useQuery({
    queryKey: ["attendance-records", sessionId],
    queryFn: () => listSessionRecords(sessionId),
    enabled: !!session,
    refetchInterval: 3000,
  });

  // Recent check-ins — sorted by check_in_at desc.
  const recentCheckins = useMemo(() => {
    if (!records) return [];
    return records
      .filter((r) => r.check_in_at !== null)
      .filter((r) => r.status === "PRESENT" || r.status === "LATE")
      .sort((a, b) => {
        const aT = new Date(a.check_in_at!).getTime();
        const bT = new Date(b.check_in_at!).getTime();
        return bT - aT;
      })
      .slice(0, 15);
  }, [records]);

  const closeMutation = useMutation({
    mutationFn: () => closeSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance-session", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["attendance-sessions"] });
      toastSuccess("تم إغلاق الجلسة");
      setConfirmClose(false);
      router.push(`/attendance/${sessionId}`);
    },
    onError: (err) => {
      toastError(err, "تعذّر إغلاق الجلسة.");
      setConfirmClose(false);
    },
  });

  if (isLoading) return <Spinner />;
  if (isError || !session) return <ErrorState message="تعذّر تحميل الجلسة." />;

  const isOpen = session.status === "OPEN";
  const attendancePct =
    session.total_students > 0
      ? Math.round(
          ((session.present_count + session.late_count) / session.total_students) *
            100
        )
      : 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/attendance/${sessionId}`}
            className="text-xs text-ink-400 hover:text-ink"
          >
            ← الجلسة
          </Link>
          <h1 className="mt-1 truncate font-display text-xl font-bold text-ink">
            {session.group_name}
          </h1>
          <p className="mt-0.5 text-xs text-ink-400">
            {session.date} · {session.start_time} - {session.end_time}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
          <span className="text-[10px] font-medium text-success">مباشر</span>
        </div>
      </div>

      {/* Big live stats */}
      <div className="card p-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wide text-ink-400">
              حاضر
            </p>
            <p className="mt-1 font-display text-4xl font-bold tabular-nums text-success">
              {session.present_count}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wide text-ink-400">
              متأخر
            </p>
            <p className="mt-1 font-display text-4xl font-bold tabular-nums text-accent-dark">
              {session.late_count}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wide text-ink-400">
              غائب
            </p>
            <p className="mt-1 font-display text-4xl font-bold tabular-nums text-danger">
              {session.absent_count}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        {session.total_students > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-[11px] text-ink-400">
              <span>نسبة الحضور</span>
              <span className="font-medium text-ink">
                {attendancePct}% ({session.present_count + session.late_count}/
                {session.total_students})
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink-100">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  attendancePct >= 80
                    ? "bg-success"
                    : attendancePct >= 50
                    ? "bg-accent"
                    : "bg-danger"
                }`}
                style={{ width: `${attendancePct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Live feed */}
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-ink">
            آخر تسجيلات الحضور
          </h2>
          <span className="text-[10px] text-ink-400">
            آخر 15 • يُحدَّث تلقائيًا
          </span>
        </div>

        {recentCheckins.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-3xl">⏳</p>
            <p className="mt-2 text-sm text-ink-400">
              لم يسجل أحد الحضور بعد
            </p>
            <p className="mt-1 text-xs text-ink-300">
              سيظهر هنا كل طالب يمسح بطاقته
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {recentCheckins.map((r) => {
              const isLate = r.status === "LATE";
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 py-2.5 animate-fade-in"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        isLate
                          ? "bg-accent/15 text-accent-dark"
                          : "bg-success/15 text-success"
                      }`}
                    >
                      {isLate ? "⏰" : "✓"}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {r.student_name}
                      </p>
                      <p className="text-[10px] text-ink-400">
                        {r.check_in_method === "QR"
                          ? "QR"
                          : r.check_in_method === "MANUAL"
                          ? "يدوي"
                          : "تلقائي"}
                        {isLate && " · متأخر"}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-ink-400">
                    {r.check_in_at &&
                      new Date(r.check_in_at).toLocaleTimeString("ar-EG", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Actions */}
      {isOpen && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">
                انتهت الحصة؟
              </p>
              <p className="mt-0.5 text-xs text-ink-400">
                إغلاق الجلسة يوقف التسجيل
              </p>
            </div>
            <Button variant="danger" onClick={() => setConfirmClose(true)}>
              إغلاق الجلسة
            </Button>
          </div>
        </div>
      )}

      {!isOpen && (
        <div className="card p-4 text-center">
          <p className="text-sm text-ink-400">
            هذه الجلسة مغلقة. يمكنك مراجعة السجلات من صفحة الجلسة.
          </p>
          <Link href={`/attendance/${sessionId}`} className="mt-2 inline-block">
            <Button variant="secondary" className="text-xs">
              عرض صفحة الجلسة
            </Button>
          </Link>
        </div>
      )}

      {/* Close dialog */}
      <CloseSessionDialog
        open={confirmClose}
        totalStudents={session.total_students}
        presentCount={session.present_count}
        lateCount={session.late_count}
        absentCount={session.absent_count}
        onConfirm={() => closeMutation.mutate()}
        onCancel={() => setConfirmClose(false)}
        isPending={closeMutation.isPending}
      />
    </div>
  );
}