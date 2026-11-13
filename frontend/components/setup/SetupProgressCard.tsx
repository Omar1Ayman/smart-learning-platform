"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { useSetupStatus } from "@/lib/hooks/useSetupStatus";

export function SetupProgressCard() {
  const { data, isLoading, isError, refetch } = useSetupStatus();

  if (isLoading) return null;
  if (isError || !data) {
    return (
      <div
        role="alert"
        className="card flex flex-wrap items-center justify-between gap-3 border-danger/30 p-4"
      >
        <p className="text-sm text-ink-700">
          تعذّر تحميل تقدم إعداد المؤسسة.
        </p>
        <div className="flex items-center gap-2">
          <Link href="/setup">
            <Button variant="ghost" className="text-sm">
              فتح صفحة الإعداد
            </Button>
          </Link>
          <Button
            variant="secondary"
            className="text-sm"
            onClick={() => {
              void refetch();
            }}
          >
            إعادة المحاولة
          </Button>
        </div>
      </div>
    );
  }
  if (data.complete) return null;

  const requiredSteps = data.steps.filter((s) => s.importance === "required");
  const doneCount = requiredSteps.filter((s) => s.done).length;
  const totalCount = requiredSteps.length;
  const pct = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;
  const next = data.next_action;

  return (
    <div className="card overflow-hidden border-accent/30 bg-gradient-to-l from-accent/5 to-transparent p-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-bold text-ink">
              🚀 لنُجهّز مؤسستك
            </h2>
            <p className="mt-1 text-sm text-ink-400">
              أكملت {doneCount} من {totalCount} خطوة أساسية
            </p>
          </div>
          <Link href="/setup">
            <Button variant="secondary" className="shrink-0 text-sm">
              عرض الكل
            </Button>
          </Link>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        {next && (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-white/70 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-400">الخطوة التالية</p>
              <p className="mt-0.5 text-sm font-medium text-ink">{next.label}</p>
            </div>
            {next.action_url && (
              <Link href={next.action_url}>
                <Button className="shrink-0 text-sm">ابدأ →</Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}