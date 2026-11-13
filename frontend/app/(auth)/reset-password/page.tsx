"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  Lock, 
  ShieldCheck, 
  KeyRound 
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiClient } from "@/lib/api/client";
import { Spinner } from "@/components/ui/States";

// 1. Added confirm_password to Zod schema
const schema = z.object({
  new_password: z.string().min(10, "يجب أن تكون كلمة المرور 10 أحرف على الأقل"),
  confirm_password: z.string(),
}).refine((data) => data.new_password === data.confirm_password, {
  message: "كلمتا المرور غير متطابقتين",
  path: ["confirm_password"],
});

type Values = z.infer<typeof schema>;

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const uidb64 = searchParams.get("uidb64") ?? "";
  const token = searchParams.get("token") ?? "";
  const isInvitation = searchParams.get("invite") === "1";
  
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onChange"
  });

  // Watch the password field to power the UX checklist
  const passwordValue = watch("new_password", "");

  const mutation = useMutation({
    mutationFn: async (data: Values) => {
      await apiClient.post("/auth/password-reset/confirm/", {
        uidb64,
        token,
        new_password: data.new_password,
      });
    },
    onSuccess: () => setDone(true),
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { error?: { detail?: unknown } } } })
        ?.response?.data?.error?.detail;
      setServerError(
        typeof detail === "string" ? detail : "الرابط غير صالح أو منتهي الصلاحية."
      );
    },
  });

  // ============ 1. MISSING TOKEN STATE ============
  if (!uidb64 || !token) {
    return (
      <main className="flex min-h-screen bg-paper items-center justify-center p-6">
        <div className="w-full max-w-lg card p-10 text-center animate-fade-in relative overflow-hidden">
          <div className="mx-auto flex items-center justify-center w-20 h-20 bg-danger/10 rounded-full mb-6 border border-danger/20">
            <AlertCircle size={40} className="text-danger" />
          </div>
          <h1 className="text-2xl font-bold font-display text-ink mb-3">
            رابط غير مكتمل
          </h1>
          <p className="text-ink-500 mb-8 leading-relaxed max-w-sm mx-auto">
            رابط إعادة تعيين كلمة المرور غير صالح أو يفتقد لبيانات الأمان. قد يكون الرابط قديماً أو تم استخدامه مسبقاً.
          </p>
          <Link 
            href="/forgot-password" 
            className="inline-flex items-center justify-center w-full rounded-xl bg-accent px-6 py-3.5 text-sm font-bold text-white transition-all hover:bg-accent-dark hover:-translate-y-0.5 shadow-lg shadow-accent/20"
          >
            طلب رابط جديد
            <ArrowRight size={16} className="ml-2" />
          </Link>
        </div>
      </main>
    );
  }

  // ============ 2. SUCCESS STATE ============
  if (done) {
    return (
      <main className="flex min-h-screen bg-paper items-center justify-center p-6">
        <div className="w-full max-w-lg card p-10 text-center animate-fade-in relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-sm h-32 bg-success/10 blur-[80px] pointer-events-none" />
          
          <div className="relative z-10">
            <div className="mx-auto flex items-center justify-center w-20 h-20 bg-success/10 rounded-full mb-6 border border-success/20">
              <CheckCircle2 size={40} className="text-success" />
            </div>
            <h1 className="text-2xl font-bold font-display text-ink mb-3">
              تم تحديث كلمة المرور
            </h1>
            <p className="text-ink-500 mb-8 leading-relaxed max-w-sm mx-auto">
                {isInvitation
                  ? "تم إعداد حسابك. يمكنك الآن تسجيل الدخول باستخدام البريد الإلكتروني وكلمة المرور الجديدة."
                  : "أصبحت كلمة المرور الجديدة جاهزة للاستخدام. يمكنك الآن تسجيل الدخول إلى حسابك بأمان."}
            </p>
            <Button 
              className="w-full h-12 text-base font-bold shadow-lg shadow-accent/20 transition-all hover:-translate-y-0.5"
              onClick={() => router.push("/login")}
            >
              تسجيل الدخول للمنصة
            </Button>
          </div>
        </div>
      </main>
    );
  }

  // ============ 3. FORM STATE ============
  return (
    <main className="flex min-h-screen bg-paper">
      
      {/* LEFT SIDE: Branding (Desktop) */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-ink p-12 text-paper relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent/20 blur-[120px] rounded-full pointer-events-none" />
        
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

        <div className="relative z-10">
          <h2 className="text-4xl font-bold font-display leading-tight mb-6">
            خطوة واحدة <br /> وتعود لحسابك.
          </h2>
          <p className="text-paper/70 text-lg leading-relaxed mb-10">
            نأخذ أمان حسابك على محمل الجد. اختر كلمة مرور قوية وفريدة لحماية بيانات مؤسستك وطلابك.
          </p>
          
          <div className="space-y-5">
            {[
              { icon: ShieldCheck, text: "تشفير كامل لبياناتك" },
              { icon: KeyRound, text: "رموز استرداد آمنة لمرة واحدة" },
              { icon: Lock, text: "حماية ضد محاولات الاختراق" }
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-paper/90">
                <div className="w-8 h-8 rounded-lg bg-paper/10 flex items-center justify-center">
                  <f.icon className="text-accent" size={16} />
                </div>
                <span className="font-medium">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-sm text-paper/50">
          <p>© {new Date().getFullYear()} منصة التعلم الذكية. جميع الحقوق محفوظة.</p>
        </div>
      </div>

      {/* RIGHT SIDE: Form */}
      <div className="flex flex-col justify-center w-full lg:w-[55%] px-6 sm:px-12 lg:px-20 py-12 relative">
        <div className="w-full max-w-md mx-auto">
          
          <div className="mb-8 text-center lg:text-start">
            <h1 className="text-3xl font-bold font-display text-ink">
              {isInvitation ? "تفعيل حسابك" : "كلمة مرور جديدة"}
            </h1>
            <p className="mt-2 text-ink-500 leading-relaxed">
              {isInvitation
                ? "اختر كلمة مرور قوية لإكمال إعداد حسابك."
                : "أدخل كلمة المرور الجديدة أدناه. تأكد من أنها قوية وتحتوي على 10 أحرف على الأقل."}
            </p>
          </div>

          <form
            onSubmit={handleSubmit((v) => mutation.mutate(v))}
            className="space-y-5"
            noValidate
          >
            <Input
              label="كلمة المرور الجديدة"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              error={errors.new_password?.message}
              {...register("new_password")}
            />

            <Input
              label="تأكيد كلمة المرور"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              error={errors.confirm_password?.message}
              {...register("confirm_password")}
            />

            {/* Password Requirements UX Checklist */}
            <div className="p-4 rounded-xl bg-paper-muted border border-line space-y-2">
              <p className="text-xs font-bold text-ink mb-2">متطلبات كلمة المرور:</p>
              <div className={`flex items-center gap-2 text-xs transition-colors ${passwordValue.length >= 10 ? "text-success" : "text-ink-500"}`}>
                <CheckCircle2 size={14} className={passwordValue.length >= 10 ? "opacity-100" : "opacity-30"} />
                <span>تحتوي على 10 أحرف على الأقل</span>
              </div>
            </div>

            {serverError && (
              <div className="rounded-xl bg-danger/10 border border-danger/20 px-4 py-3 text-sm font-medium text-danger flex items-start gap-2 animate-fade-in">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <span>{serverError}</span>
              </div>
            )}

            <Button 
              type="submit" 
              disabled={mutation.isPending} 
              className="w-full h-12 text-base font-bold shadow-lg shadow-accent/20 transition-all hover:-translate-y-0.5 mt-2"
            >
              {mutation.isPending
                ? "جارٍ الحفظ..."
                : isInvitation
                  ? "تفعيل الحساب"
                  : "تحديث كلمة المرور"}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-line text-center">
            <p className="text-sm text-ink-500">
              تذكرت كلمة المرور؟{" "}
              <Link href="/login" className="font-bold text-ink hover:text-accent transition-colors">
                تسجيل الدخول
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center bg-paper">
        <Spinner />
      </main>
    }>
      <ResetForm />
    </Suspense>
  );
}