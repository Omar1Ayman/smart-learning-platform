"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api/notifications";
import type { Notification } from "@/types";

const TYPE_ICON: Record<string, string> = {
  EXAM_PUBLISHED: "📝",
  EXAM_SUBMITTED: "📥",
  EXAM_GRADED: "✅",
  QUESTION_APPROVED: "✅",
  QUESTION_REJECTED: "❌",
  QUESTION_PENDING: "⏳",
  ENROLLMENT_CREATED: "🎓",
  SYSTEM: "ℹ️",
  EXAM_REOPENED: "🔄",
  ABSENCE_ALERT: "⚠️",
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} س`;
  const d = Math.floor(h / 24);
  if (d < 7) return `منذ ${d} ي`;
  return new Date(iso).toLocaleDateString("ar-EG");
}

export function NotificationBell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: count = 0 } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: getUnreadCount,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    staleTime: 15_000,
  });

  const { data: recent } = useQuery({
    queryKey: ["notifications", "recent"],
    queryFn: () => listNotifications(),
    enabled: open,
  });

  const markOne = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function handleOpen(n: Notification) {
    if (!n.is_read) markOne.mutate(n.id);
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  const recentItems = recent?.results.slice(0, 5) ?? [];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-2 text-ink-400 transition-colors hover:bg-paper-muted hover:text-ink"
        aria-label="الإشعارات"
      >
        🔔
        {count > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold leading-none text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-paper-elevated shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-sm font-bold text-ink">الإشعارات</span>
            {count > 0 && (
              <button
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="text-xs text-ink-400 hover:text-ink disabled:opacity-50"
              >
                تحديد الكل كمقروء
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {recentItems.length === 0 ? (
              <p className="p-8 text-center text-sm text-ink-400">لا توجد إشعارات</p>
            ) : (
              recentItems.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleOpen(n)}
                  className={`flex w-full items-start gap-3 border-b border-line px-4 py-3 text-start transition-colors last:border-0 hover:bg-paper-muted ${
                    !n.is_read ? "bg-accent/5" : ""
                  }`}
                >
                  <span className="mt-0.5 text-lg">{TYPE_ICON[n.type] ?? "🔔"}</span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm ${
                        !n.is_read ? "font-medium text-ink" : "text-ink"
                      }`}
                    >
                      {n.title}
                    </p>
                    {n.message && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-ink-400">{n.message}</p>
                    )}
                    <p className="mt-1 text-[10px] text-ink-400">
                      {relativeTime(n.created_at)}
                    </p>
                  </div>
                  {!n.is_read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                  )}
                </button>
              ))
            )}
          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-line bg-paper-muted px-4 py-2.5 text-center text-xs font-medium text-ink hover:bg-paper"
          >
            عرض كل الإشعارات
          </Link>
        </div>
      )}
    </div>
  );
}