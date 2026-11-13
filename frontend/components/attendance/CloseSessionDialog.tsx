"use client";

import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";

interface CloseSessionDialogProps {
  open: boolean;
  totalStudents: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}

/**
 * Smart close confirmation — shows the actual attendance breakdown
 * BEFORE closing, so the teacher can spot "5 absent" and reconsider.
 *
 * Replaces the generic ConfirmDialog for session close, where seeing
 * the counts is the whole point of confirming. Uses a wide modal so
 * the four counts sit side-by-side on desktop.
 */
export function CloseSessionDialog({
  open,
  totalStudents,
  presentCount,
  lateCount,
  absentCount,
  onConfirm,
  onCancel,
  isPending,
}: CloseSessionDialogProps) {
  if (!open || typeof document === "undefined") return null;

  const presentPct =
    totalStudents > 0
      ? Math.round(((presentCount + lateCount) / totalStudents) * 100)
      : 0;

  const isHighAbsence = totalStudents > 0 && absentCount / totalStudents >= 0.3;
  const isUnmarked = absentCount > 0;

  const tone = isHighAbsence
    ? {
        bg: "bg-danger/5",
        border: "border-danger/30",
        text: "text-danger",
        title: "⚠️ نسبة غياب عالية",
        body: `غياب ${absentCount} من ${totalStudents} طالب. هل تريد الإغلاق على أي حال؟`,
      }
    : isUnmarked
    ? {
        bg: "bg-accent/5",
        border: "border-accent/30",
        text: "text-accent-dark",
        title: "⏳ لا يزال هناك طلاب لم يسجلوا",
        body: `${absentCount} طالب لم يسجل الحضور بعد. عند الإغلاق سيبقون غائبين.`,
      }
    : {
        bg: "bg-success/5",
        border: "border-success/30",
        text: "text-success",
        title: "✅ الحضور مكتمل تقريبًا",
        body: "كل الطلاب تقريبًا سجلوا. يمكنك الإغلاق بأمان.",
      };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-session-title"
        className="w-full max-w-md overflow-hidden rounded-card-lg border border-line bg-paper-elevated shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-line px-5 py-4">
          <h2
            id="close-session-title"
            className="font-display text-lg font-bold text-ink"
          >
            إغلاق الجلسة
          </h2>
          <p className="mt-0.5 text-xs text-ink-400">
            بعد الإغلاق لا يمكن للطلاب تسجيل الحضور
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 border-b border-line px-5 py-4">
          <div className="rounded-lg bg-success/10 p-3 text-center">
            <p className="text-[10px] text-ink-400">حاضر</p>
            <p className="mt-1 font-display text-2xl font-bold text-success">
              {presentCount}
            </p>
          </div>
          <div className="rounded-lg bg-accent/10 p-3 text-center">
            <p className="text-[10px] text-ink-400">متأخر</p>
            <p className="mt-1 font-display text-2xl font-bold text-accent-dark">
              {lateCount}
            </p>
          </div>
          <div className="rounded-lg bg-danger/10 p-3 text-center">
            <p className="text-[10px] text-ink-400">غائب</p>
            <p className="mt-1 font-display text-2xl font-bold text-danger">
              {absentCount}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        {totalStudents > 0 && (
          <div className="px-5 pt-4">
            <div className="mb-1 flex items-center justify-between text-[11px] text-ink-400">
              <span>نسبة الحضور</span>
              <span className="font-medium text-ink">{presentPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink-100">
              <div
                className={`h-full rounded-full transition-all ${
                  presentPct >= 80
                    ? "bg-success"
                    : presentPct >= 50
                    ? "bg-accent"
                    : "bg-danger"
                }`}
                style={{ width: `${presentPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Tone message */}
        <div className={`mx-5 mt-4 rounded-lg border ${tone.border} ${tone.bg} p-3`}>
          <p className={`text-sm font-medium ${tone.text}`}>{tone.title}</p>
          <p className="mt-0.5 text-xs text-ink-700">{tone.body}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
          <Button variant="ghost" onClick={onCancel} disabled={isPending}>
            إلغاء
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={isPending}>
            {isPending ? "جارٍ الإغلاق..." : "إغلاق الجلسة"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}