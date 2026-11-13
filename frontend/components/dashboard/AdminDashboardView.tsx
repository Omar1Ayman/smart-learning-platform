"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ErrorState, Spinner } from "@/components/ui/States";
import { getAdminDashboard, type DashboardRange } from "@/lib/api/dashboard";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { arabicPlural } from "@/lib/utils/arabicPlural";
import { ActivityChart } from "./ActivityChart";
import { DateRangeSelector } from "./DateRangeSelector";
import { MetricCard } from "./MetricCard";
import { SetupProgressCard } from "@/components/setup/SetupProgressCard";

const ALLOWED_RANGES: DashboardRange[] = [7, 14, 30, 90];

const ATTEMPT_FORMS = {
  zero: "لا محاولات",
  one: "محاولة",
  two: "محاولتان",
  few: "محاولات",
  many: "محاولة",
};

const DAY_FORMS = {
  zero: "أيام",
  one: "يوم",
  two: "يومان",
  few: "أيام",
  many: "يومًا",
};

function parseRange(raw: string, fallback: DashboardRange = 7): DashboardRange {
  const n = parseInt(raw, 10);
  return (ALLOWED_RANGES as number[]).includes(n) ? (n as DashboardRange) : fallback;
}

export function AdminDashboardView({ name }: { name?: string }) {
  const [rangeRaw, setRangeRaw] = useUrlState("range", "7");
  const days = parseRange(rangeRaw, 7);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "admin", days],
    queryFn: () => getAdminDashboard(days),
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message="تعذّر تحميل اللوحة." />;

  return (
    <div className="flex flex-col gap-6">
      <SetupProgressCard />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            مرحبًا{name ? `، ${name}` : ""} 👋
          </h1>
          <p className="mt-1 text-sm text-ink-400">نظرة سريعة على مؤسستك</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeSelector
            value={days}
            onChange={(v) => setRangeRaw(String(v))}
          />
          <Link href="/assessments/new">
            <Button>+ امتحان جديد</Button>
          </Link>
          <Link href="/enrollments">
            <Button variant="secondary">+ تسجيل طالب</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="إجمالي الطلاب" value={data.metrics.total_students} />
        <MetricCard label="المعلمون" value={data.metrics.total_teachers} />
        <MetricCard
          label="امتحانات نشطة"
          value={data.metrics.active_assessments}
          accent="success"
        />
        <MetricCard
          label="متوسط الأداء"
          value={
            data.metrics.avg_percentage !== null
              ? `${data.metrics.avg_percentage}%`
              : "—"
          }
          hint={`${arabicPlural(data.metrics.attempts_in_range, ATTEMPT_FORMS)} في آخر ${arabicPlural(days, DAY_FORMS)}`}
          accent="warning"
        />
      </div>

      <ActivityChart data={data.chart} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 font-display text-base font-bold text-ink">
            آخر الامتحانات
          </h2>
          {data.recent_assessments.length === 0 ? (
            <p className="text-sm text-ink-400">لم يُنشأ أي امتحان بعد.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.recent_assessments.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {a.title}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {a.attempts_count} محاولة ·{" "}
                      {a.avg_percentage !== null
                        ? `${a.avg_percentage}%`
                        : "بدون تصحيح"}
                    </p>
                  </div>
                  <Link href={`/assessments/${a.id}/results`}>
                    <Button variant="ghost" className="text-xs">
                      النتائج
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-3 font-display text-base font-bold text-ink">
            آخر التسجيلات
          </h2>
          {data.recent_students.length === 0 ? (
            <p className="text-sm text-ink-400">لا توجد تسجيلات بعد.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.recent_students.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {s.name}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-400">{s.group_name}</p>
                  </div>
                  <span className="text-xs text-ink-400">
                    {new Date(s.enrolled_at).toLocaleDateString("ar-EG")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}