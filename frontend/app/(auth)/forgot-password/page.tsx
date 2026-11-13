"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, ArrowRight, ShieldCheck, KeyRound, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiClient } from "@/lib/api/client";

const schema = z.object({ email: z.string().email("بريد إلكتروني غير صالح") });
type Values = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
  });

  const mutation = useMutation({
    mutationFn: async (data: Values) => {
      await apiClient.post("/auth/password-reset/", data);
    },
    onSuccess: () => setSent(true),
  });

  // ============ SUCCESS STATE ============
  if (sent) {
    return (
      <main className="flex min-h-screen bg-paper items-center justify-center p-6">
        <div className="w-full max-w-lg card p-10 text-center animate-fade-in relative overflow-hidden">
          {/* Subtle Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-sm h-32 bg-success/10 blur-[80px] pointer-events-none" />
          
          <div className="relative z-10">
            <div className="mx-auto flex items-center justify-center w-20 h-20 bg-success/10 rounded-full mb-6 border border-success/20">
              <CheckCircle2 size={40} className="text-success" />
            </div>
            <h1 className="text-2xl font-bold font-display text-ink mb-3">
              تحقق من بريدك الإلكتروني
            </h1>
            <p className="text-ink-500 mb-8 leading-relaxed max-w-sm mx-auto">
              إذا كان البريد الإلكتروني مسجلاً لدينا، فستصلك رسالة بها رابط لإعادة تعيين كلمة المرور. 
              <br /><span className="text-sm mt-2 block font-medium">الرابط صالح لمدة 3 أيام.</span>
            </p>
            
            <div className="bg-paper-muted p-4 rounded-xl border border-line mb-8 text-sm text-ink-600 flex items-start gap-3 text-start">
              <AlertCircle size={18} className="text-accent shrink-0 mt-0.5" />
              <p>لم تجد الرسالة؟ تحقق من مجلد البريد العشوائي (Spam) أو تأكد من كتابة البريد بشكل صحيح.</p>
            </div>

            <Link 
              href="/login" 
              className="inline-flex items-center justify-center w-full rounded-xl border border-line bg-paper px-6 py-3.5 text-sm font-bold text-ink transition-colors hover:bg-paper-muted"
            >
              <ArrowRight size={16} className="ml-2" />
              العودة لتسجيل الدخول
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ============ FORM STATE ============
  return (
    <main className="flex min-h-screen bg-paper">
      
      {/* ============ LEFT SIDE: Branding (Desktop) ============ */}
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
            استعد حسابك <br /> بأمان تام.
          </h2>
          <p className="text-paper/70 text-lg leading-relaxed mb-10">
            أمان حسابك هو أولويتنا القصوى. نستخدم بروتوكولات تشفير متقدمة لضمان بقاء بياناتك ومحتواك محمياً.
          </p>
          
          <div className="space-y-5">
            {[
              { icon: ShieldCheck, text: "تشفير كامل لبياناتك" },
              { icon: KeyRound, text: "رموز استرداد آمنة لمرة واحدة" },
              { icon: Mail, text: "إشعارات فورية على بريدك" }
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

      {/* ============ RIGHT SIDE: Form ============ */}
      <div className="flex flex-col justify-center w-full lg:w-[55%] px-6 sm:px-12 lg:px-20 py-12 relative">
        
        <Link 
          href="/login" 
          className="absolute top-8 right-8 inline-flex items-center text-sm font-medium text-ink-500 hover:text-ink transition-colors"
        >
          <ArrowRight size={16} className="ml-1" />
          العودة لتسجيل الدخول
        </Link>

        <div className="w-full max-w-md mx-auto">
          <div className="mb-8 text-center lg:text-start">
            <h1 className="text-3xl font-bold font-display text-ink">نسيت كلمة المرور؟</h1>
            <p className="mt-2 text-ink-500 leading-relaxed">
              لا تقلق. أدخل بريدك الإلكتروني المسجل وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.
            </p>
          </div>

          <form
            onSubmit={handleSubmit((v) => mutation.mutate(v))}
            className="space-y-5"
            noValidate
          >
            <Input
              label="البريد الإلكتروني"
              type="email"
              autoComplete="email"
              placeholder="name@school.com"
              error={errors.email?.message}
              {...register("email")}
            />

            {mutation.isError && (
              <div className="rounded-xl bg-danger/10 border border-danger/20 px-4 py-3 text-sm font-medium text-danger flex items-start gap-2">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <span>تعذّر إرسال الرابط. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.</span>
              </div>
            )}

            <Button 
              type="submit" 
              disabled={mutation.isPending} 
              className="w-full h-12 text-base font-bold shadow-lg shadow-accent/20 transition-all hover:-translate-y-0.5 mt-2"
            >
              {mutation.isPending ? "جارٍ الإرسال..." : "إرسال رابط الاستعادة"}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-line text-center">
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