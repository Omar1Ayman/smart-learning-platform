"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PageShell } from "@/components/ui/PageShell";
import { listMyChildren, RELATIONSHIP_LABEL } from "@/lib/api/parent";
import { listNotifications } from "@/lib/api/notifications";
import { useAuthStore } from "@/lib/auth/store";
import type { Notification, ParentChildSummary } from "@/types";

export default function ParentHomePage() {
  const parentName = useAuthStore((s) => s.user?.first_name);

  const childrenQ = useQuery({
    queryKey: ["parent", "children"],
    queryFn: listMyChildren,
  });

  const notificationsQ = useQuery({
    queryKey: ["parent", "notifications", "recent"],
    queryFn: () => listNotifications({ page: 1 }),
  });

  const children = childrenQ.data ?? [];
  const recentNotifications = (notificationsQ.data?.results ?? []).slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      <PageShell
        title={`مرحبًا${parentName ? `، ${parentName}` : ""} 👋`}
        description={
          children.length > 0
            ? `${children.length} ${children.length === 1 ? "ابن/ابنة" : "أبناء"}`
            : "تابع أداء أبنائك التعليمي"
        }
        isLoading={childrenQ.isLoading}
        isError={childrenQ.isError}
        errorMessage="تعذّر تحميل بيانات الأبناء."
        onRetry={() => childrenQ.refetch()}
        loadingVariant="cards"
        isEmpty={children.length === 0}
        emptyIcon="👨‍👩‍👧"
        emptyTitle="لم يتم ربط أي طالب بحسابك بعد"
        emptyDescription="تواصل مع إدارة المدرسة لربط حسابك بأبنائك."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((c) => (
            <ChildCard key={c.id} child={c} />
          ))}
        </div>
      </PageShell>

      {/* Recent notifications */}
      {recentNotifications.length > 0 && (
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line bg-gradient-to-l from-info/10 to-transparent px-5 py-3">
            <h2 className="font-display text-base font-bold text-ink">
              🔔 آخر الإشعارات
            </h2>
            <Link href="/notifications">
              <Button variant="ghost" className="text-xs">
                الكل
              </Button>
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {recentNotifications.map((n) => (
              <NotificationRow key={n.id} notification={n} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ChildCard({ child }: { child: ParentChildSummary }) {
  const fullName =
    [child.first_name, child.last_name].filter(Boolean).join(" ") || child.email;

  const attendancePct = child.attendance_pct;
  const avgPct = child.avg_percentage;

  return (
    <Link
      href={`/parent/children/${child.id}`}
      className="card flex flex-col gap-4 p-5 transition-shadow hover:shadow-card-hover"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-lg font-bold text-white">
          {child.first_name?.[0]?.toUpperCase() || child.email[0]?.toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-bold text-ink">
            {fullName}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">
            {RELATIONSHIP_LABEL[child.relationship] ?? child.relationship}
            {child.is_primary && " · جهة اتصال أساسية"}
          </p>
        </div>
      </div>

      {child.group_name ? (
        <div className="rounded-lg bg-paper-muted/30 px-3 py-2 text-xs text-ink-700">
          <p>
            <span className="text-ink-400">الصف: </span>
            {child.grade_name}
          </p>
          <p className="mt-0.5">
            <span className="text-ink-400">المجموعة: </span>
            {child.group_name}
          </p>
          <p className="mt-0.5">
            <span className="text-ink-400">السنة: </span>
            {child.academic_year_name}
          </p>
        </div>
      ) : (
        <p className="rounded-lg bg-accent/5 px-3 py-2 text-xs text-ink-700">
          لا يوجد تسجيل نشط حاليًا
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-line p-2.5 text-center">
          <p className="text-[10px] text-ink-400">نسبة الحضور</p>
          <p
            className={`mt-1 font-display text-lg font-bold ${
              attendancePct === null
                ? "text-ink-400"
                : attendancePct >= 80
                ? "text-success"
                : attendancePct >= 50
                ? "text-accent-dark"
                : "text-danger"
            }`}
          >
            {attendancePct !== null ? `${attendancePct}%` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-line p-2.5 text-center">
          <p className="text-[10px] text-ink-400">متوسط الامتحانات</p>
          <p
            className={`mt-1 font-display text-lg font-bold ${
              avgPct === null
                ? "text-ink-400"
                : avgPct >= 70
                ? "text-success"
                : avgPct >= 40
                ? "text-accent-dark"
                : "text-danger"
            }`}
          >
            {avgPct !== null ? `${avgPct}%` : "—"}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-line pt-3">
        <span className="text-[10px] text-ink-400">
          {child.total_attempts} امتحان
        </span>
        <Button variant="ghost" className="text-xs pointer-events-none">
          عرض التفاصيل →
        </Button>
      </div>
    </Link>
  );
}

function NotificationRow({ notification }: { notification: Notification }) {
  const isAbsence = notification.type === "ABSENCE_ALERT";
  const icon = isAbsence ? "⚠️" : "🔔";
  const bg = isAbsence ? "bg-danger/10" : "bg-ink-50";

  return (
    <li>
      <Link
        href={notification.link || "/notifications"}
        className={`flex items-start gap-3 px-5 py-3 transition-colors hover:bg-ink-50/50 ${
          !notification.is_read ? "bg-accent/5" : ""
        }`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base ${bg}`}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-sm ${
              !notification.is_read
                ? "font-semibold text-ink"
                : "text-ink-700"
            }`}
          >
            {notification.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-ink-400">
            {notification.message}
          </p>
        </div>
        <span className="shrink-0 text-[10px] text-ink-400">
          {new Date(notification.created_at).toLocaleDateString("ar-EG", {
            day: "numeric",
            month: "short",
          })}
        </span>
      </Link>
    </li>
  );
}