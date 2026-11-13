"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ErrorState, Spinner } from "@/components/ui/States";
import {
  getPlatformMetrics,
  listDemoRequests,
  listPlatformTenants,
  platformStatusLabel,
  platformStatusStyle,
} from "@/lib/api/platformAdmin";

export default function PlatformDashboardPage() {
  const { data: metrics, isLoading: mLoad, isError: mErr } = useQuery({
    queryKey: ["platform-metrics"],
    queryFn: getPlatformMetrics,
    refetchInterval: 30_000,
  });
  const { data: recentTenants } = useQuery({
    queryKey: ["platform-tenants", "recent"],
    queryFn: () => listPlatformTenants(),
  });
  const { data: recentLeads } = useQuery({
    queryKey: ["platform-demo-requests", "NEW"],
    queryFn: () => listDemoRequests({ status: "NEW" }),
  });

  if (mLoad) return <Spinner />;
  if (mErr || !metrics) return <ErrorState message="تعذّر تحميل اللوحة." />;

  const exams = metrics.exams;

  return (
    <div className="flex flex-col max-w-6xl gap-6 mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-ink">
            لوحة إدارة المنصة
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            نظرة حية على صحة الامتحانات والمؤسسات
          </p>
        </div>
        <Link href="/platform/tenants/new">
          <Button>+ إنشاء مؤسسة</Button>
        </Link>
      </div>

      {/* Exam KPIs — the product's heartbeat */}
      <div>
        <h2 className="mb-2 text-xs font-medium tracking-wide uppercase text-ink-400">
          نشاط الامتحانات
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="امتحانات منشورة"
            value={exams.published_total}
            icon="📝"
            accent="default"
          />
          <KpiCard
            label="محاولات جارية الآن"
            value={exams.in_progress_now}
            icon="🎯"
            accent={exams.in_progress_now > 0 ? "success" : "default"}
            hint="الطلاب بيمتحنوا حاليًا"
          />
          <KpiCard
            label="بانتظار التصحيح"
            value={exams.pending_grading}
            icon="✍️"
            accent={exams.pending_grading > 0 ? "warning" : "default"}
            hint="محاولات تحتاج مراجعة يدوية"
          />
          <KpiCard
            label="مُسلَّمة هذا الأسبوع"
            value={exams.submissions_this_week}
            icon="📊"
            accent="success"
            hint={`${exams.submissions_today} اليوم`}
          />
        </div>
      </div>

      {/* Suspicious banner — critical for online exams */}
      {exams.suspicious_attempts_week > 0 && (
        <div className="p-4 border rounded-lg border-accent/30 bg-accent/5">
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold font-display text-ink">
                نشاط مشبوه هذا الأسبوع
              </p>
              <p className="mt-0.5 text-xs text-ink-700">
                {exams.suspicious_attempts_week} محاولة سُجّلت فيها أحداث
                مشبوهة (الخروج من النافذة، النسخ، إلخ). راجعها في صفحة المؤسسة
                المعنية.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tenant metrics */}
      <div>
        <h2 className="mb-2 text-xs font-medium tracking-wide uppercase text-ink-400">
          المؤسسات
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="إجمالي المؤسسات"
            value={metrics.tenants.total}
            icon="🏫"
            accent="default"
            hint={`${metrics.tenants.active} نشطة · ${metrics.tenants.trial} تجريبية`}
          />
          <KpiCard
            label="المستخدمون"
            value={metrics.total_users}
            icon="👥"
            accent="default"
            hint="عبر جميع المؤسسات"
          />
          <KpiCard
            label="مؤسسات نشطة"
            value={metrics.tenants.active}
            icon="✅"
            accent="success"
          />
          <KpiCard
            label="طلبات جديدة"
            value={metrics.demo_requests_new}
            icon="📬"
            accent={metrics.demo_requests_new > 0 ? "warning" : "default"}
            hint="بانتظار المراجعة"
          />
        </div>
      </div>

      {/* Top tenants by exam usage */}
      <div className="p-5 card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold font-display text-ink">
            أكثر المؤسسات نشاطًا في الامتحانات
          </h2>
          <Link href="/platform/tenants">
            <Button variant="ghost" className="text-xs">
              عرض الكل
            </Button>
          </Link>
        </div>
        {!metrics.top_tenants || metrics.top_tenants.length === 0 ? (
          <p className="py-6 text-sm text-center text-ink-400">
            لا توجد امتحانات بعد
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-start text-ink-700">
                <tr>
                  <th className="px-3 py-2 font-medium text-start">المؤسسة</th>
                  <th className="px-3 py-2 font-medium text-start">الحالة</th>
                  <th className="px-3 py-2 font-medium text-center">
                    امتحانات منشورة
                  </th>
                  <th className="px-3 py-2 font-medium text-center">
                    محاولات
                  </th>
                  <th className="px-3 py-2 font-medium text-center">مسلَّمة</th>
                </tr>
              </thead>
              <tbody>
                {metrics.top_tenants.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-line last:border-0 hover:bg-ink-50/30"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/platform/tenants/${t.id}`}
                        className="font-medium text-ink hover:underline"
                      >
                        {t.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${platformStatusStyle(t.status)}`}
                      >
                        {platformStatusLabel(t.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums text-ink-700">
                      {t.published_exams}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums text-ink-700">
                      {t.attempts}
                    </td>
                    <td className="px-3 py-2 font-medium text-center tabular-nums text-success">
                      {t.submissions}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Two-column lists */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent tenants */}
        <div className="p-5 card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold font-display text-ink">
              أحدث المؤسسات
            </h2>
            <Link href="/platform/tenants">
              <Button variant="ghost" className="text-xs">
                عرض الكل
              </Button>
            </Link>
          </div>
          {!recentTenants || recentTenants.results.length === 0 ? (
            <p className="text-sm text-ink-400">لم تُنشأ أي مؤسسة بعد.</p>
          ) : (
            <ul className="divide-y divide-line">
              {recentTenants.results.slice(0, 5).map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-ink">
                      {t.name}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {t.user_count} مستخدم · {t.owner_email ?? "بدون مالك"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${platformStatusStyle(t.status)}`}
                  >
                    {platformStatusLabel(t.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent demo requests */}
        <div className="p-5 card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold font-display text-ink">
              طلبات عرض جديدة
            </h2>
            <Link href="/platform/demo-requests">
              <Button variant="ghost" className="text-xs">
                عرض الكل
              </Button>
            </Link>
          </div>
          {!recentLeads || recentLeads.results.length === 0 ? (
            <p className="text-sm text-ink-400">لا توجد طلبات جديدة.</p>
          ) : (
            <ul className="divide-y divide-line">
              {recentLeads.results.slice(0, 5).map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-ink">
                      {d.school_name}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {d.contact_name} · {d.phone}
                    </p>
                  </div>
                  <Link href="/platform/demo-requests">
                    <Button variant="ghost" className="text-xs">
                      مراجعة
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function KpiCard({
  label, value, icon, accent = "default", hint,
}: {
  label: string;
  value: number;
  icon: string;
  accent?: "default" | "success" | "warning";
  hint?: string;
}) {
  const accentColors = {
    default: "text-ink",
    success: "text-success dark:text-success-light",
    warning: "text-accent-dark dark:text-accent-light",
  };
  const accentBg = {
    default: "bg-ink-50",
    success: "bg-success/10 dark:bg-success/15",
    warning: "bg-accent/10 dark:bg-accent/15",
  };

  return (
    <div className="p-4 card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-ink-400">{label}</p>
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg text-sm ${accentBg[accent]}`}
        >
          {icon}
        </span>
      </div>
      <p className={`mt-2 font-display text-3xl font-bold tabular-nums ${accentColors[accent]}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-[10px] text-ink-400">{hint}</p>}
    </div>
  );
}