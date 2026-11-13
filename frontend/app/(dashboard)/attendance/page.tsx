"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { QuickStartSessionModal } from "@/components/attendance/QuickStartSessionModal";
import { Button } from "@/components/ui/Button";
import { PageShell } from "@/components/ui/PageShell";
import { Search, X } from "@/components/ui/icons";
import {
  SESSION_STATUS_LABEL,
  SESSION_STATUS_STYLE,
  listAttendanceSessions,
} from "@/lib/api/attendance";
import { listGroups } from "@/lib/api/groups";
import { useAuthStore } from "@/lib/auth/store";
import { useCanWrite } from "@/lib/auth/useCanWrite";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useUrlState } from "@/lib/hooks/useUrlState";
import type { AttendanceSessionStatus } from "@/types";

const PAGE_SIZE = 20;

type StatusTab = "ALL" | AttendanceSessionStatus;
const TABS: Array<{ key: StatusTab; label: string }> = [
  { key: "ALL", label: "الكل" },
  { key: "SCHEDULED", label: "مجدولة" },
  { key: "OPEN", label: "مفتوحة" },
  { key: "CLOSED", label: "مغلقة" },
];

export default function AttendancePage() {
  const role = useAuthStore((s) => s.user?.role);
  const canWrite = useCanWrite();
  const isStaff = role === "OWNER" || role === "ADMIN" || role === "TEACHER";
  const [quickStartOpen, setQuickStartOpen] = useState(false);

  const [page, setPage] = useUrlState("p", "1");
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const [statusTab, setStatusTab] = useUrlState("status", "ALL");
  const [groupFilter, setGroupFilter] = useUrlState("group", "");
  const [searchUrl, setSearchUrl] = useUrlState("q", "");

  const [searchInput, setSearchInput] = useState(searchUrl);
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  useEffect(() => {
    if (debouncedSearch !== searchUrl) setSearchUrl(debouncedSearch);
  }, [debouncedSearch, searchUrl, setSearchUrl]);

  const apiStatus: AttendanceSessionStatus | undefined =
    statusTab === "SCHEDULED" ||
    statusTab === "OPEN" ||
    statusTab === "CLOSED" ||
    statusTab === "CANCELLED"
      ? statusTab
      : undefined;

  const { data: groups } = useQuery({
    queryKey: ["groups"],
    queryFn: () => listGroups(),
    enabled: isStaff,
  });

  const q = useQuery({
    queryKey: ["attendance-sessions", pageNum, statusTab, groupFilter],
    queryFn: () =>
      listAttendanceSessions({
        page: pageNum,
        page_size: PAGE_SIZE,
        status: apiStatus,
        group: groupFilter || undefined,
        ordering: "-date",
      }),
    enabled: isStaff,
  });

  if (!isStaff) {
    return (
      <PageShell
        title="الحضور والغياب"
        isError
        errorMessage="هذا القسم متاح فقط لفريق العمل (مالك/مسؤول/معلم)."
        isEmpty={false}
        isLoading={false}
      >
        {null}
      </PageShell>
    );
  }

  const items = q.data?.results ?? [];
  const total = q.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasActiveFilter = statusTab !== "ALL" || groupFilter !== "";

  return (
    <>
      <PageShell
        title="الحضور والغياب"
        description={
          total > 0 ? `${total} جلسة` : "سجّل حضور طلابك بمسح QR أو يدويًا"
        }
        isLoading={q.isLoading}
        isError={q.isError}
        errorMessage="تعذّر تحميل الجلسات."
        onRetry={() => q.refetch()}
        isEmpty={items.length === 0}
        emptyIcon="📋"
        emptyTitle="لا توجد جلسات بعد"
        emptyDescription="ابدأ بإنشاء جلسة جديدة لتسجيل الحضور."
        emptyAction={
          canWrite && (
            <Button
              onClick={() => setQuickStartOpen(true)}
            >
              🚀 بدء حصة الآن
            </Button>
          )
        }
        actions={
          canWrite ? (
            <>
              <Link href="/attendance/scanner-setup">
                <Button variant="ghost" className="text-xs">
                  ⚙️ اختبار الماسح
                </Button>
              </Link>
              <Button
                onClick={() => setQuickStartOpen(true)}
              >
                🚀 بدء حصة الآن
              </Button>
              <Link href="/attendance/new">
                <Button variant="secondary">+ جلسة مجدولة</Button>
              </Link>
            </>
          ) : undefined
        }
        pagination={{
          page: pageNum,
          totalPages,
          totalItems: total,
          pageSize: PAGE_SIZE,
          onPageChange: (p) => setPage(String(p)),
          isLoading: q.isFetching,
        }}
      >
        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setStatusTab(t.key);
                setPage("1");
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                statusTab === t.key
                  ? "bg-ink text-white dark:bg-accent dark:text-[#111827]"
                  : "bg-ink-50 text-ink-700 hover:bg-ink-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-400"
            />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="ابحث..."
              className="w-full rounded-lg border border-line bg-paper-elevated py-2 pe-9 ps-3 text-sm text-ink outline-none transition-colors focus:border-ink focus:ring-2 focus:ring-ink/10"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink"
                aria-label="مسح البحث"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <select
            value={groupFilter}
            onChange={(e) => {
              setGroupFilter(e.target.value);
              setPage("1");
            }}
            className="max-w-[220px] rounded-lg border border-line bg-paper-elevated px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          >
            <option value="">كل المجموعات</option>
            {(groups?.results ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          {hasActiveFilter && (
            <button
              onClick={() => {
                setStatusTab("ALL");
                setGroupFilter("");
                setPage("1");
              }}
              className="text-xs text-ink-400 hover:text-ink"
            >
              مسح الكل
            </button>
          )}
        </div>

        {/* Cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((s) => {
            const attendancePct =
              s.total_students > 0
                ? Math.round(
                    ((s.present_count + s.late_count) / s.total_students) * 100
                  )
                : 0;

            return (
              <Link
                key={s.id}
                href={`/attendance/${s.id}`}
                className="card flex flex-col gap-3 p-4 transition-shadow hover:shadow-card-hover"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {s.group_name}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {s.date} · {s.start_time} - {s.end_time}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${SESSION_STATUS_STYLE[s.status]}`}
                  >
                    {SESSION_STATUS_LABEL[s.status]}
                  </span>
                </div>

                {s.status === "OPEN" && (
                  <div className="rounded-lg bg-success/5 p-2 text-xs text-success">
                    🟢 الحضور مفتوح الآن
                  </div>
                )}

                {s.status === "CLOSED" && (
                  <>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">
                        حاضر: {s.present_count}
                      </span>
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-accent-dark">
                        متأخر: {s.late_count}
                      </span>
                      <span className="rounded-full bg-danger/10 px-2 py-0.5 text-danger">
                        غائب: {s.absent_count}
                      </span>
                    </div>
                    {s.total_students > 0 && (
                      <div>
                        <div className="mb-1 flex items-center justify-between text-[10px] text-ink-400">
                          <span>نسبة الحضور</span>
                          <span>{attendancePct}%</span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-ink-100">
                          <div
                            className={`h-full rounded-full transition-all ${
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
                  </>
                )}
              </Link>
            );
          })}
        </div>
      </PageShell>

      <QuickStartSessionModal
        open={quickStartOpen}
        onClose={() => setQuickStartOpen(false)}
      />
    </>
  );
}