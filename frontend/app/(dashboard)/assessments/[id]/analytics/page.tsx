"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/Button";
import { ErrorState, Spinner } from "@/components/ui/States";
import { getAssessmentAnalytics } from "@/lib/api/assessments";
import type { QuestionAnalytics } from "@/types";

export default function AssessmentAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["assessment-analytics", id],
    queryFn: () => getAssessmentAnalytics(id),
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message="تعذّر تحميل التحليلات." />;

  const s = data.summary;

  return (
    <div className="flex flex-col max-w-5xl gap-6 mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/assessments/${id}/results`}
            className="text-sm text-ink-400 hover:text-ink"
          >
            ← النتائج
          </Link>
          <h1 className="mt-1 text-2xl font-bold font-display text-ink">
            تحليلات: {data.assessment.title}
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            {s.total_attempts} محاولة مكتملة
            {s.targeted_students > 0 &&
              ` · ${s.targeted_students} طالب مستهدف`}
          </p>
        </div>
      </div>

      {!data.has_data ? (
        <div className="p-10 text-center card">
          <p className="text-4xl">📊</p>
          <h2 className="mt-3 text-lg font-bold font-display text-ink">
            لا توجد بيانات كافية بعد
          </h2>
          <p className="mt-2 text-sm text-ink-400">
            التحليلات تظهر عندما يُكمل الطلاب الامتحان. سلّم واحد على الأقل
            مطلوب لبدء الرؤية.
          </p>
          <Link href={`/assessments/${id}/edit`} className="inline-block mt-4">
            <Button variant="secondary">← عودة للامتحان</Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard
              label="نسبة النجاح"
              value={s.pass_rate !== null ? `${s.pass_rate}%` : "—"}
              hint={`${s.passed} ناجح · ${s.failed} راسب`}
              accent={
                s.pass_rate === null
                  ? "default"
                  : s.pass_rate >= 70
                  ? "success"
                  : s.pass_rate >= 40
                  ? "warning"
                  : "danger"
              }
            />
            <MetricCard
              label="متوسط الدرجات"
              value={
                s.avg_percentage !== null ? `${s.avg_percentage}%` : "—"
              }
              hint={
                s.highest_score && s.lowest_score
                  ? `أعلى: ${s.highest_score} · أدنى: ${s.lowest_score}`
                  : undefined
              }
            />
            <MetricCard
              label="بانتظار التصحيح"
              value={s.pending_attempts}
              hint={
                s.pending_attempts > 0
                  ? "تحتاج مراجعة يدوية للمقالات"
                  : "كل المحاولات مصححة"
              }
              accent={s.pending_attempts > 0 ? "warning" : "default"}
            />
            <MetricCard
              label="محاولات مكتملة"
              value={s.total_attempts}
              hint={`من ${s.targeted_students} طالب مستهدف`}
            />
          </div>

          {/* Distribution histogram */}
          <div className="p-5 card">
            <h2 className="mb-4 text-base font-bold font-display text-ink">
              توزيع الدرجات
            </h2>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart
                  data={data.distribution}
                  margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis
                    dataKey="bucket"
                    tick={{ fontSize: 10, fill: "#6B7280" }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      direction: "rtl",
                      fontFamily: "inherit",
                      fontSize: 12,
                      borderRadius: 8,
                    }}
                    formatter={(value) => [`${value ?? 0} طالب`, "العدد"]}
                    labelFormatter={(label: unknown) => `الفئة: ${String(label)}%`}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {data.distribution.map((entry, idx) => {
                      // Color-code: red <40%, amber 40-69%, green 70%+
                      const low = idx < 4;
                      const mid = idx >= 4 && idx < 7;
                      const fill = low ? "#EF4444" : mid ? "#F59E0B" : "#10B981";
                      return <Cell key={idx} fill={fill} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-center text-ink-400">
              🔴 ضعيف (0-40%) · 🟡 متوسط (40-70%) · 🟢 جيد (70-100%)
            </p>
          </div>

          {/* Hardest / Easiest — side by side */}
          <div className="grid gap-4 lg:grid-cols-2">
            <QuestionRankList
              title="أصعب 5 أسئلة"
              icon="🔴"
              questions={data.hardest_questions}
              variant="hard"
            />
            <QuestionRankList
              title="أسهل 5 أسئلة"
              icon="🟢"
              questions={data.easiest_questions}
              variant="easy"
            />
          </div>

          {/* Full questions table */}
          <div className="overflow-x-auto card">
            <div className="px-4 py-3 border-b border-line bg-ink-50">
              <h2 className="text-base font-bold font-display text-ink">
                كل الأسئلة ({data.all_questions.length})
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-line text-ink-700">
                <tr>
                  <th className="w-10 px-3 py-2 font-medium text-start">#</th>
                  <th className="px-3 py-2 font-medium text-start">السؤال</th>
                  <th className="px-3 py-2 font-medium text-start">النقاط</th>
                  <th className="px-3 py-2 font-medium text-start">صح</th>
                  <th className="px-3 py-2 font-medium text-start">خطأ</th>
                  <th className="px-3 py-2 font-medium text-start">
                    بانتظار
                  </th>
                  <th className="px-3 py-2 font-medium text-start">
                    نسبة الصح
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.all_questions.map((q) => (
                  <tr key={q.question_id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-ink-400">{q.order}</td>
                    <td className="max-w-md px-3 py-2 text-ink">
                      <p className="line-clamp-1">{q.question_text}</p>
                      <p className="mt-0.5 text-xs text-ink-400">
                        {q.question_type}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-ink-700">{q.points}</td>
                    <td className="px-3 py-2 text-success">{q.correct_count}</td>
                    <td className="px-3 py-2 text-danger">{q.wrong_count}</td>
                    <td className="px-3 py-2 text-ink-400">
                      {q.pending_count}
                    </td>
                    <td className="px-3 py-2">
                      <CorrectPctBar pct={q.correct_percentage} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
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

function CorrectPctBar({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-xs text-ink-400">—</span>;
  }
  const color =
    pct >= 70 ? "bg-success" : pct >= 40 ? "bg-accent" : "bg-danger";
  const text =
    pct >= 70 ? "text-success" : pct >= 40 ? "text-accent-dark" : "text-danger";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-100">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className={`text-xs font-medium tabular-nums ${text}`}>
        {pct}%
      </span>
    </div>
  );
}

function QuestionRankList({
  title,
  icon,
  questions,
  variant,
}: {
  title: string;
  icon: string;
  questions: QuestionAnalytics[];
  variant: "hard" | "easy";
}) {
  const borderCls =
    variant === "hard" ? "border-danger/20" : "border-success/20";
  

  return (
    <div className={`card border ${borderCls} p-5`}>
      <h2 className="flex items-center gap-2 mb-3 text-base font-bold font-display text-ink">
        <span>{icon}</span>
        {title}
      </h2>
      {questions.length === 0 ? (
        <p className="text-sm text-ink-400">لا توجد بيانات كافية بعد.</p>
      ) : (
        <ul className="divide-y divide-line">
          {questions.map((q, idx) => (
            <li key={q.question_id} className="flex items-start gap-3 py-3">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  variant === "hard"
                    ? "bg-danger/15 text-danger"
                    : "bg-success/15 text-success"
                }`}
              >
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm line-clamp-2 text-ink">{q.question_text}</p>
                <p className="mt-1 text-xs text-ink-400">
                  {q.correct_percentage !== null
                    ? `${q.correct_percentage}% صح`
                    : "—"}{" "}
                  · {q.correct_count}/{q.graded_count} إجابة
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}