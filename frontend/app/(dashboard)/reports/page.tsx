"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/Button";
import { ErrorState, Spinner } from "@/components/ui/States";
import {
  getAdminReports,
  type DashboardRange,
} from "@/lib/api/dashboard";
import { useUrlState } from "@/lib/hooks/useUrlState";
import type { TeacherActivity, TeacherActivityRow } from "@/types";

const ALLOWED_RANGES: DashboardRange[] = [7, 14, 30, 90];

function parseRange(raw: string, fallback: DashboardRange = 7): DashboardRange {
  const n = parseInt(raw, 10);
  return (ALLOWED_RANGES as number[]).includes(n) ? (n as DashboardRange) : fallback;
}

const ACTIVITY_META: Record<
  TeacherActivity,
  { label: string; cls: string; dot: string }
> = {
  active: { label: "نشط", cls: "bg-success/10 text-success", dot: "bg-success" },
  low: { label: "منخفض", cls: "bg-accent/20 text-accent-dark", dot: "bg-accent" },
  inactive: { label: "خامل", cls: "bg-ink-50 text-ink-400", dot: "bg-ink-400" },
};

export default function ReportsPage() {
  const [rangeRaw, setRangeRaw] = useUrlState("range", "7");
  const days = parseRange(rangeRaw, 7);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "reports", days],
    queryFn: () => getAdminReports(days),
    refetchInterval: 60_000,
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message="تعذّر تحميل التقارير." />;

  const { attendance, exams, teachers } = data;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-ink">التقارير</h1>
          <p className="mt-1 text-sm text-ink-400">
            نظرة شاملة على الحضور والامتحانات ونشاط المعلمين
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ALLOWED_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRangeRaw(String(r))}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                days === r
                  ? "bg-ink text-white dark:bg-accent dark:text-[#111827]"
                  : "bg-ink-50 text-ink-700 hover:bg-ink-100"
              }`}
            >
              {r} يوم
            </button>
          ))}
          <Link href="/settings/data">
            <Button variant="ghost" className="text-xs">
              تصدير البيانات الخام
            </Button>
          </Link>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="نسبة الحضور"
          value={
            attendance.overall_rate !== null
              ? `${attendance.overall_rate}%`
              : "—"
          }
          hint={`${attendance.by_group.length} مجموعة`}
          accent={
            attendance.overall_rate === null
              ? "default"
              : attendance.overall_rate >= 80
              ? "success"
              : attendance.overall_rate >= 50
              ? "warning"
              : "danger"
          }
        />
        <MetricCard
          label="محاولات الامتحانات"
          value={exams.total_attempts}
          hint={`${exams.completed} مكتملة`}
          accent="default"
        />
        <MetricCard
          label="بانتظار التصحيح"
          value={exams.pending_grading}
          hint={exams.pending_grading > 0 ? "تحتاج مراجعة" : "كل شيء نظيف"}
          accent={exams.pending_grading > 0 ? "warning" : "default"}
        />
        <MetricCard
          label="معلمون نشطون"
          value={`${teachers.active} / ${teachers.total}`}
          hint={`${teachers.inactive} خامل`}
          accent={teachers.inactive > 0 ? "warning" : "success"}
        />
      </div>

      {/* Attendance section */}
      <section className="p-5 card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold font-display text-ink">
            الحضور والغياب
          </h2>
          <span className="text-xs text-ink-400">
            {attendance.trend.length} يوم به جلسات
          </span>
        </div>

        {attendance.by_group.length === 0 ? (
          <p className="py-8 text-sm text-center text-ink-400">
            لا توجد جلسات مغلقة في هذه الفترة. أغلق جلسة حضور أولًا.
          </p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Trend chart */}
            <div>
              <p className="mb-2 text-xs text-ink-400">اتجاه الحضور اليومي</p>
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <LineChart
                    data={attendance.trend}
                    margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#6B7280" }}
                      tickFormatter={(v: string) => v.slice(5)}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#6B7280" }}
                      domain={[0, 100]}
                    />
                    <Tooltip
                      contentStyle={{
                        direction: "rtl",
                        fontFamily: "inherit",
                        fontSize: 12,
                        borderRadius: 8,
                      }}
                      formatter={(value: unknown) => [
                        `${value ?? 0}%`,
                        "نسبة الحضور",
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="present_pct"
                      stroke="#10B981"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Group ranking bar chart */}
            <div>
              <p className="mb-2 text-xs text-ink-400">
                نسبة الحضور لكل مجموعة
              </p>
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={attendance.by_group.slice(0, 8)}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <YAxis
                      type="category"
                      dataKey="group_name"
                      tick={{ fontSize: 10, fill: "#6B7280" }}
                      width={100}
                    />
                    <Tooltip
                      contentStyle={{
                        direction: "rtl",
                        fontFamily: "inherit",
                        fontSize: 12,
                        borderRadius: 8,
                      }}
                      formatter={(value: unknown) => [
                        `${value ?? 0}%`,
                        "الحضور",
                      ]}
                    />
                    <Bar dataKey="avg_present_pct" radius={[0, 4, 4, 0]}>
                      {attendance.by_group.slice(0, 8).map((e, i) => {
                        const pct = e.avg_present_pct ?? 0;
                        const fill =
                          pct >= 80
                            ? "#10B981"
                            : pct >= 50
                            ? "#F59E0B"
                            : "#EF4444";
                        return <Cell key={i} fill={fill} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Exams section */}
      <section className="p-5 card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold font-display text-ink">
            الامتحانات
          </h2>
          <span className="text-xs text-ink-400">
            متوسط الدرجة:{" "}
            {exams.avg_score_pct !== null ? `${exams.avg_score_pct}%` : "—"}
          </span>
        </div>

        {exams.total_attempts === 0 ? (
          <p className="py-8 text-sm text-center text-ink-400">
            لا توجد محاولات في هذه الفترة.
          </p>
        ) : (
          <>
            {/* Status cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="p-3 text-center border rounded-lg border-line">
                <p className="text-[10px] text-ink-400">إجمالي</p>
                <p className="mt-1 text-lg font-bold font-display text-ink">
                  {exams.total_attempts}
                </p>
              </div>
              <div className="p-3 text-center border rounded-lg border-success/30 bg-success/5">
                <p className="text-[10px] text-ink-400">مكتملة</p>
                <p className="mt-1 text-lg font-bold font-display text-success">
                  {exams.completed}
                </p>
              </div>
              <div className="p-3 text-center border rounded-lg border-accent/30 bg-accent/5">
                <p className="text-[10px] text-ink-400">بانتظار التصحيح</p>
                <p className="mt-1 text-lg font-bold font-display text-accent-dark">
                  {exams.pending_grading}
                </p>
              </div>
              <div className="p-3 text-center border rounded-lg border-info/30 bg-info/5">
                <p className="text-[10px] text-ink-400">قيد التنفيذ</p>
                <p className="mt-1 text-lg font-bold font-display text-info">
                  {exams.in_progress}
                </p>
              </div>
            </div>

            {/* Top assessments table */}
            {exams.by_assessment.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs text-ink-400">
                  أكثر الامتحانات استخدامًا
                </p>
                <div className="overflow-x-auto border rounded-lg border-line">
                  <table className="w-full text-sm">
                    <thead className="bg-ink-50 text-start text-ink-700">
                      <tr>
                        <th className="px-3 py-2 font-medium text-start">
                          الامتحان
                        </th>
                        <th className="px-3 py-2 font-medium text-center">
                          محاولات
                        </th>
                        <th className="px-3 py-2 font-medium text-center">
                          مكتملة
                        </th>
                        <th className="px-3 py-2 font-medium text-center">
                          نسبة الإكمال
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {exams.by_assessment.map((a) => {
                        const pct =
                          a.attempts > 0
                            ? Math.round((a.completed / a.attempts) * 100)
                            : 0;
                        return (
                          <tr
                            key={a.assessment_id}
                            className="border-b border-line last:border-0"
                          >
                            <td className="px-3 py-2 text-ink">{a.title}</td>
                            <td className="px-3 py-2 text-center text-ink-700">
                              {a.attempts}
                            </td>
                            <td className="px-3 py-2 text-center text-success">
                              {a.completed}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-100">
                                  <div
                                    className={`h-full rounded-full ${
                                      pct >= 80
                                        ? "bg-success"
                                        : pct >= 50
                                        ? "bg-accent"
                                        : "bg-danger"
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-xs tabular-nums text-ink-400">
                                  {pct}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Teachers section */}
      <section className="p-5 card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold font-display text-ink">
            نشاط المعلمين
          </h2>
          <span className="text-xs text-ink-400">
            {teachers.total} معلم · {teachers.active} نشط ·{" "}
            {teachers.inactive} خامل
          </span>
        </div>

        {teachers.total === 0 ? (
          <p className="py-8 text-sm text-center text-ink-400">
            لا يوجد معلمون في المؤسسة بعد.
          </p>
        ) : (
          <div className="overflow-x-auto border rounded-lg border-line">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-start text-ink-700">
                <tr>
                  <th className="px-3 py-2 font-medium text-start">المعلم</th>
                  <th className="px-3 py-2 font-medium text-center">امتحانات</th>
                  <th className="px-3 py-2 font-medium text-center">محتوى</th>
                  <th className="px-3 py-2 font-medium text-center">حصص</th>
                  <th className="px-3 py-2 font-medium text-center">
                    بانتظار التصحيح
                  </th>
                  <th className="px-3 py-2 font-medium text-center">النشاط</th>
                </tr>
              </thead>
              <tbody>
                {teachers.by_teacher.map((t) => (
                  <TeacherRow key={t.teacher_id} teacher={t} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  hint,
  accent = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "default" | "success" | "warning" | "danger";
}) {
  const color = {
    default: "text-ink",
    success: "text-success",
    warning: "text-accent-dark",
    danger: "text-danger",
  }[accent];
  return (
    <div className="p-5 card">
      <p className="text-xs text-ink-400">{label}</p>
      <p className={`mt-2 font-display text-2xl font-bold ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

function TeacherRow({ teacher }: { teacher: TeacherActivityRow }) {
  const meta = ACTIVITY_META[teacher.activity];
  return (
    <tr className="border-b border-line last:border-0 hover:bg-ink-50/30">
      <td className="px-3 py-2">
        <p className="font-medium text-ink">{teacher.name}</p>
        <p className="mt-0.5 text-xs text-ink-400">{teacher.email}</p>
      </td>
      <td className="px-3 py-2 text-center text-ink-700">
        {teacher.assessments_created}
      </td>
      <td className="px-3 py-2 text-center text-ink-700">
        {teacher.content_uploaded}
      </td>
      <td className="px-3 py-2 text-center text-ink-700">
        {teacher.sessions_taught}
      </td>
      <td className="px-3 py-2 text-center">
        {teacher.grading_pending > 0 ? (
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent-dark">
            {teacher.grading_pending}
          </span>
        ) : (
          <span className="text-xs text-ink-300">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}
        >
          <span className={`h-1 w-1 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
      </td>
    </tr>
  );
}