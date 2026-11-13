"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorState, Spinner } from "@/components/ui/States";
import {
  getPlatformTenant,
  platformStatusLabel,
  platformStatusStyle,
  resetOwnerPassword,
  updateTenantStatus,
} from "@/lib/api/platformAdmin";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type { PlatformTenantStatus } from "@/types";

const STATUS_OPTIONS: PlatformTenantStatus[] = [
  "PENDING",
  "TRIAL",
  "ACTIVE",
  "SUSPENDED",
  "CHURNED",
];

export default function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [newStatus, setNewStatus] = useState<PlatformTenantStatus | "">("");
  const [internalNotes, setInternalNotes] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");

  const { data: tenant, isLoading, isError } = useQuery({
    queryKey: ["platform-tenant", id],
    queryFn: () => getPlatformTenant(id),
  });

  const statusMutation = useMutation({
    mutationFn: (s: PlatformTenantStatus) =>
      updateTenantStatus(id, s, internalNotes || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-tenant", id] });
      queryClient.invalidateQueries({ queryKey: ["platform-tenants"] });
      queryClient.invalidateQueries({ queryKey: ["platform-metrics"] });
      toastSuccess("تم تحديث الحالة");
      setNewStatus("");
    },
    onError: (err) => toastError(err, "تعذّر تحديث الحالة."),
  });

  const passwordMutation = useMutation({
    mutationFn: () => resetOwnerPassword(id, newPassword),
    onSuccess: () => {
      toastSuccess("تمت إعادة تعيين كلمة المرور");
      setNewPassword("");
    },
    onError: (err) => toastError(err, "تعذّرت إعادة التعيين."),
  });

  if (isLoading) return <Spinner />;
  if (isError || !tenant) return <ErrorState message="تعذّر تحميل المؤسسة." />;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            href="/platform/tenants"
            className="text-sm text-ink-400 hover:text-ink"
          >
            ← المؤسسات
          </Link>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink">
            {tenant.name}
          </h1>
          <div className="mt-2 flex items-center gap-3 text-xs text-ink-400">
            <span className="font-mono">{tenant.slug}</span>
            <span
              className={`rounded-full px-2 py-0.5 font-medium ${platformStatusStyle(tenant.status)}`}
            >
              {platformStatusLabel(tenant.status)}
            </span>
          </div>
        </div>
      </div>

      {/* Info card */}
      <div className="card p-5">
        <h2 className="mb-3 font-display text-base font-bold text-ink">
          معلومات المؤسسة
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-ink-400">تاريخ الإنشاء</dt>
            <dd className="mt-0.5 text-sm text-ink">
              {new Date(tenant.created_at).toLocaleDateString("ar-EG")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400">عدد المستخدمين</dt>
            <dd className="mt-0.5 text-sm text-ink">{tenant.users.length}</dd>
          </div>
          {tenant.trial_ends_at && (
            <div>
              <dt className="text-xs text-ink-400">انتهاء الفترة التجريبية</dt>
              <dd className="mt-0.5 text-sm text-ink">
                {new Date(tenant.trial_ends_at).toLocaleDateString("ar-EG")}
              </dd>
            </div>
          )}
          {tenant.contact_email && (
            <div>
              <dt className="text-xs text-ink-400">بريد التواصل</dt>
              <dd className="mt-0.5 text-sm text-ink">{tenant.contact_email}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Status management */}
      <div className="card p-5">
        <h2 className="mb-3 font-display text-base font-bold text-ink">
          إدارة الحالة
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-ink-400">الحالة الجديدة</label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as PlatformTenantStatus)}
              className="min-w-[150px] rounded-lg border border-line bg-white px-3 py-2 text-sm"
            >
              <option value="">اختر...</option>
              {STATUS_OPTIONS.filter((s) => s !== tenant.status).map((s) => (
                <option key={s} value={s}>
                  {platformStatusLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="secondary"
            disabled={!newStatus || statusMutation.isPending}
            onClick={() => newStatus && statusMutation.mutate(newStatus)}
          >
            {statusMutation.isPending ? "..." : "تحديث الحالة"}
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-1.5">
          <label className="text-xs text-ink-400">ملاحظات داخلية</label>
          <textarea
            rows={3}
            defaultValue={tenant.internal_notes}
            onChange={(e) => setInternalNotes(e.target.value)}
            placeholder="ملاحظات للمراجعة الداخلية"
            className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
      </div>

      {/* Owner password reset */}
      <div className="card p-5">
        <h2 className="mb-3 font-display text-base font-bold text-ink">
          إعادة تعيين كلمة مرور المالك
        </h2>
        <p className="mb-3 text-xs text-ink-400">
          استخدم هذا فقط عند طلب المالك الدعم — لن يتم إبلاغه تلقائيًا.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <label className="text-xs text-ink-400">كلمة المرور الجديدة</label>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="10 أحرف على الأقل"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ink"
            />
          </div>
          <Button
            variant="secondary"
            disabled={newPassword.length < 10 || passwordMutation.isPending}
            onClick={() => passwordMutation.mutate()}
          >
            {passwordMutation.isPending ? "..." : "إعادة تعيين"}
          </Button>
        </div>
      </div>

      {/* Users list */}
      <div className="card p-5">
        <h2 className="mb-3 font-display text-base font-bold text-ink">
          المستخدمون ({tenant.users.length})
        </h2>
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-ink-50 text-start text-ink-700">
            <tr>
              <th className="px-3 py-2 text-start font-medium">البريد</th>
              <th className="px-3 py-2 text-start font-medium">الدور</th>
              <th className="px-3 py-2 text-start font-medium">الاسم</th>
              <th className="px-3 py-2 text-start font-medium">نشط</th>
            </tr>
          </thead>
          <tbody>
            {tenant.users.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2 text-ink">{u.email}</td>
                <td className="px-3 py-2 text-ink-400">{u.role}</td>
                <td className="px-3 py-2 text-ink-400">
                  {[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="px-3 py-2">
                  {u.is_active ? (
                    <span className="text-success">✓</span>
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}