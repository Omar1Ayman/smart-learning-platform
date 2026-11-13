"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/States";
import { PageShell } from "@/components/ui/PageShell";
import { X } from "@/components/ui/icons";
import {
  bulkDeleteNotifications,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
} from "@/lib/api/notifications";
import { useUrlEnumState } from "@/lib/hooks/useUrlEnumState";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type { Notification, NotificationType } from "@/types";

// ---- Type metadata ---------------------------------------------------------

const TYPE_META: Record<string, { icon: string; bg: string; text: string; label: string }> = {
  EXAM_PUBLISHED: { icon: "📝", bg: "bg-info/10", text: "text-info", label: "امتحان جديد" },
  EXAM_SUBMITTED: { icon: "📥", bg: "bg-accent/10", text: "text-accent-dark", label: "محاولة جديدة" },
  EXAM_GRADED: { icon: "✅", bg: "bg-success/10", text: "text-success", label: "نتيجة جديدة" },
  QUESTION_APPROVED: { icon: "✅", bg: "bg-success/10", text: "text-success", label: "سؤال معتمد" },
  QUESTION_REJECTED: { icon: "❌", bg: "bg-danger/10", text: "text-danger", label: "سؤال مرفوض" },
  QUESTION_PENDING: { icon: "⏳", bg: "bg-accent/10", text: "text-accent-dark", label: "بانتظار المراجعة" },
  ENROLLMENT_CREATED: { icon: "🎓", bg: "bg-info/10", text: "text-info", label: "تسجيل جديد" },
  EXAM_REOPENED: { icon: "🔄", bg: "bg-info/10", text: "text-info", label: "إعادة فتح" },
  ABSENCE_ALERT: { icon: "⚠️", bg: "bg-danger/10", text: "text-danger", label: "غياب" },
  SYSTEM: { icon: "ℹ️", bg: "bg-ink-50", text: "text-ink-700", label: "نظام" },
};

// ---- Type filter groups (chips) -------------------------------------------

type TypeFilter = "ALL" | "EXAM" | "QUESTION" | "ENROLLMENT" | "ABSENCE" | "SYSTEM";

const TYPE_FILTERS: Array<{ key: TypeFilter; label: string; types: NotificationType[] | null }> = [
  { key: "ALL", label: "الكل", types: null },
  {
    key: "EXAM",
    label: "الامتحانات",
    types: ["EXAM_PUBLISHED", "EXAM_SUBMITTED", "EXAM_GRADED", "EXAM_REOPENED"],
  },
  {
    key: "QUESTION",
    label: "الأسئلة",
    types: ["QUESTION_APPROVED", "QUESTION_REJECTED", "QUESTION_PENDING"],
  },
  { key: "ENROLLMENT", label: "التسجيلات", types: ["ENROLLMENT_CREATED"] },
  { key: "ABSENCE", label: "الغياب", types: ["ABSENCE_ALERT"] },
  { key: "SYSTEM", label: "النظام", types: ["SYSTEM"] },
];

const TYPE_FILTER_KEYS = TYPE_FILTERS.map((f) => f.key) as readonly TypeFilter[];

// ---- Tab (all/unread) -----------------------------------------------------

type Tab = "all" | "unread";
const TABS: Array<{ key: Tab; label: string }> = [
  { key: "all", label: "الكل" },
  { key: "unread", label: "غير مقروء" },
];
const TAB_KEYS = TABS.map((t) => t.key) as readonly Tab[];

// ---- Date grouping ---------------------------------------------------------

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function groupByDate(items: Notification[]) {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: Record<string, Notification[]> = {
    today: [],
    yesterday: [],
    this_week: [],
    older: [],
  };

  for (const n of items) {
    const created = new Date(n.created_at);
    if (created >= today) groups.today.push(n);
    else if (created >= yesterday) groups.yesterday.push(n);
    else if (created >= weekAgo) groups.this_week.push(n);
    else groups.older.push(n);
  }

  const labels: Record<string, string> = {
    today: "اليوم",
    yesterday: "أمس",
    this_week: "هذا الأسبوع",
    older: "أقدم",
  };

  return ["today", "yesterday", "this_week", "older"]
    .filter((k) => groups[k].length > 0)
    .map((k) => ({ key: k, label: labels[k], items: groups[k] }));
}

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

// ---- Page -----------------------------------------------------------------

export default function NotificationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [tab, setTab] = useUrlEnumState<Tab>("tab", TAB_KEYS, "all");
  const [typeFilter, setTypeFilter] = useUrlEnumState<TypeFilter>(
    "type",
    TYPE_FILTER_KEYS,
    "ALL"
  );
  const [page, setPage] = useUrlState("p", "1");
  const pageNum = Math.max(1, parseInt(page, 10) || 1);

  // Batch 12: selection state for bulk delete.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Notification | null>(null);

  // Clear selection when the list source changes.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [tab, typeFilter, pageNum]);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: getUnreadCount,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    staleTime: 15_000,
  });

  const typeInParam =
    typeFilter === "ALL"
      ? undefined
      : TYPE_FILTERS.find((f) => f.key === typeFilter)?.types?.join(",");

  const q = useQuery({
    queryKey: ["notifications", "list", tab, typeFilter, pageNum],
    queryFn: () =>
      listNotifications({
        unreadOnly: tab === "unread",
        page: pageNum,
        typeIn: typeInParam,
      }),
  });

  const items = q.data?.results ?? [];
  const total = q.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const groups = groupByDate(items);

  // ---- Mutations ----
  const markOne = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markUnread = useMutation({
    mutationFn: markNotificationUnread,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toastSuccess("تم تحديد الإشعار كغير مقروء");
    },
    onError: (err) => toastError(err, "تعذّر التحديث."),
  });

  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toastSuccess(`تم تحديد ${res.marked_read} إشعار كمقروء`);
      if (tab === "unread") {
        setTab("all");
        setPage("1");
      }
    },
    onError: (err) => toastError(err, "تعذّر تحديث الإشعارات."),
  });

  const bulkDelete = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteNotifications(ids),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toastSuccess(`تم حذف ${res.deleted} إشعار`);
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
    },
    onError: (err) => {
      toastError(err, "تعذّر حذف الإشعارات.");
      setConfirmBulkDelete(false);
    },
  });

  const singleDelete = useMutation({
    mutationFn: (id: string) => bulkDeleteNotifications([id]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toastSuccess("تم حذف الإشعار");
      setDeleteTarget(null);
    },
    onError: (err) => {
      toastError(err, "تعذّر حذف الإشعار.");
      setDeleteTarget(null);
    },
  });

  // ---- Handlers ----
  function handleOpen(n: Notification) {
    if (!n.is_read) markOne.mutate(n.id);
    if (n.link) router.push(n.link);
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allVisibleSelected =
    items.length > 0 && items.every((i) => selectedIds.has(i.id));

  function toggleAllVisible() {
    if (allVisibleSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((i) => i.id)));
  }

  function clearFilters() {
    setTab("all");
    setTypeFilter("ALL");
    setPage("1");
  }

  const hasActiveFilter = tab !== "all" || typeFilter !== "ALL";

  // ---- Empty state copy (per filter) ----
  const emptyState = (() => {
    if (hasActiveFilter && items.length === 0) {
      return {
        icon: "🔍",
        title: "لا توجد إشعارات مطابقة",
        description: "جرّب مسح الفلاتر أو تعديل البحث.",
        action: (
          <Button variant="ghost" onClick={clearFilters}>
            مسح الفلاتر
          </Button>
        ),
      };
    }
    if (tab === "unread") {
      return {
        icon: "✅",
        title: "لا توجد إشعارات غير مقروءة",
        description: "كل إشعاراتك مقروءة — جرّب «الكل» لرؤيتها.",
        action: undefined,
      };
    }
    return {
      icon: "🔔",
      title: "لا توجد إشعارات",
      description: "ستصلك إشعارات هنا عند حدوث نشاط يهمك.",
      action: undefined,
    };
  })();

  return (
    <>
      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-16 z-30 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ink px-4 py-2.5 text-sm text-white shadow-lg animate-slide-in-up">
          <div className="flex items-center gap-3">
            <span className="font-medium">
              تم تحديد {selectedIds.size} إشعار
            </span>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="flex items-center gap-1 text-xs text-white/70 hover:text-white"
            >
              <X size={12} /> إلغاء التحديد
            </button>
          </div>
          <button
            onClick={() => setConfirmBulkDelete(true)}
            className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-danger hover:bg-white/90"
          >
            حذف المحدد ({selectedIds.size})
          </button>
        </div>
      )}

      <PageShell
        title="الإشعارات"
        description={
          total > 0
            ? `${total} إشعار${unreadCount > 0 ? ` · ${unreadCount} غير مقروء` : ""}`
            : undefined
        }
        isLoading={q.isLoading}
        isError={q.isError}
        errorMessage="تعذّر تحميل الإشعارات."
        onRetry={() => q.refetch()}
        loadingVariant="custom"
        loadingContent={
          <div className="divide-y card divide-line">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3">
                <div className="w-10 h-10 rounded-lg shrink-0 animate-pulse bg-ink-100" />
                <div className="flex-1 space-y-2">
                  <div className="w-2/3 h-3 rounded animate-pulse bg-ink-100" />
                  <div className="w-1/2 h-2 rounded animate-pulse bg-ink-100" />
                </div>
              </div>
            ))}
          </div>
        }
        actions={
          <Button
            variant="secondary"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending || unreadCount === 0}
          >
            {markAll.isPending
              ? "..."
              : unreadCount > 0
              ? `تحديد الكل كمقروء (${unreadCount})`
              : "كل الإشعارات مقروءة"}
          </Button>
        }
        pagination={
          totalPages > 1
            ? {
                page: pageNum,
                totalPages,
                totalItems: total,
                pageSize: 20,
                onPageChange: (p) => setPage(String(p)),
                isLoading: q.isFetching,
              }
            : undefined
        }
      >
        {/* Tabs: all / unread */}
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => {
            const active = tab === t.key;
            const count = t.key === "unread" ? unreadCount : total;
            return (
              <button
                key={t.key}
                onClick={() => {
                  setTab(t.key);
                  setPage("1");
                }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-ink text-white dark:bg-accent dark:text-[#111827]"
                    : "bg-ink-50 text-ink-700 hover:bg-ink-100"
                }`}
              >
                {t.label}
                {count > 0 && (
                  <span
                    className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                      active ? "bg-white/20 text-white" : "bg-white text-ink-700"
                    }`}
                  >
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </button>
            );
          })}

          {/* Batch 12: type filter chips */}
          <div className="flex flex-wrap gap-1 ms-auto">
            {TYPE_FILTERS.filter((f) => f.key !== "ALL").map((f) => {
              const active = typeFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => {
                    setTypeFilter(active ? "ALL" : f.key);
                    setPage("1");
                  }}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    active
                      ? "border-ink bg-ink text-white dark:border-accent dark:bg-accent dark:text-[#111827]"
                      : "border-line text-ink-400 hover:border-ink/30 hover:text-ink"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Empty state */}
        {items.length === 0 && !q.isLoading && (
          <EmptyState
            icon={emptyState.icon}
            title={emptyState.title}
            description={emptyState.description}
            action={emptyState.action}
          />
        )}

        {/* Select-all header (only when items exist) */}
        {items.length > 0 && (
          <div className="flex items-center gap-2 px-1">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              className="w-4 h-4 cursor-pointer accent-ink"
              aria-label="تحديد كل الإشعارات المعروضة"
            />
            <span className="text-xs text-ink-400">
              تحديد الكل ({items.length} في الصفحة)
            </span>
          </div>
        )}

        {/* Grouped list */}
        {items.length > 0 && (
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <section key={group.key}>
                <h2 className="px-1 mb-2 text-xs font-medium tracking-wide uppercase text-ink-400">
                  {group.label}
                </h2>
                <div className="divide-y card divide-line">
                  {group.items.map((n) => (
                    <NotificationRow
                      key={n.id}
                      notification={n}
                      selected={selectedIds.has(n.id)}
                      onToggleSelect={() => toggleOne(n.id)}
                      onOpen={() => handleOpen(n)}
                      onMarkUnread={() => markUnread.mutate(n.id)}
                      onDelete={() => setDeleteTarget(n)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </PageShell>

      {/* Bulk delete confirm */}
      <ConfirmDialog
        open={confirmBulkDelete}
        title={`تأكيد حذف ${selectedIds.size} إشعار`}
        description={`سيتم حذف ${selectedIds.size} إشعار نهائيًا. لا يمكن التراجع.`}
        confirmLabel={bulkDelete.isPending ? "جارٍ الحذف..." : "حذف الكل"}
        cancelLabel="إلغاء"
        variant="danger"
        onConfirm={() => bulkDelete.mutate(Array.from(selectedIds))}
        onCancel={() => setConfirmBulkDelete(false)}
        isPending={bulkDelete.isPending}
      />

      {/* Single delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="تأكيد حذف الإشعار"
        description={
          deleteTarget
            ? `سيتم حذف "${deleteTarget.title}" نهائيًا.`
            : ""
        }
        confirmLabel={singleDelete.isPending ? "..." : "حذف"}
        cancelLabel="إلغاء"
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) singleDelete.mutate(deleteTarget.id);
        }}
        onCancel={() => setDeleteTarget(null)}
        isPending={singleDelete.isPending}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Notification row
// ---------------------------------------------------------------------------

function NotificationRow({
  notification,
  selected,
  onToggleSelect,
  onOpen,
  onMarkUnread,
  onDelete,
}: {
  notification: Notification;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onMarkUnread: () => void;
  onDelete: () => void;
}) {
  const meta = TYPE_META[notification.type] ?? {
    icon: "🔔",
    bg: "bg-ink-50",
    text: "text-ink-700",
    label: notification.type,
  };

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 transition-colors ${
        selected ? "bg-ink-50/60" : "hover:bg-ink-50/50"
      } ${!notification.is_read ? "bg-accent/5" : ""}`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        className="w-4 h-4 mt-2 cursor-pointer shrink-0 accent-ink"
        aria-label="تحديد الإشعار"
      />

      <button
        onClick={onOpen}
        className="flex items-start flex-1 min-w-0 gap-3 text-start"
      >
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg ${meta.bg}`}
        >
          {meta.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p
              className={`text-sm ${
                !notification.is_read
                  ? "font-semibold text-ink"
                  : "text-ink-700"
              }`}
            >
              {notification.title}
            </p>
            {!notification.is_read && (
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent"
                aria-label="غير مقروء"
              />
            )}
          </div>
          {notification.message && (
            <p className="mt-1 text-xs line-clamp-2 text-ink-400">
              {notification.message}
            </p>
          )}
          <p className="mt-1.5 text-[11px] text-ink-400">
            {relativeTime(notification.created_at)}
          </p>
        </div>
      </button>

      <div className="shrink-0">
        <ActionMenu
          items={[
            ...(notification.is_read
              ? [{ label: "تحديد كغير مقروء", onClick: onMarkUnread }]
              : []),
            {
              label: "حذف",
              variant: "danger" as const,
              onClick: onDelete,
            },
          ]}
        />
      </div>
    </div>
  );
}