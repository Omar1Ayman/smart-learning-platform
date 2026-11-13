"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import { listPlatformAuditLogs } from "@/lib/api/platformAdmin";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

export default function PlatformAuditPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);

  const auditQuery = useQuery({
    queryKey: ["platform-audit", page, debouncedSearch],
    queryFn: () =>
      listPlatformAuditLogs({
        page,
        search: debouncedSearch || undefined,
      }),
    placeholderData: (previous) => previous,
  });

  const logs = auditQuery.data?.results ?? [];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">
          سجل إدارة المنصة
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          يعرض إجراءات مسؤولي المنصة فقط، ولا يعرض السجلات التعليمية داخل
          المؤسسات.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-400">
          {auditQuery.data?.count ?? 0} حدث
          {auditQuery.isPlaceholderData ? " · يتم التحديث..." : ""}
        </p>
        <input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="ابحث بالإجراء أو المستخدم أو المؤسسة..."
          aria-label="البحث في سجل المنصة"
          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm sm:w-96"
        />
      </div>

      {auditQuery.isLoading && <Spinner />}
      {auditQuery.isError && (
        <ErrorState message="تعذّر تحميل سجل إدارة المنصة." />
      )}
      {!auditQuery.isLoading && !auditQuery.isError && logs.length === 0 && (
        <EmptyState
          title="لا توجد أحداث"
          description="ستظهر هنا إجراءات إدارة المنصة المسجلة."
        />
      )}

      {!auditQuery.isLoading && !auditQuery.isError && logs.length > 0 && (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead className="border-b border-line bg-ink-50 text-ink-700">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">الإجراء</th>
                  <th className="px-4 py-3 text-start font-medium">المسؤول</th>
                  <th className="px-4 py-3 text-start font-medium">المؤسسة</th>
                  <th className="px-4 py-3 text-start font-medium">العنصر</th>
                  <th className="px-4 py-3 text-start font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{log.action_label}</p>
                      <p className="font-mono text-[11px] text-ink-400">
                        {log.action}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      {log.actor_email ?? "النظام"}
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      {log.tenant_name ?? "إدارة المنصة"}
                    </td>
                    <td className="px-4 py-3 text-ink-400">
                      {log.object_type || "—"}
                    </td>
                    <td className="px-4 py-3 text-ink-400">
                      {new Date(log.created_at).toLocaleString("ar-EG")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-ink-400">
            <span>{auditQuery.data?.count ?? 0} حدث</span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                disabled={!auditQuery.data?.previous || auditQuery.isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                السابق
              </Button>
              <Button
                variant="ghost"
                disabled={!auditQuery.data?.next || auditQuery.isFetching}
                onClick={() => setPage((current) => current + 1)}
              >
                التالي
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
