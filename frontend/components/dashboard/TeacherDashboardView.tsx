"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ErrorState, Spinner } from "@/components/ui/States";
import { getTeacherDashboard, type DashboardRange } from "@/lib/api/dashboard";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { arabicPlural } from "@/lib/utils/arabicPlural";
import type { PendingGradingItem } from "@/types";
import { ActivityChart } from "./ActivityChart";
import { DateRangeSelector } from "./DateRangeSelector";
import { MetricCard } from "./MetricCard";

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

function parseRange(raw: string, fallback: DashboardRange = 30): DashboardRange {
  const n = parseInt(raw, 10);
  return (ALLOWED_RANGES as number[]).includes(n) ? (n as DashboardRange) : fallback;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  return `منذ ${d} يوم`;
}

export function TeacherDashboardView({ name }: { name?: string }) {
  const [rangeRaw, setRangeRaw] = useUrlState("range", "30");
  const days = parseRange(rangeRaw, 30);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "teacher", days],
    queryFn: () => getTeacherDashboard(days),
    // Refresh every 30s so pending grading updates as students submit.
    refetchInterval: 30_000,
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message="تعذّر تحميل اللوحة." />;

  const hasPending = data.metrics.pending_grading > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* ============ Greeting ============ */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-ink">
            مرحبًا{name ? `، ${name}` : ""} 👋
          </h1>
          <p className="mt-1 text-sm text-ink-400">أداء طلابك وامتحاناتك</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeSelector value={days} onChange={(v) => setRangeRaw(String(v))} />
        </div>
      </div>

      {/* ============ Priority hero: pending grading ============ */}
      {hasPending && (
        <div className="p-5 border-2 card border-accent/40 bg-accent/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-3xl font-display">✍️</p>
              <h2 className="mt-2 text-xl font-bold font-display text-ink">
                لديك {data.metrics.pending_grading} محاولة بانتظار التصحيح
              </h2>
              <p className="mt-1 text-sm text-ink-700">
                الطلاب بانتظار نتيجتهم — ابدأ التصحيح لتحرير النتائج.
              </p>
            </div>
            <div className="shrink-0">
              <Link href="/assessments">
                <Button variant="primary" className="w-full sm:w-auto sm:min-w-[180px]">
                  ابدأ التصحيح ←
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ============ Quick actions ============ */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link
          href="/assessments/new"
          className="flex items-center gap-3 p-4 transition-colors card hover:border-ink/30 hover:bg-ink-50/30"
        >
          <span className="flex items-center justify-center w-10 h-10 text-lg rounded-lg shrink-0 bg-ink-50">
            📝
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">إنشاء امتحان جديد</p>
            <p className="mt-0.5 text-xs text-ink-400">6 خطوات — دقيقتين</p>
          </div>
        </Link>
        <Link
          href="/questions"
          className="flex items-center gap-3 p-4 transition-colors card hover:border-ink/30 hover:bg-ink-50/30"
        >
          <span className="flex items-center justify-center w-10 h-10 text-lg rounded-lg shrink-0 bg-ink-50">
            ➕
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">إضافة سؤال</p>
            <p className="mt-0.5 text-xs text-ink-400">إلى بنك الأسئلة</p>
          </div>
        </Link>
        <Link
          href="/content"
          className="flex items-center gap-3 p-4 transition-colors card hover:border-ink/30 hover:bg-ink-50/30"
        >
          <span className="flex items-center justify-center w-10 h-10 text-lg rounded-lg shrink-0 bg-ink-50">
            📚
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">رفع محتوى</p>
            <p className="mt-0.5 text-xs text-ink-400">مذكرة، فيديو، ملخص</p>
          </div>
        </Link>
      </div>

      {/* ============ Metrics ============ */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="طلابي" value={data.metrics.my_students} />
        <MetricCard
          label="امتحاناتي النشطة"
          value={data.metrics.my_active_assessments}
          accent="success"
        />
        <MetricCard
          label="بانتظار التصحيح"
          value={data.metrics.pending_grading}
          accent={hasPending ? "warning" : "default"}
        />
        <MetricCard
          label="متوسط الأداء"
          value={
            data.metrics.avg_percentage !== null
              ? `${data.metrics.avg_percentage}%`
              : "—"
          }
          hint={`${arabicPlural(data.metrics.attempts_in_range, ATTEMPT_FORMS)} في آخر ${arabicPlural(days, DAY_FORMS)}`}
        />
      </div>

      {/* ============ Pending grading list ============ */}
      {data.pending_grading_items.length > 0 && (
        <div className="p-5 card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold font-display text-ink">
              محاولات بانتظار التصحيح
            </h2>
            <Link href="/assessments">
              <Button variant="ghost" className="text-xs">
                عرض الكل
              </Button>
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {data.pending_grading_items.map((item) => (
              <PendingGradingRow key={item.attempt_id} item={item} />
            ))}
          </ul>
        </div>
      )}

      {/* ============ Chart ============ */}
      <ActivityChart data={data.chart} />

      {/* ============ Recent assessments ============ */}
      <div className="p-5 card">
        <h2 className="mb-3 text-base font-bold font-display text-ink">
          امتحاناتي الأخيرة
        </h2>
        {data.recent_assessments.length === 0 ? (
          <p className="text-sm text-ink-400">لم تُنشئ أي امتحان بعد.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.recent_assessments.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-ink">{a.title}</p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {a.attempts_count} محاولة · {a.status}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/assessments/${a.id}/results`}>
                    <Button variant="ghost" className="text-xs">
                      النتائج
                    </Button>
                  </Link>
                  {a.status === "DRAFT" && (
                    <Link href={`/assessments/${a.id}/edit`}>
                      <Button variant="secondary" className="text-xs">
                        تحرير
                      </Button>
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PendingGradingRow({ item }: { item: PendingGradingItem }) {
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate text-ink">
          {item.student_name}
        </p>
        <p className="mt-0.5 truncate text-xs text-ink-400">
          {item.assessment_title} · {item.pending_essays}{" "}
          {item.pending_essays === 1 ? "مقال" : "مقالات"} بانتظار التصحيح
        </p>
        <p className="mt-0.5 text-[11px] text-ink-400">
          سلّم {relativeTime(item.submitted_at)}
        </p>
      </div>
      <div className="shrink-0">
        <Link
          href={`/assessments/${item.assessment_id}/results/${item.attempt_id}/grade`}
        >
          <Button variant="secondary" className="text-xs">
            صحّح
          </Button>
        </Link>
      </div>
    </li>
  );
}