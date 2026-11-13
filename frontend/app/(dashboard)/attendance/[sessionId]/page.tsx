"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use, useState } from "react";
import { CloseSessionDialog } from "@/components/attendance/CloseSessionDialog";
import { MarkSheet } from "@/components/attendance/MarkSheet";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorState, Spinner } from "@/components/ui/States";
import {
  ATTENDANCE_STATUS_LABEL,
  SESSION_STATUS_LABEL,
  SESSION_STATUS_STYLE,
  closeSession,
  getAttendanceSession,
  listSessionRecords,
  openSession,
  reopenSession,
} from "@/lib/api/attendance";
import { toastError, toastSuccess } from "@/lib/utils/toast";

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const queryClient = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<"close" | "reopen" | null>(
    null
  );

  const { data: session, isLoading, isError } = useQuery({
    queryKey: ["attendance-session", sessionId],
    queryFn: () => getAttendanceSession(sessionId),
    refetchInterval: (query) =>
      query.state.data?.status === "OPEN" ? 5000 : false,
  });

  const { data: records, isLoading: recordsLoading } = useQuery({
    queryKey: ["attendance-records", sessionId],
    queryFn: () => listSessionRecords(sessionId),
    enabled: !!session,
    refetchInterval: session?.status === "OPEN" ? 5000 : false,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["attendance-session", sessionId],
    });
    queryClient.invalidateQueries({
      queryKey: ["attendance-records", sessionId],
    });
    queryClient.invalidateQueries({ queryKey: ["attendance-sessions"] });
  };

  const openMutation = useMutation({
    mutationFn: () => openSession(sessionId),
    onSuccess: () => {
      invalidate();
      toastSuccess("تم فتح الجلسة — الطلاب يمكنهم تسجيل الحضور الآن");
    },
    onError: (err) => toastError(err, "تعذّر فتح الجلسة."),
  });

  const closeMutation = useMutation({
    mutationFn: () => closeSession(sessionId),
    onSuccess: () => {
      invalidate();
      toastSuccess("تم إغلاق الجلسة");
      setConfirmAction(null);
    },
    onError: (err) => toastError(err, "تعذّر إغلاق الجلسة."),
  });

  const reopenMutation = useMutation({
    mutationFn: () => reopenSession(sessionId),
    onSuccess: () => {
      invalidate();
      toastSuccess("تم إعادة فتح الجلسة");
      setConfirmAction(null);
    },
    onError: (err) => toastError(err, "تعذّر إعادة الفتح."),
  });

  if (isLoading) return <Spinner />;
  if (isError || !session) return <ErrorState message="تعذّر تحميل الجلسة." />;

  const isOpen = session.status === "OPEN";
  const isClosed = session.status === "CLOSED";
  const isScheduled = session.status === "SCHEDULED";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      {/* Header */}
      <div>
        <button
          onClick={() => history.back()}
          className="text-sm text-ink-400 hover:text-ink"
        >
          ← الحضور
        </button>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold text-ink">
              {session.group_name}
            </h1>
            <p className="mt-0.5 text-sm text-ink-400">
              {session.date} · {session.start_time} - {session.end_time}
              {session.course_name && ` · ${session.course_name}`}
            </p>
            <p className="mt-0.5 text-xs text-ink-400">
              المعلم: {session.teacher_email}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${
              SESSION_STATUS_STYLE[session.status]
            }`}
          >
            {SESSION_STATUS_LABEL[session.status]}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="card p-4">
        {isScheduled && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">
                الجلسة مجدولة ولم تُفتح بعد
              </p>
              <p className="mt-0.5 text-xs text-ink-400">
                عند الفتح سيتم تسجيل كل الطلاب غائبين افتراضيًا
              </p>
            </div>
            <Button
              onClick={() => openMutation.mutate()}
              disabled={openMutation.isPending}
            >
              {openMutation.isPending ? "..." : "فتح الجلسة"}
            </Button>
          </div>
        )}

        {isOpen && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
              <span className="text-sm font-medium text-success">
                الجلسة مفتوحة — الطلاب يسجلون الحضور
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/attendance/${sessionId}/live`}>
                <Button variant="secondary" className="text-xs">
                  📊 متابعة مباشرة
                </Button>
              </Link>
              <Link href={`/attendance/${sessionId}/kiosk`} target="_blank">
                <Button variant="secondary" className="text-xs">
                  🖥️ وضع الكشك
                </Button>
              </Link>
              <Link
                href={`/attendance/${sessionId}/scan-with-camera`}
                target="_blank"
              >
                <Button variant="secondary" className="text-xs">
                  📷 مسح بالكاميرا
                </Button>
              </Link>
              <Link href={`/attendance/${sessionId}/qr`} target="_blank">
                <Button variant="secondary" className="text-xs">
                  عرض QR
                </Button>
              </Link>
              <Button
                variant="danger"
                onClick={() => setConfirmAction("close")}
                className="text-xs"
              >
                إغلاق الجلسة
              </Button>
            </div>
          </div>
        )}

        {isClosed && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">الجلسة مغلقة</p>
              <p className="mt-0.5 text-xs text-ink-400">
                آخر تعديل:{" "}
                {session.closed_at
                  ? new Date(session.closed_at).toLocaleString("ar-EG")
                  : "—"}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => setConfirmAction("reopen")}
            >
              إعادة فتح
            </Button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="إجمالي" value={session.total_students} />
        <Stat
          label={ATTENDANCE_STATUS_LABEL.PRESENT}
          value={session.present_count}
          accent="success"
        />
        <Stat
          label={ATTENDANCE_STATUS_LABEL.LATE}
          value={session.late_count}
          accent="warning"
        />
        <Stat
          label={ATTENDANCE_STATUS_LABEL.ABSENT}
          value={session.absent_count}
          accent="danger"
        />
      </div>

      {/* Mark sheet */}
      {recordsLoading && <Spinner />}
      {records && (
        <MarkSheet
          sessionId={sessionId}
          records={records}
          canEdit={session.status !== "CANCELLED"}
          onUpdated={invalidate}
        />
      )}

      {/* Close dialog (smart) */}
      <CloseSessionDialog
        open={confirmAction === "close"}
        totalStudents={session.total_students}
        presentCount={session.present_count}
        lateCount={session.late_count}
        absentCount={session.absent_count}
        onConfirm={() => closeMutation.mutate()}
        onCancel={() => setConfirmAction(null)}
        isPending={closeMutation.isPending}
      />

      {/* Reopen dialog (simple — no stats needed) */}
      <ConfirmDialog
        open={confirmAction === "reopen"}
        title="إعادة فتح الجلسة"
        description="ستعود الجلسة مفتوحة ويمكنك تعديل سجلات الحضور. السجلات الحالية محفوظة."
        confirmLabel="إعادة فتح"
        cancelLabel="إلغاء"
        variant="default"
        onConfirm={() => reopenMutation.mutate()}
        onCancel={() => setConfirmAction(null)}
        isPending={reopenMutation.isPending}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  accent = "default",
}: {
  label: string;
  value: number;
  accent?: "default" | "success" | "warning" | "danger";
}) {
  const color = {
    default: "text-ink",
    success: "text-success",
    warning: "text-accent-dark",
    danger: "text-danger",
  }[accent];
  return (
    <div className="card p-4 text-center">
      <p className="text-xs text-ink-400">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}