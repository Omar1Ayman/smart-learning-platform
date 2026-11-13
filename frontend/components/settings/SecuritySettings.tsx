"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuthStore } from "@/lib/auth/store";
import { disableTwoFactor, enableTwoFactor, setupTwoFactor } from "@/lib/api/twoFactor";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type { TwoFactorSetupResponse } from "@/types";
import { changePassword } from "@/lib/api/sessions";

export function SecuritySettings({
  headingLevel = "h2",
}: {
  headingLevel?: "h1" | "h2";
}) {
  const Heading = headingLevel;
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<TwoFactorSetupResponse | null>(null);
  const [enableCode, setEnableCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [showCodes, setShowCodes] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const passwordMutation = useMutation({
    mutationFn: async () => changePassword({ current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword }),
    onSuccess: (res) => {
      toastSuccess(res.other_sessions_revoked > 0 ? `تم تحديث كلمة المرور. ${res.other_sessions_revoked} جلسة أخرى تم إنهاؤها.` : "تم تحديث كلمة المرور.");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    },
    onError: (err) => toastError(err, "تعذّر تحديث كلمة المرور."),
  });

  const setupMutation = useMutation({
    mutationFn: setupTwoFactor,
    onSuccess: (data) => { setSetup(data); setShowCodes(true); },
    onError: (err) => toastError(err, "تعذّر بدء الإعداد."),
  });

  const enableMutation = useMutation({
    mutationFn: () => enableTwoFactor(enableCode),
    onSuccess: async () => {
      toastSuccess("تم تفعيل المصادقة الثنائية");
      setSetup(null); setEnableCode("");
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      const me = useAuthStore.getState().user;
      if (me) useAuthStore.getState().setUser({ ...me, two_factor_enabled: true });
    },
    onError: (err) => toastError(err, "رمز غير صحيح."),
  });

  const disableMutation = useMutation({
    mutationFn: () => disableTwoFactor(disablePassword, disableCode),
    onSuccess: () => {
      toastSuccess("تم إلغاء المصادقة الثنائية");
      setDisablePassword(""); setDisableCode("");
      const me = useAuthStore.getState().user;
      if (me) useAuthStore.getState().setUser({ ...me, two_factor_enabled: false });
    },
    onError: (err) => toastError(err, "تعذّر إلغاء التفعيل."),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Heading className="text-2xl font-bold font-display text-ink">الأمان</Heading>
        <p className="mt-1 text-sm text-ink-400">حماية إضافية لحسابك عبر المصادقة الثنائية وتغيير كلمة المرور.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold font-display text-ink flex items-center gap-2">🔐 المصادقة الثنائية (2FA)</h3>
                <p className="mt-1 text-sm text-ink-400 leading-relaxed">طبقة أمان إضافية تتطلب رمزًا من تطبيق على هاتفك بعد كلمة المرور.</p>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${user?.two_factor_enabled ? "bg-success/10 text-success" : "bg-ink-50 text-ink-400"}`}>
                {user?.two_factor_enabled ? "مُفعّلة" : "غير مُفعّلة"}
              </span>
            </div>

            {!user?.two_factor_enabled && !setup && (
              <Button onClick={() => setupMutation.mutate()} disabled={setupMutation.isPending} className="w-full">
                {setupMutation.isPending ? "..." : "بدء تفعيل المصادقة الثنائية"}
              </Button>
            )}

            {setup && !user?.two_factor_enabled && (
              <div className="mt-4 flex flex-col gap-4">
                <div className="rounded-xl border border-line p-4 text-center">
                  <p className="mb-2 text-sm font-medium text-ink-700">1. امسح رمز QR</p>
                  <div className="inline-block rounded-lg bg-white p-2"><QRCodeSVG value={setup.provisioning_uri} size={140} /></div>
                  <p className="mt-2 text-xs text-ink-400">أو المفتاح: <code className="bg-ink-50 px-1 py-0.5 rounded">{setup.secret}</code></p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-ink-700">2. رموز الاسترداد</p>
                    <button onClick={() => setShowCodes(!showCodes)} className="text-[10px] text-ink-400 hover:text-ink">{showCodes ? "إخفاء" : "عرض"}</button>
                  </div>
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-ink-50/50 p-2 text-center" dir="ltr">
                    {setup.recovery_codes.map((code) => <code key={code} className="text-xs font-mono">{showCodes ? code : "••••••••"}</code>)}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-ink-700">3. أدخل الرمز للتفعيل</p>
                  <Input placeholder="123456" label="" inputMode="numeric" maxLength={6} value={enableCode} onChange={(event) => setEnableCode(event.target.value.replace(/\D/g, ""))} />
                  <Button onClick={() => enableMutation.mutate()} disabled={enableMutation.isPending || enableCode.length !== 6} className="mt-2 w-full">
                    {enableMutation.isPending ? "..." : "تأكيد التفعيل"}
                  </Button>
                </div>
              </div>
            )}

            {user?.two_factor_enabled && (
              <div className="mt-2 rounded-xl border border-danger/20 bg-danger/5 p-4">
                <p className="text-xs text-ink-700 mb-2">لإلغاء التفعيل، أدخل كلمة المرور والرمز:</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input label="" type="password" placeholder="كلمة المرور" value={disablePassword} onChange={(event) => setDisablePassword(event.target.value)} />
                  <Input label="" placeholder="123456" maxLength={6} value={disableCode} onChange={(event) => setDisableCode(event.target.value.replace(/\D/g, ""))} />
                </div>
                <Button variant="danger" onClick={() => disableMutation.mutate()} disabled={disableMutation.isPending || disableCode.length !== 6 || !disablePassword} className="mt-3 w-full">
                  {disableMutation.isPending ? "..." : "إلغاء التفعيل"}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-bold font-display text-ink">🔑 تغيير كلمة المرور</h3>
          <p className="mt-1 mb-4 text-sm text-ink-400">أدخل كلمتك الحالية ثم الجديدة. سيتم إنهاء جميع الجلسات الأخرى تلقائيًا.</p>
          <form onSubmit={(event) => { event.preventDefault(); passwordMutation.mutate(); }} className="flex flex-col gap-4" noValidate>
            <Input label="كلمة المرور الحالية" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
            <Input label="كلمة المرور الجديدة" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            <Input label="تأكيد كلمة المرور" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            <Button type="submit" disabled={passwordMutation.isPending || !currentPassword || !newPassword || !confirmPassword} className="mt-2">
              {passwordMutation.isPending ? "..." : "تحديث كلمة المرور"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
