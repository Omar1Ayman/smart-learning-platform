"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  listTodaySessions,
  startSessionFromSchedule,
} from "@/lib/api/attendance";
import { toastError } from "@/lib/utils/toast";
import type { TodaySession } from "@/types";

/**
 * Batch 20 (Milestone 5): three-state "Today's Sessions" widget.
 * Batch 20.1 fix: added "missed" state (>2h late). Missed sessions are
 * filtered out of the main list and summarized in a footer note. They
 * cannot be started — use /attendance/quick-start if the teacher
 * actually held a class today.
 *
 * Labels use compact time (Xس Yد) instead of raw minutes to stay
 * readable after long delays.
 */
export function TodaySessionsWidget() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [confirmTarget, setConfirmTarget] = useState<TodaySession | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["today-sessions"],
    queryFn: listTodaySessions,
    refetchInterval: 60_000,
  });

  const startMutation = useMutation({
    mutationFn: ({ id, force }: { id: string; force: boolean }) =>
      startSessionFromSchedule(id, { force }),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ["today-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-sessions"] });
      router.push(`/attendance/${session.id}`);
    },
    onError: (err) => toastError(err, "تعذّر بدء الجلسة."),
  });

  if (isLoading || !data || data.length === 0) return null;

  // Batch 20.1: filter out "missed" — they're not actionable and
  // clutter the widget. Summarized in a footer note instead.
  const actionable = data.filter((s) => s.state !== "missed");
  const missed = data.filter((s) => s.state === "missed");

  if (actionable.length === 0 && missed.length === 0) return null;

  const canStartNow = actionable.filter(
    (s) => s.ready_to_start && s.can_start
  ).length;

  function handleStartClick(s: TodaySession) {
    if (!s.can_start) return;
    if (s.state === "ready") {
      startMutation.mutate({ id: s.schedule_id, force: false });
    } else {
      setConfirmTarget(s);
    }
  }

  return (
    <>
      <div className="overflow-hidden card">
        <div className="flex items-center justify-between px-5 py-3 border-b border-line bg-gradient-to-l from-accent/10 to-transparent">
          <div>
            <h2 className="text-base font-bold font-display text-ink">
              🗓️ حصص اليوم
            </h2>
            <p className="mt-0.5 text-xs text-ink-400">
              {actionable.length} حصة
              {canStartNow > 0 ? ` · ${canStartNow} بانتظار البدء الآن` : ""}
            </p>
          </div>
          <Link href="/attendance">
            <Button variant="ghost" className="text-xs">
              الكل
            </Button>
          </Link>
        </div>

        {actionable.length === 0 ? (
          <p className="px-5 py-6 text-sm text-center text-ink-400">
            لا توجد حصص قابلة للبدء الآن.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {actionable.map((s) => {
              const hasSession = !!s.session_id;
              const isOpen = s.session_status === "OPEN";
              const isClosed = s.session_status === "CLOSED";

              return (
                <li
                  key={s.schedule_id}
                  className={`flex items-center justify-between gap-3 px-5 py-3 ${
                    s.state === "ready" && !hasSession ? "bg-success/5" : ""
                  }`}
                >
                  <div className="flex items-center flex-1 min-w-0 gap-3">
                    <div
                      className={`flex h-9 shrink-0 items-center justify-center rounded-lg px-2 font-mono text-xs font-medium ${
                        isOpen
                          ? "bg-success/15 text-success"
                          : isClosed
                          ? "bg-ink-50 text-ink-400"
                          : s.state === "ready"
                          ? "bg-success/20 text-success"
                          : s.state === "late"
                          ? "bg-accent/15 text-accent-dark"
                          : "bg-ink-50 text-ink-700"
                      }`}
                    >
                      {s.start_time}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-ink">
                        {s.group_name}
                      </p>
                      <p className="text-[11px] text-ink-400">
                        {s.start_time} - {s.end_time}
                        {s.teacher_email && ` · ${s.teacher_email.split("@")[0]}`}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0">
                    {isOpen ? (
                      <Link href={`/attendance/${s.session_id}`}>
                        <Button variant="secondary" className="text-xs">
                          مفتوحة →
                        </Button>
                      </Link>
                    ) : isClosed ? (
                      <Link href={`/attendance/${s.session_id}`}>
                        <Button variant="ghost" className="text-xs">
                          مغلقة
                        </Button>
                      </Link>
                    ) : !s.can_start ? (
                      <Link href={`/attendance/${s.session_id}`}>
                        <Button variant="ghost" className="text-xs">
                          فتح
                        </Button>
                      </Link>
                    ) : s.state === "ready" ? (
                      <Button
                        onClick={() => handleStartClick(s)}
                        disabled={startMutation.isPending}
                        className="text-xs text-white bg-success hover:bg-success/90"
                      >
                        {startMutation.isPending &&
                        startMutation.variables?.id === s.schedule_id
                          ? "..."
                          : "🚀 ابدأ الآن"}
                      </Button>
                    ) : s.state === "upcoming" ? (
                      <Button
                        onClick={() => handleStartClick(s)}
                        variant="secondary"
                        className="text-xs"
                      >
                        ⏰ بعد {formatDelta(s.starts_in_minutes)}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleStartClick(s)}
                        variant="secondary"
                        className="text-xs border-accent/30 text-accent-dark"
                      >
                        ⚠️ متأخر {formatDelta(Math.abs(s.starts_in_minutes))}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Batch 20.1: missed sessions footer */}
        {missed.length > 0 && (
          <div className="border-t border-line bg-ink-50/30 px-5 py-2.5">
            <p className="text-xs text-ink-400">
              💤 {missed.length}{" "}
              {missed.length === 1 ? "حصة فائتة" : "حصص فائتة"} اليوم بدون
              تسجيل حضور.{" "}
              <Link href="/attendance" className="text-ink hover:underline">
                عرض في صفحة الحضور
              </Link>
            </p>
          </div>
        )}
      </div>

      {/* Batch 20: confirm dialog for early/late starts */}
      <ConfirmDialog
        open={!!confirmTarget}
        title={
          confirmTarget?.state === "upcoming"
            ? "بدء الحصة مبكرًا؟"
            : "الحصة تأخرت — تريد البدء الآن؟"
        }
        description={confirmTarget ? buildConfirmMessage(confirmTarget) : ""}
        confirmLabel="ابدأ الحصة على أي حال"
        cancelLabel="إلغاء"
        variant={confirmTarget?.state === "late" ? "danger" : "default"}
        onConfirm={() => {
          if (confirmTarget) {
            startMutation.mutate({
              id: confirmTarget.schedule_id,
              force: true,
            });
            setConfirmTarget(null);
          }
        }}
        onCancel={() => setConfirmTarget(null)}
        isPending={startMutation.isPending}
      />
    </>
  );
}

/**
 * Batch 20.1: format a minutes delta as "Xس Yد" or "Yد".
 * Avoids labels like "متأخر 469د" which force the user to do math.
 */
function formatDelta(minutes: number): string {
  const m = Math.abs(minutes);
  if (m < 60) return `${m}د`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}س ${rem}د` : `${h}س`;
}

function buildConfirmMessage(s: TodaySession): string {
  if (s.state === "upcoming") {
    return `الحصة مجدولة الساعة ${s.start_time}، والآن قبلها بـ ${formatDelta(
      s.starts_in_minutes
    )}. هل تريد البدء مبكرًا؟ سيُسجَّل هذا في سجل النشاط.`;
  }
  return `الحصة كان المفروض تبدأ الساعة ${s.start_time}، والآن بعدها بـ ${formatDelta(
    Math.abs(s.starts_in_minutes)
  )}. هل تريد البدء الآن؟ سيُسجَّل التأخير في سجل النشاط.`;
}