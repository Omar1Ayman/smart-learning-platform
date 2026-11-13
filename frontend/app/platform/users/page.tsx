"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import {
  listPlatformUsers,
  updatePlatformUserStatus,
  type PlatformUser,
} from "@/lib/api/platformAdmin";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { toastError, toastSuccess } from "@/lib/utils/toast";

const ROLE_LABELS: Record<PlatformUser["role"], string> = {
  OWNER: "مالك المؤسسة",
  ADMIN: "مسؤول",
  TEACHER: "معلم",
  STUDENT: "طالب",
  PARENT: "ولي أمر",
};

type ActiveFilter = "ALL" | "ACTIVE" | "INACTIVE";

export default function PlatformUsersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("ALL");
  const debouncedSearch = useDebouncedValue(search, 250);

  const usersQuery = useQuery({
    queryKey: ["platform-users", page, debouncedSearch, activeFilter],
    queryFn: () =>
      listPlatformUsers({
        page,
        search: debouncedSearch || undefined,
        is_active:
          activeFilter === "ALL" ? undefined : activeFilter === "ACTIVE",
      }),
    placeholderData: (previous) => previous,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updatePlatformUserStatus(id, isActive),
    onSuccess: (_user, variables) => {
      queryClient.invalidateQueries({ queryKey: ["platform-users"] });
      queryClient.invalidateQueries({ queryKey: ["platform-tenants"] });
      toastSuccess(
        variables.isActive ? "تم تفعيل الحساب" : "تم إيقاف الحساب",
      );
    },
    onError: (error) => toastError(error, "تعذّر تحديث حالة الحساب."),
  });

  const users = usersQuery.data?.results ?? [];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">
          مستخدمو المؤسسات
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          عرض حسابات المؤسسات وإيقافها أو تفعيلها. لا تشمل هذه الصفحة بياناتهم
          التعليمية أو كلمات المرور.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["ALL", "الكل"],
            ["ACTIVE", "نشط"],
            ["INACTIVE", "موقوف"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={activeFilter === key}
            onClick={() => {
              setActiveFilter(key);
              setPage(1);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeFilter === key
                ? "bg-ink text-white dark:bg-accent dark:text-[#111827]"
                : "bg-ink-50 text-ink-700 hover:bg-ink-100"
            }`}
          >
            {label}
          </button>
        ))}
        <input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="ابحث بالبريد أو الاسم أو المؤسسة..."
          aria-label="البحث في المستخدمين"
          className="ms-auto w-full rounded-lg border border-line bg-white px-3 py-2 text-sm sm:w-80"
        />
      </div>

      <p className="text-xs text-ink-400">
        {usersQuery.data?.count ?? 0} حساب
        {usersQuery.isPlaceholderData ? " · يتم التحديث..." : ""}
      </p>

      {usersQuery.isLoading && <Spinner />}
      {usersQuery.isError && <ErrorState message="تعذّر تحميل المستخدمين." />}
      {!usersQuery.isLoading && !usersQuery.isError && users.length === 0 && (
        <EmptyState
          title="لا توجد حسابات"
          description="جرّب تغيير البحث أو مرشح الحالة."
        />
      )}

      {!usersQuery.isLoading && !usersQuery.isError && users.length > 0 && (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[850px] text-sm">
              <thead className="border-b border-line bg-ink-50 text-ink-700">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">المستخدم</th>
                  <th className="px-4 py-3 text-start font-medium">المؤسسة</th>
                  <th className="px-4 py-3 text-start font-medium">الدور</th>
                  <th className="px-4 py-3 text-start font-medium">الحالة</th>
                  <th className="px-4 py-3 text-start font-medium">
                    تاريخ الإنشاء
                  </th>
                  <th className="px-4 py-3 text-end font-medium">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">
                        {[user.first_name, user.last_name]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </p>
                      <p className="text-xs text-ink-400">{user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{user.tenant_name}</p>
                      <p className="font-mono text-xs text-ink-400">
                        {user.tenant_slug}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      {ROLE_LABELS[user.role]}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          user.is_active
                            ? "bg-success/10 text-success"
                            : "bg-danger/10 text-danger"
                        }`}
                      >
                        {user.is_active ? "نشط" : "موقوف"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-400">
                      {new Date(user.date_joined).toLocaleDateString("ar-EG")}
                    </td>
                    <td className="px-4 py-3 text-end">
                      {user.role === "OWNER" ? (
                        <span className="text-xs text-ink-400">
                          حالة المالك تُدار من المؤسسة
                        </span>
                      ) : (
                        <Button
                          variant={user.is_active ? "danger" : "secondary"}
                          size="sm"
                          disabled={statusMutation.isPending}
                          onClick={() => {
                            const nextStatus = !user.is_active;
                            const confirmed = window.confirm(
                              nextStatus
                                ? `تفعيل حساب ${user.email}؟`
                                : `إيقاف حساب ${user.email} ومنعه من تسجيل الدخول؟`,
                            );
                            if (confirmed) {
                              statusMutation.mutate({
                                id: user.id,
                                isActive: nextStatus,
                              });
                            }
                          }}
                        >
                          {user.is_active ? "إيقاف" : "تفعيل"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-ink-400">
            <span>{usersQuery.data?.count ?? 0} حساب</span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                disabled={!usersQuery.data?.previous || usersQuery.isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                السابق
              </Button>
              <Button
                variant="ghost"
                disabled={!usersQuery.data?.next || usersQuery.isFetching}
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
