"use client";

import { safeReturnTo } from "@/lib/auth/navigation";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import { verifyTwoFactorLogin } from "@/lib/api/twoFactor";
import { toastError } from "@/lib/utils/toast";

export default function LoginTwoFactorPage() {
  const router = useRouter();
  const pendingToken = useAuthStore((s) => s.pending2faToken);
  const setAuth = useAuthStore((s) => s.setAuth);
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);

  useEffect(() => {
    if (!pendingToken) router.replace("/login");
  }, [pendingToken, router]);

  const mutation = useMutation({
    mutationFn: () => verifyTwoFactorLogin(pendingToken!, code),
    onSuccess: async (data) => {
      const { data: me } = await apiClient.get("/auth/me/", {
        headers: { Authorization: `Bearer ${data.access}` },
      });

      // C-8 FIX: pass session_id so /settings/sessions identifies this
      // device. Previously ignored → always null → sessions page broken.
      setAuth(data.access, me, data.session_id ?? null);
      const requestedReturnTo = new URLSearchParams(
        window.location.search,
      ).get("returnTo");
      router.replace(
        safeReturnTo(requestedReturnTo, me) ??
          (me.is_platform_admin ? "/platform" : "/dashboard"),
      );
    },
    onError: (err) => toastError(err, "الرمز غير صحيح."),
  });

  if (!pendingToken) return null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="card w-full max-w-sm p-8">
        <h1 className="font-display text-xl font-bold text-ink">التحقق بخطوتين</h1>
        <p className="mt-1 text-sm text-ink-400">
          {useRecovery
            ? "أدخل أحد رموز الاسترداد التي حفظتها عند الإعداد"
            : "أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة"}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!code.trim()) return;
            mutation.mutate();
          }}
          className="mt-6 flex flex-col gap-4"
          noValidate
        >
          {useRecovery ? (
            <Input
              label="رمز الاسترداد"
              placeholder="XXXX-XXXX"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoComplete="off"
            />
          ) : (
            <Input
              label="الرمز"
              placeholder="123456"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoComplete="one-time-code"
            />
          )}

          <Button
            type="submit"
            disabled={mutation.isPending || code.length < 6}
            className="w-full"
          >
            {mutation.isPending ? "جارٍ التحقق..." : "تحقق"}
          </Button>

          <button
            type="button"
            onClick={() => {
              setUseRecovery(!useRecovery);
              setCode("");
            }}
            className="text-xs text-ink-400 hover:text-ink"
          >
            {useRecovery ? "← استخدام رمز التطبيق" : "استخدام رمز استرداد بدلًا من ذلك"}
          </button>

          <Link href="/login" className="text-center text-xs text-ink-400 hover:text-ink">
            ← العودة لتسجيل الدخول
          </Link>
        </form>
      </div>
    </main>
  );
}