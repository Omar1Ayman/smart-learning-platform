"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import {
  listPlatformTenants,
  platformStatusLabel,
  platformStatusStyle,
} from "@/lib/api/platformAdmin";
import type { PlatformTenantStatus } from "@/types";

const FILTERS: { key: "ALL" | PlatformTenantStatus; label: string }[] = [
  { key: "ALL", label: "الكل" },
  { key: "TRIAL", label: "تجريبي" },
  { key: "ACTIVE", label: "نشط" },
  { key: "SUSPENDED", label: "معلّق" },
  { key: "CHURNED", label: "منتهي" },
];

export default function PlatformTenantsPage() {
  const [filter, setFilter] = useState<"ALL" | PlatformTenantStatus>("ALL");
  const [search, setSearch] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["platform-tenants", filter, search],
    queryFn: () =>
      listPlatformTenants({
        status: filter === "ALL" ? undefined : filter,
        search: search || undefined,
      }),
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">المؤسسات</h1>
          <p className="mt-1 text-sm text-ink-400">
            {data?.count ?? 0} مؤسسة مسجّلة
          </p>
        </div>
        <Link href="/platform/tenants/new">
          <Button>+ إنشاء مؤسسة</Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
        <input
          type="search"
          placeholder="بحث بالاسم..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto rounded-lg border border-line px-3 py-1.5 text-sm outline-none focus:border-ink"
        />
      </div>

      {isLoading && <Spinner />}
      {isError && <ErrorState message="تعذّر تحميل المؤسسات." />}
      {!isLoading && !isError && data?.results.length === 0 && (
        <EmptyState
          title="لا توجد مؤسسات"
          description="ابدأ بإنشاء أول مؤسسة أو انتظر طلبات العرض."
        />
      )}

      {!isLoading && !isError && data && data.results.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-ink-50 text-start text-ink-700">
              <tr>
                <th className="px-4 py-3 text-start font-medium">الاسم</th>
                <th className="px-4 py-3 text-start font-medium">المالك</th>
                <th className="px-4 py-3 text-start font-medium">المستخدمون</th>
                <th className="px-4 py-3 text-start font-medium">الحالة</th>
                <th className="px-4 py-3 text-start font-medium">تاريخ الإنشاء</th>
                <th className="px-4 py-3 text-start font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((t) => (
                <tr key={t.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{t.name}</td>
                  <td className="px-4 py-3 text-ink-400">{t.owner_email ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-400">{t.user_count}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${platformStatusStyle(t.status)}`}
                    >
                      {platformStatusLabel(t.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-400">
                    {new Date(t.created_at).toLocaleDateString("ar-EG")}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <Link href={`/platform/tenants/${t.id}`}>
                      <Button variant="ghost" className="text-xs">
                        إدارة
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}