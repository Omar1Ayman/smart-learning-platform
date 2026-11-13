"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import { listSessions, revokeAllSessions, revokeSession } from "@/lib/api/sessions";
import { useAuthStore } from "@/lib/auth/store";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type { UserSession } from "@/types";

function deviceIcon(session: UserSession): string {
  const ua = session.user_agent.toLowerCase();
  if (/iphone|android|ipod|mobile/.test(ua) && !/ipad/.test(ua)) return "📱";
  if (/ipad|tablet/.test(ua)) return "📟";
  return "💻";
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  const d = Math.floor(h / 24);
  if (d < 30) return `منذ ${d} يوم`;
  return new Date(iso).toLocaleDateString("ar-EG");
}

export default function SessionsPage() {
  const queryClient = useQueryClient();
  const currentSessionId = useAuthStore((s) => s.sessionId);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["auth", "sessions"],
    queryFn: () => listSessions(currentSessionId ?? undefined),
  });

  const revokeMutation = useMutation({
    mutationFn: revokeSession,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });
      toastSuccess("تم إنهاء الجلسة");
      setRevokingId(null);
      if (id === currentSessionId) { clearAuth(); window.location.href = "/login"; }
    },
    onError: (err) => { toastError(err, "تعذّر إنهاء الجلسة."); setRevokingId(null); },
  });

  const revokeAllMutation = useMutation({
    mutationFn: () => revokeAllSessions(),
    onSuccess: (res) => { queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] }); toastSuccess(res.detail); setConfirmRevokeAll(false); },
    onError: (err) => { toastError(err, "تعذّر إنهاء الجلسات."); setConfirmRevokeAll(false); },
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message="تعذّر تحميل الجلسات." />;

  const active = data.sessions.filter((s) => s.status === "active");
  const revoked = data.sessions.filter((s) => s.status === "revoked");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-ink">الجلسات النشطة</h1>
          <p className="mt-1 text-sm text-ink-400">الأجهزة التي تستخدم حسابك حاليًا. إن لم تتعرف على جهاز، أنهِ جلسته فورًا.</p>
        </div>
        {active.length > 1 && (
          <Button variant="danger" onClick={() => setConfirmRevokeAll(true)}>إنهاء كل الجلسات الأخرى</Button>
        )}
      </div>

      {active.length === 0 ? (
        <EmptyState title="لا توجد جلسات نشطة" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((s) => (
            <div key={s.id} className={`card p-5 ${s.is_current ? "ring-2 ring-success/30" : ""}`}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <span className="text-3xl">{deviceIcon(s)}</span>
                {s.is_current && <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">هذا الجهاز</span>}
              </div>
              <p className="font-bold text-ink">{s.device_label}</p>
              <p className="mt-1 text-xs text-ink-400">{s.ip_address ?? "IP غير معروف"}</p>
              <p className="mt-1 text-xs text-ink-400">آخر نشاط: {relativeTime(s.last_seen_at)}</p>
              <Button
                variant="secondary"
                onClick={() => { setRevokingId(s.id); revokeMutation.mutate(s.id); }}
                disabled={revokingId === s.id}
                className="mt-4 w-full text-xs"
              >
                {revokingId === s.id ? "..." : "إنهاء الجلسة"}
              </Button>
            </div>
          ))}
        </div>
      )}

      {revoked.length > 0 && (
        <details className="card p-5 mt-2">
          <summary className="cursor-pointer text-sm font-medium text-ink-700">الجلسات المنتهية ({revoked.length})</summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {revoked.slice(0, 10).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 text-sm border border-line p-2 rounded-lg opacity-60">
                <div className="flex items-center gap-2"><span>{deviceIcon(s)}</span><span className="text-ink-400">{s.device_label}</span></div>
                <span className="text-xs text-ink-400">انتهت — {relativeTime(s.revoked_at!)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <ConfirmDialog
        open={confirmRevokeAll}
        title="إنهاء كل الجلسات الأخرى"
        description="سيتم تسجيل الخروج من جميع الأجهزة الأخرى. ستبقى جلسة هذا الجهاز نشطة."
        confirmLabel="إنهاء"
        variant="danger"
        onConfirm={() => revokeAllMutation.mutate()}
        onCancel={() => setConfirmRevokeAll(false)}
        isPending={revokeAllMutation.isPending}
      />
    </div>
  );
}