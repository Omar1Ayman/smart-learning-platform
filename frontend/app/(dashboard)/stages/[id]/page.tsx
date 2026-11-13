"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";

import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import { getStageDetail } from "@/lib/api/stages";

export default function StageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["stage-detail", id],
    queryFn: () => getStageDetail(id),
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message="تعذّر تحميل بيانات المرحلة." />;

  return (
    <div className="flex flex-col max-w-5xl gap-6 mx-auto">
      <div>
        <Link href="/stages" className="text-sm text-ink-400 hover:text-ink">
          ← المراحل
        </Link>
        <h1 className="mt-1 text-2xl font-bold font-display text-ink">{data.stage.name}</h1>
        <p className="mt-1 text-sm text-ink-400">
          {data.summary.grades_count} صف · {data.summary.total_students} طالب
        </p>
      </div>

      {data.grades.length === 0 ? (
        <EmptyState
          title="لا توجد صفوف"
          description="أضف صفًا لهذه المرحلة لتبدأ."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.grades.map((g) => (
            <Link
              key={g.id}
              href={`/grades/${g.id}`}
              className="p-5 transition-colors card hover:border-ink/30 hover:bg-ink-50/30"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-bold font-display text-ink">{g.name}</h2>
                <span className="text-xs text-ink-400">#{g.order}</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-3 text-xs text-ink-400">
                <span className="rounded-full bg-ink-50 px-2 py-0.5">{g.courses_count} مادة</span>
                <span className="rounded-full bg-ink-50 px-2 py-0.5">{g.groups_count} مجموعة</span>
                <span className="rounded-full bg-ink-50 px-2 py-0.5">{g.students_count} طالب</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}