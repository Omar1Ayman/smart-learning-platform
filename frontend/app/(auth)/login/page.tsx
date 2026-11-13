"use client";

import { safeReturnTo } from "@/lib/auth/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { AlertCircle, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import { loginSchema, type LoginFormValues } from "@/lib/validation/schemas";
import type { AxiosError } from "axios";

interface LoginResponse {
  access: string;
  session_id?: string;
  requires_2fa?: boolean;
  twofa_token?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginFormValues, event?: React.BaseSyntheticEvent) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setServerError(null);

    try {
      const { data } = await apiClient.post<LoginResponse>("/auth/login/", values);

      const requestedReturnTo = new URLSearchParams(
        window.location.search,
      ).get("returnTo");

      if (data.requires_2fa && data.twofa_token) {
        useAuthStore.getState().setPending2faToken(data.twofa_token);
        const suffix = requestedReturnTo
          ? `?returnTo=${encodeURIComponent(requestedReturnTo)}`
          : "";
        router.replace(`/login/2fa${suffix}`);
        return;
      }

      if (!data.access) {
        setServerError("استجابة غير متوقعة من السيرفر. حاول مرة أخرى.");
        return;
      }

      const { data: me } = await apiClient.get("/auth/me/", {
        headers: { Authorization: `Bearer ${data.access}` },
      });

      setAuth(data.access, me, data.session_id ?? null);
      router.replace(
        safeReturnTo(requestedReturnTo, me) ??
          (me.is_platform_admin ? "/platform" : "/dashboard"),
      );
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: { detail?: unknown } }>;
      const status = axiosErr?.response?.status;
      const detail = axiosErr?.response?.data?.error?.detail;

      if (status === 429) {
        setServerError("محاولات تسجيل دخول كثيرة. انتظر دقيقة وحاول مرة أخرى.");
      } else if (status === 401) {
        setServerError("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
      } else if (status === 403) {
        setServerError(
          typeof detail === "string"
            ? detail
            : "الحساب معلّق أو غير مصرح له بالدخول."
        );
      } else if (!axiosErr?.response) {
        setServerError(
          "تعذّر الاتصال بالسيرفر. تأكد من اتصالك بالإنترنت وحاول مجدداً."
        );
      } else {
        setServerError(
          typeof detail === "string"
            ? detail
            : "تعذّر تسجيل الدخول. حاول مرة أخرى."
        );
      }
    }
  }

  return (
    <main className="flex min-h-screen bg-paper">

      {/* ============ LEFT SIDE: Branding Panel (Desktop Only) ============ */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-ink p-12 text-paper relative overflow-hidden">
        {/* Abstract Background Glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent/20 blur-[120px] rounded-full pointer-events-none" />

        {/* Logo & Back Link */}
        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-3 hover:opacity-80 transition-opacity">
            <span className="inline-flex items-center justify-center w-10 h-10 text-lg font-bold rounded-xl bg-paper text-ink shadow-sm">
              ت
            </span>
            <span className="text-xl font-bold font-display text-paper">
              منصة التعلم الذكية
            </span>
          </Link>
        </div>

        {/* Value Proposition */}
        <div className="relative z-10 max-w-md">
          <h2 className="text-4xl font-bold font-display leading-tight mb-6">
            مرحباً بعودتك إلى <br /> مستقبل التعليم.
          </h2>
          <p className="text-paper/70 text-lg leading-relaxed mb-8">
            أدر امتحاناتك، تابع طلابك، وحلّل أداء مؤسستك من لوحة تحكم واحدة متكاملة.
          </p>

          <div className="space-y-4">
            {[
              "عزل تام لبيانات مؤسستك",
              "تقارير لحظية دقيقة",
              "دعم فني بالعربية 24/7"
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-3 text-paper/90">
                <CheckCircle2 className="text-accent" size={20} />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center gap-2 text-sm text-paper/50">
          <ShieldCheck size={16} />
          <span>نظام آمن ومشفر بالكامل (256-bit SSL)</span>
        </div>
      </div>

      {/* ============ RIGHT SIDE: Login Form ============ */}
      <div className="flex flex-col justify-center w-full lg:w-1/2 px-6 sm:px-12 lg:px-24 relative">

        {/* Mobile Back to Home Link */}
        <Link
          href="/"
          className="absolute top-8 right-8 lg:hidden inline-flex items-center text-sm font-medium text-ink-500 hover:text-ink"
        >
          <ArrowRight size={16} className="ml-1" />
          العودة للرئيسية
        </Link>

        <div className="w-full max-w-md mx-auto space-y-8">

          <div className="text-center lg:text-start">
            <h1 className="text-3xl font-bold font-display text-ink">تسجيل الدخول</h1>
            <p className="mt-2 text-ink-500">
              أدخل بياناتك للوصول إلى لوحة التحكم.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <Input
              label="البريد الإلكتروني"
              type="email"
              placeholder="name@school.com"
              autoComplete="email"
              error={errors.email?.message}
              {...register("email")}
            />

            <div className="space-y-1">
              <Input
                label="كلمة المرور"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                error={errors.password?.message}
                {...register("password")}
              />
              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="text-sm font-medium text-accent hover:text-accent-dark transition-colors"
                >
                  نسيت كلمة المرور؟
                </Link>
              </div>
            </div>

            {/* Enhanced Error Alert */}
            {serverError && (
              <div className="flex items-start gap-3 p-4 text-sm rounded-xl bg-danger/10 border border-danger/20 text-danger animate-fade-in">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <p className="font-medium leading-relaxed">{serverError}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 text-base font-bold shadow-lg shadow-accent/20 transition-all hover:-translate-y-0.5"
            >
              {isSubmitting ? "جارٍ التحقق..." : "دخول للمنصة"}
            </Button>
          </form>

          <div className="pt-6 border-t border-line text-center">
            <p className="text-sm text-ink-500">
              ليس لديك حساب؟{" "}
              <Link href="/request-demo" className="font-bold text-ink hover:text-accent transition-colors">
                اطلب عرضاً توضيحياً
              </Link>
            </p>
          </div>

        </div>
      </div>

    </main>
  );
}