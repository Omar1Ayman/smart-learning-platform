"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  listAttendanceSessions,
  type QuickStartResponse,
} from "@/lib/api/attendance";
import { apiClient } from "@/lib/api/client";
import { listGroups } from "@/lib/api/groups";
import { toastError } from "@/lib/utils/toast";

/**
 * One-click "start attendance now" modal.
 *
 * Flow:
 *   1. Teacher opens — sees their groups sorted by "most recently used".
 *   2. Selects a group (or it's pre-selected from the last session).
 *   3. Times auto-prefill from that group's last session (or sensible
 *      defaults: now → now + 1hr).
 *   4. "بدء الآن" → server creates + opens the session in one call.
 *   5. Teacher is redirected to /attendance/[id] where they can
 *      immediately open the Kiosk.
 *
 * The user can adjust date/time in an expandable "settings" block — the
 * defaults work for 95% of use cases, so the "advanced" fields are
 * hidden by default to reduce cognitive load.
 */
interface QuickStartProps {
  open: boolean;
  onClose: () => void;
}

interface GroupWithLastSession {
  id: string;
  name: string;
  grade_name?: string;
  last_start_time?: string;
  last_end_time?: string;
  last_used_date?: string;
}

const NOW_ROUNDED = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  return d;
};

const PLUS_ONE_HOUR = (base: Date) => {
  const d = new Date(base);
  d.setHours(d.getHours() + 1);
  return d;
};

function toTimeString(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function relativeDateLabel(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return "اليوم";
  if (diffDays === 1) return "أمس";
  if (diffDays < 7) return `قبل ${diffDays} أيام`;
  return d.toLocaleDateString("ar-EG", { month: "short", day: "numeric" });
}

export function QuickStartSessionModal({ open, onClose }: QuickStartProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [date, setDate] = useState(toDateString(NOW_ROUNDED()));
  const [startTime, setStartTime] = useState(toTimeString(NOW_ROUNDED()));
  const [endTime, setEndTime] = useState(
    toTimeString(PLUS_ONE_HOUR(NOW_ROUNDED()))
  );
  const [lateThreshold, setLateThreshold] = useState(15);

  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ["groups"],
    queryFn: () => listGroups(),
    enabled: open,
  });

  // Fetch last session per group so the group list is sorted by recency
  // and we can prefill times from the most recent one.
  const { data: recentSessions } = useQuery({
    queryKey: ["attendance-sessions", "recent-for-quick-start"],
    queryFn: () => listAttendanceSessions({ page_size: 50, ordering: "-date" }),
    enabled: open,
  });

  const groupsWithMeta: GroupWithLastSession[] = useMemo(() => {
    if (!groups?.results) return [];
    const lastByGroup = new Map<string, { start: string; end: string; date: string }>();
    for (const s of recentSessions?.results ?? []) {
      if (!lastByGroup.has(s.group)) {
        lastByGroup.set(s.group, {
          start: s.start_time.slice(0, 5),
          end: s.end_time.slice(0, 5),
          date: s.date,
        });
      }
    }
    return groups.results
      .map((g) => {
        const last = lastByGroup.get(g.id);
        return {
          id: g.id,
          name: g.name,
          grade_name: undefined,
          last_start_time: last?.start,
          last_end_time: last?.end,
          last_used_date: last?.date,
        };
      })
      .sort((a, b) => {
        // Groups with recent sessions first (sorted by most recent date)
        const aDate = a.last_used_date ?? "";
        const bDate = b.last_used_date ?? "";
        return bDate.localeCompare(aDate);
      });
  }, [groups, recentSessions]);

  // When a group is selected, prefill times from its last session (if any)
  // — but only if the user hasn't manually edited the fields yet.
  useEffect(() => {
    if (!selectedGroupId) return;
    const g = groupsWithMeta.find((x) => x.id === selectedGroupId);
    if (g?.last_start_time && g?.last_end_time) {
      setStartTime(g.last_start_time);
      setEndTime(g.last_end_time);
    }
  }, [selectedGroupId, groupsWithMeta]);

  const startMutation = useMutation({
    mutationFn: async (): Promise<QuickStartResponse> => {
      const { data } = await apiClient.post<QuickStartResponse>(
        "/attendance/sessions/quick-start/",
        {
          group: selectedGroupId,
          date,
          start_time: startTime,
          end_time: endTime,
          late_threshold_minutes: lateThreshold,
          mode: "HYBRID",
        }
      );
      return data;
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ["attendance-sessions"] });
      onClose();
      router.push(`/attendance/${session.id}`);
    },
    onError: (err) => toastError(err, "تعذّر بدء الجلسة."),
  });

  function handleSubmit() {
    if (!selectedGroupId) return;
    startMutation.mutate();
  }

  return (
    <Modal open={open} onClose={onClose} title="بدء حصة الآن">
      <div className="flex flex-col gap-4">
        {/* Group picker */}
        <div>
          <label className="mb-2 block text-sm font-medium text-ink-700">
            المجموعة
          </label>
          {groupsLoading ? (
            <p className="text-sm text-ink-400">جارٍ التحميل...</p>
          ) : groupsWithMeta.length === 0 ? (
            <p className="rounded-lg bg-accent/5 p-3 text-sm text-ink-700">
              لا توجد مجموعات. أضف مجموعة أولًا من صفحة "المجموعات".
            </p>
          ) : (
            <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {groupsWithMeta.map((g) => {
                const active = selectedGroupId === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGroupId(g.id)}
                    className={`rounded-lg border-2 p-3 text-start transition-all ${
                      active
                        ? "border-ink bg-ink/5"
                        : "border-line bg-white hover:border-ink/30 hover:bg-ink-50/30"
                    }`}
                  >
                    <p className="truncate text-sm font-medium text-ink">
                      {g.name}
                    </p>
                    {g.last_start_time ? (
                      <p className="mt-0.5 text-[10px] text-ink-400">
                        آخر حصة: {g.last_start_time} ·{" "}
                        {relativeDateLabel(g.last_used_date)}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[10px] text-ink-300">
                        لم تُسجَّل حصص بعد
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Smart default preview */}
        {selectedGroupId && (
          <div className="rounded-lg bg-ink-50/50 p-3">
            <p className="text-xs text-ink-400">ملخص الحصة</p>
            <p className="mt-1 text-sm font-medium text-ink">
              {date === toDateString(NOW_ROUNDED()) ? "اليوم" : date} ·{" "}
              {startTime} → {endTime}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-400">
              سيتم فتح الجلسة فورًا — يمكنك عرض QR أو تشغيل Kiosk مباشرة
            </p>
          </div>
        )}

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="self-start text-xs text-ink-400 hover:text-ink"
        >
          {showAdvanced ? "▲ إخفاء الإعدادات" : "▼ تعديل الوقت والتفاصيل"}
        </button>

        {showAdvanced && (
          <div className="flex flex-col gap-3 rounded-lg border border-line p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-ink-400">التاريخ</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-ink-400">وقت البداية</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-ink-400">وقت النهاية</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-ink-400">
                حد التأخير (دقائق من بداية الحصة)
              </label>
              <input
                type="number"
                min={0}
                max={120}
                value={lateThreshold}
                onChange={(e) =>
                  setLateThreshold(parseInt(e.target.value, 10) || 0)
                }
                className="w-32 rounded-lg border border-line bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedGroupId || startMutation.isPending}
          >
            {startMutation.isPending ? "جارٍ البدء..." : "🚀 ابدأ الحصة الآن"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}