"use client";

import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "@/components/ui/icons";
import {
  ATTENDANCE_STATUS_LABEL,
  ATTENDANCE_STATUS_STYLE,
  markBulk,
  markManual,
} from "@/lib/api/attendance";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type { AttendanceRecord, AttendanceStatus } from "@/types";

const STATUS_ORDER: AttendanceStatus[] = ["PRESENT", "LATE", "ABSENT", "EXCUSED"];

interface MarkSheetProps {
  sessionId: string;
  records: AttendanceRecord[];
  canEdit: boolean;
  onUpdated: () => void;
}

export function MarkSheet({
  sessionId,
  records,
  canEdit,
  onUpdated,
}: MarkSheetProps) {
  const [search, setSearch] = useState("");
  const [pendingStudent, setPendingStudent] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        r.student_name.toLowerCase().includes(q) ||
        r.student_email.toLowerCase().includes(q)
    );
  }, [records, search]);

  const markMutation = useMutation({
    mutationFn: ({
      studentId,
      status,
    }: {
      studentId: string;
      status: AttendanceStatus;
    }) => markManual(sessionId, studentId, status),
    onSuccess: () => {
      onUpdated();
      setPendingStudent(null);
    },
    onError: (err) => {
      toastError(err, "تعذّر تحديث الحضور.");
      setPendingStudent(null);
    },
  });

  const bulkMutation = useMutation({
    mutationFn: ({
      ids,
      status,
    }: {
      ids: string[];
      status: AttendanceStatus;
    }) => markBulk(sessionId, ids, status),
    onSuccess: (res) => {
      toastSuccess(`تم تحديث ${res.updated} طالب`);
      onUpdated();
    },
    onError: (err) => toastError(err, "تعذّر التحديث الجماعي."),
  });

  function handleMark(studentId: string, status: AttendanceStatus) {
    if (!canEdit) return;
    setPendingStudent(studentId);
    markMutation.mutate({ studentId, status });
  }

  function handleMarkAllAs(status: AttendanceStatus) {
    if (!canEdit) return;
    const ids = filtered
      .filter((r) => r.status !== status)
      .map((r) => r.student);
    if (ids.length === 0) {
      toastSuccess("كل الطلاب بالفعل في هذه الحالة");
      return;
    }
    bulkMutation.mutate({ ids, status });
  }

  return (
    <div className="p-4 card">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={16}
            className="absolute -translate-y-1/2 pointer-events-none end-3 top-1/2 text-ink-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم الطالب..."
            className="w-full py-2 text-sm transition-colors border rounded-lg outline-none border-line bg-paper-elevated pe-9 ps-3 text-ink focus:border-ink focus:ring-2 focus:ring-ink/10"
          />
        </div>

        {canEdit && (
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => handleMarkAllAs("PRESENT")}
              disabled={bulkMutation.isPending}
              className="rounded-lg bg-success/10 px-2.5 py-1.5 text-xs font-medium text-success hover:bg-success/20 disabled:opacity-50"
            >
              الكل حاضر
            </button>
            <button
              onClick={() => handleMarkAllAs("ABSENT")}
              disabled={bulkMutation.isPending}
              className="rounded-lg bg-danger/10 px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-50"
            >
              الكل غائب
            </button>
          </div>
        )}
      </div>

      {/* Roster */}
      {filtered.length === 0 ? (
        <p className="py-8 text-sm text-center text-ink-400">
          {search ? "لا توجد نتائج مطابقة" : "لا يوجد طلاب مسجلون في هذه المجموعة"}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {filtered.map((r) => {
            const isPending = pendingStudent === r.student;
            return (
              <li
                key={r.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-ink">
                    {r.student_name}
                  </p>
                  <p className="text-xs truncate text-ink-400">{r.student_email}</p>
                  {r.check_in_at && (
                    <p className="mt-0.5 text-[10px] text-ink-400">
                      تسجيل: {new Date(r.check_in_at).toLocaleTimeString("ar-EG")}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {STATUS_ORDER.map((status) => {
                    const active = r.status === status;
                    return (
                      <button
                        key={status}
                        onClick={() => handleMark(r.student, status)}
                        disabled={!canEdit || isPending}
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                          active
                            ? ATTENDANCE_STATUS_STYLE[status]
                            : "border-line bg-paper-elevated text-ink-400 hover:border-ink/30 hover:text-ink"
                        } ${!canEdit ? "cursor-not-allowed opacity-50" : ""}`}
                      >
                        {ATTENDANCE_STATUS_LABEL[status]}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}