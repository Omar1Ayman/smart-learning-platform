"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import {
  demoStatusLabel,
  listDemoRequests,
  updateDemoRequestStatus,
} from "@/lib/api/platformAdmin";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type { DemoRequestStatus } from "@/types";

const FILTERS: { key: "ALL" | DemoRequestStatus; label: string }[] = [
  { key: "NEW", label: "جديدة" },
  { key: "CONTACTED", label: "تم التواصل" },
  { key: "CONVERTED", label: "تم التحويل" },
  { key: "DECLINED", label: "مرفوضة" },
  { key: "ALL", label: "الكل" },
];

export default function DemoRequestsPage() {
  const [filter, setFilter] = useState<"ALL" | DemoRequestStatus>("NEW");
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["platform-demo-requests", filter],
    queryFn: () => listDemoRequests({ status: filter === "ALL" ? undefined : filter }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: DemoRequestStatus }) =>
      updateDemoRequestStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-demo-requests"] });
      queryClient.invalidateQueries({ queryKey: ["platform-metrics"] });
      toastSuccess("تم تحديث حالة الطلب");
    },
    onError: (err) => toastError(err, "تعذّر تحديث الطلب."),
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">طلبات العرض</h1>
        <p className="mt-1 text-sm text-ink-400">
          الطلبات الواردة من صفحة /request-demo
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key
                ? "bg-ink text-white dark:bg-accent dark:text-[#111827]"
                : "bg-ink-50 text-ink-700 hover:bg-ink-100"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading && <Spinner />}
      {isError && <ErrorState message="تعذّر تحميل الطلبات." />}
      {!isLoading && !isError && data?.results.length === 0 && (
        <EmptyState title="لا توجد طلبات" description="لا توجد طلبات في هذه الحالة." />
      )}

      {!isLoading && !isError && data && data.results.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.results.map((d) => (
            <div key={d.id} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-bold text-ink">
                    {d.school_name}
                  </p>
                  <p className="mt-1 text-xs text-ink-400">
                    {d.contact_name} · {d.email} · {d.phone}
                    {d.num_students && ` · ${d.num_students} طالب`}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700">
                  {demoStatusLabel(d.status)}
                </span>
              </div>

              {d.message && (
                <p className="mt-3 rounded-lg bg-ink-50/50 p-3 text-sm text-ink-700">
                  {d.message}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {d.status === "NEW" && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        statusMutation.mutate({ id: d.id, status: "CONTACTED" })
                      }
                    >
                      تم التواصل
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        statusMutation.mutate({ id: d.id, status: "DECLINED" })
                      }
                    >
                      رفض
                    </Button>
                  </>
                )}
                {d.status === "CONTACTED" && (
                  <Link href="/platform/tenants/new">
                    <Button>تحويل إلى مؤسسة</Button>
                  </Link>
                )}
                <a
                  href={`mailto:${d.email}`}
                  className="inline-flex items-center rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-ink-50"
                >
                  مراسلة
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}