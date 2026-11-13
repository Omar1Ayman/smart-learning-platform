"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { 
  CheckCircle2, 
  ArrowRight, 
  Users, 
  Sparkles, 
  Clock, 
  ShieldCheck
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { submitDemoRequest } from "@/lib/api/platformAdmin";

const schema = z.object({
  school_name: z.string().min(2, "اسم المؤسسة قصير جدًا").max(255),
  contact_name: z.string().min(2, "الاسم قصير جدًا").max(255),
  email: z.string().email("بريد إلكتروني غير صالح"),
  phone: z.string().min(7, "رقم الهاتف قصير جدًا").max(30),
  num_students: z.coerce.number().int().min(1).optional(),
  message: z.string().max(2000).optional(),
});

type Values = z.output<typeof schema>;

export default function RequestDemoPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, Values>({
    resolver: zodResolver(schema),
  });

  const mutation = useMutation({
    mutationFn: submitDemoRequest,
    onSuccess: () => setSent(true),
  });

  // ============ SUCCESS STATE ============
  if (sent) {
    return (
      <main className="flex min-h-screen bg-paper items-center justify-center p-6">
        <div className="w-full max-w-lg card p-10 text-center animate-fade-in">
          <div className="mx-auto flex items-center justify-center w-20 h-20 bg-success/10 rounded-full mb-6">
            <CheckCircle2 size={40} className="text-success" />
          </div>
          <h1 className="text-2xl font-bold font-display text-ink mb-3">
            تم استلام طلبك بنجاح!
          </h1>
          <p className="text-ink-500 mb-8 leading-relaxed">
            شكراً لاهتمامك بمنصة التعلم الذكية. سيتواصل فريق المبيعات معك خلال 24-48 ساعة عمل.
          </p>
          
          <div className="text-start bg-paper-muted p-6 rounded-2xl border border-line mb-8 space-y-4">
            <p className="text-sm font-bold text-ink mb-4">ماذا يحدث الآن؟</p>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
              <div>
                <p className="text-sm font-bold text-ink">مراجعة الطلب</p>
                <p className="text-xs text-ink-500">سيراجع فريقنا بيانات مؤسستك لتجهيز العرض المناسب.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
              <div>
                <p className="text-sm font-bold text-ink">التواصل معك</p>
                <p className="text-xs text-ink-500">سنتصل بك أو نرسل لك بريداً إلكترونياً لجدولة موعد.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
              <div>
                <p className="text-sm font-bold text-ink">العرض التوضيحي</p>
                <p className="text-xs text-ink-500">سنقدم لك جولة مباشرة على المنصة ونجيب على أسئلتك.</p>
              </div>
            </div>
          </div>

          <Link 
            href="/login" 
            className="inline-flex items-center justify-center w-full rounded-xl border border-line bg-paper px-6 py-3 text-sm font-bold text-ink transition-colors hover:bg-paper-muted"
          >
            <ArrowRight size={16} className="ml-2" />
            العودة لتسجيل الدخول
          </Link>
        </div>
      </main>
    );
  }

  // ============ FORM STATE ============
  return (
    <main className="flex min-h-screen bg-paper">
      
      {/* ============ LEFT SIDE: Value Prop (Desktop) ============ */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-ink p-12 text-paper relative overflow-hidden">
        {/* Background Glow */}
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
            انضم إلى مستقبل <br /> إدارة التعليم.
          </h2>
          <p className="text-paper/70 text-lg leading-relaxed mb-10">
            احصل على عرض توضيحي مخصص لمؤسستك، واكتشف كيف يمكن للمنصة أن توفر لك ساعات من العمل وتزيد من كفاءة فريقك.
          </p>
          
          <div className="space-y-5">
            {[
              { icon: Clock, text: "تجربة مجانية 14 يوماً بدون التزام" },
              { icon: Users, text: "تدريب مجاني لفريق العمل بالكامل" },
              { icon: ShieldCheck, text: "أمان وحماية بمستوى المؤسسات" }
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

        <div className="relative z-10 flex items-center gap-2 text-sm text-paper/50">
          <span>موثوقة من قبل أكثر من 5,000 معلم</span>
          <div className="flex text-accent">
            {[1, 2, 3, 4, 5].map((s) => <Sparkles key={s} size={12} fill="currentColor" />)}
          </div>
        </div>
      </div>

      {/* ============ RIGHT SIDE: Form ============ */}
      <div className="flex flex-col justify-center w-full lg:w-[55%] px-6 sm:px-12 lg:px-20 py-12 relative">
        
        <Link 
          href="/" 
          className="absolute top-8 right-8 lg:hidden inline-flex items-center text-sm font-medium text-ink-500 hover:text-ink"
        >
          <ArrowRight size={16} className="ml-1" />
          العودة للرئيسية
        </Link>

        <div className="w-full max-w-lg mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold font-display text-ink">
              اطلب عرضاً توضيحياً
            </h1>
            <p className="mt-2 text-ink-500">
              املأ البيانات التالية وسنتواصل معك في أقرب وقت.
            </p>
          </div>

          <form
            onSubmit={handleSubmit((v) => mutation.mutate(v))}
            className="space-y-5"
            noValidate
          >
            <Input
              label="اسم المؤسسة"
              placeholder="مثال: مدرسة النيل الدولية"
              error={errors.school_name?.message}
              {...register("school_name")}
            />
            
            <Input
              label="اسمك الكريم"
              placeholder="مثال: أحمد حسن"
              error={errors.contact_name?.message}
              {...register("contact_name")}
            />
            
            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                label="البريد الإلكتروني"
                type="email"
                autoComplete="email"
                placeholder="you@school.edu.eg"
                error={errors.email?.message}
                {...register("email")}
              />
              <Input
                label="رقم الهاتف"
                type="tel"
                autoComplete="tel"
                placeholder="+20 100 000 0000"
                error={errors.phone?.message}
                {...register("phone")}
              />
            </div>
            
            <Input
              label="عدد الطلاب (اختياري)"
              type="number"
              placeholder="مثال: 500"
              error={errors.num_students?.message}
              {...register("num_students")}
            />

            {/* Fixed Textarea for Dark Mode */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink-700">
                رسالة (اختياري)
              </label>
              <textarea
                rows={3}
                placeholder="أخبرنا عن احتياجات مؤسستك..."
                className="rounded-xl border border-line bg-paper-elevated px-4 py-3 text-sm text-ink placeholder:text-ink-400 outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent resize-y min-h-[100px]"
                {...register("message")}
              />
            </div>

            {mutation.isError && (
              <div className="rounded-xl bg-danger/10 border border-danger/20 px-4 py-3 text-sm font-medium text-danger">
                تعذّر إرسال الطلب. يرجى المحاولة مرة أخرى أو التواصل معنا مباشرة.
              </div>
            )}

            <Button
              type="submit"
              disabled={mutation.isPending}
              className="w-full h-12 text-base font-bold shadow-lg shadow-accent/20 transition-all hover:-translate-y-0.5 mt-2"
            >
              {mutation.isPending ? "جارٍ الإرسال..." : "إرسال الطلب"}
            </Button>

            <p className="text-center text-xs text-ink-400">
              بإرسالك للطلب، أنت توافق على <Link href="/legal/privacy" className="underline hover:text-ink">سياسة الخصوصية</Link> و <Link href="/legal/terms" className="underline hover:text-ink">شروط الاستخدام</Link>.
            </p>
          </form>

          <div className="mt-8 pt-6 border-t border-line text-center">
            <p className="text-sm text-ink-500">
              لديك حساب بالفعل؟{" "}
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