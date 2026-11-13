import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpLeft,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  Building2,
  ChevronDown,
  ClipboardList,
  FileText,
  GraduationCap,
  Layers3,
  Monitor,
  Play,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  Zap,
} from "lucide-react";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { PricingSection } from "@/components/landing/PricingSection";

const features = [
  {
    icon: ClipboardList,
    title: "إنشاء وإدارة الامتحانات",
    description: "جهّز امتحاناتك ونظّم أسئلتك، مع إمكانية استخدام أنواع مختلفة من الأسئلة.",
    tag: "إدارة الامتحانات",
    className: "md:col-span-2",
  },
  {
    icon: BarChart3,
    title: "متابعة أداء الطلاب",
    description: "تابع نتائج الطلاب واستفد من التقارير في فهم مستوى الأداء وتحديد نقاط التحسين.",
    tag: "التقارير",
    className: "",
  },
  {
    icon: BookOpen,
    title: "بنك الأسئلة",
    description: "نظّم الأسئلة حسب الصف والمادة والتصنيف لتسهيل الوصول إليها وإعادة استخدامها.",
    tag: "تنظيم المحتوى",
    className: "",
  },
  {
    icon: CheckCircle2,
    title: "التصحيح التلقائي",
    description: "تقليل العمل اليدوي في تصحيح أسئلة الاختيار من متعدد والصح والخطأ.",
    tag: "التصحيح",
    className: "",
  },
  {
    icon: Video,
    title: "المحتوى التعليمي",
    description: "اجمع الملفات والفيديوهات والنصوص والروابط التعليمية في مكان منظم.",
    tag: "المحتوى",
    className: "",
  },
  {
    icon: Users,
    title: "إدارة المستخدمين",
    description: "نظّم حسابات الطلاب والمعلمين والمجموعات بما يناسب طبيعة مؤسستك.",
    tag: "إدارة المؤسسة",
    className: "md:col-span-2",
  },
];

const audiences = [
  {
    icon: GraduationCap,
    title: "المدرسون",
    description: "نظّم امتحاناتك وأسئلتك وتابع نتائج طلابك من مكان واحد.",
  },
  {
    icon: Users,
    title: "المراكز التعليمية",
    description: "اجمع إدارة الطلاب والمعلمين والمجموعات والامتحانات في منصة واحدة.",
  },
  {
    icon: Building2,
    title: "المدارس",
    description: "وفّر بيئة رقمية تساعد على تنظيم العملية التعليمية ومتابعة الأداء.",
  },
];

const steps = [
  {
    number: "01",
    title: "جهّز مؤسستك",
    description: "ابدأ بتحديد طبيعة المؤسسة وتنظيم المستخدمين والبيانات الأساسية.",
  },
  {
    number: "02",
    title: "أضف المحتوى والأسئلة",
    description: "نظّم المواد التعليمية وبنك الأسئلة وفق احتياجاتك.",
  },
  {
    number: "03",
    title: "أنشئ الامتحانات",
    description: "جهّز الامتحان وحدد الأسئلة والإعدادات المناسبة له.",
  },
  {
    number: "04",
    title: "تابع النتائج",
    description: "راجع نتائج الطلاب واستفد من التقارير المتاحة لمتابعة الأداء.",
  },
];

const faqs = [
  {
    question: "هل المنصة مناسبة للمدارس والمراكز التعليمية؟",
    answer: "المنصة تستهدف المدرسين والمراكز والمدارس، وتوفر أدوات لتنظيم المستخدمين والمحتوى والامتحانات. يمكنك طلب عرض توضيحي لمناقشة احتياجات مؤسستك.",
  },
  {
    question: "ما أنواع الأسئلة التي يمكن استخدامها؟",
    answer: "تشمل الأنواع المذكورة في المنصة أسئلة الاختيار من متعدد، والأسئلة المقالية، وأسئلة الصح والخطأ.",
  },
  {
    question: "هل يمكن تصحيح الامتحانات تلقائيًا؟",
    answer: "تدعم المنصة التصحيح التلقائي لأسئلة الاختيار من متعدد والصح والخطأ. أما الأسئلة المقالية فتحتاج إلى آلية تصحيح مناسبة لطبيعتها.",
  },
  {
    question: "هل يمكن إضافة محتوى تعليمي؟",
    answer: "يمكن تنظيم أنواع متعددة من المحتوى، مثل ملفات PDF والفيديوهات والنصوص والروابط التعليمية.",
  },
  {
    question: "كيف يمكنني معرفة الأسعار والتفاصيل؟",
    answer: "يمكنك إرسال طلب عرض توضيحي، وسيساعدك فريق المنصة في مناقشة احتياجاتك وتفاصيل الباقة المناسبة.",
  },
  {
    question: "هل يمكنني مشاهدة المنصة قبل اتخاذ القرار؟",
    answer: "يمكنك طلب عرض توضيحي للتعرف على واجهة المنصة وطريقة عمل الأدوات المتاحة.",
  },
];

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mx-auto mb-14 max-w-2xl text-center">
      <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent-dark dark:text-accent-light">
        <Sparkles size={15} aria-hidden="true" />
        {eyebrow}
      </span>
      <h2 className="font-display text-3xl font-bold leading-tight text-ink sm:text-4xl md:text-5xl">
        {title}
      </h2>
      <p className="mt-5 text-base leading-8 text-ink-500 sm:text-lg">
        {description}
      </p>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="relative mx-auto mt-16 w-full max-w-5xl" aria-label="تصور توضيحي لواجهة لوحة التحكم">
      <div className="absolute -inset-5 -z-10 rounded-[2rem] bg-accent/10 blur-3xl" />
      <div className="overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950 shadow-2xl shadow-slate-950/20">
        <div className="flex h-12 items-center justify-between border-b border-slate-800 bg-slate-900 px-4 sm:px-6">
          <div className="flex items-center gap-2" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </div>
          <div className="rounded-md border border-slate-700 bg-slate-950 px-4 py-1 text-xs text-slate-400">
            لوحة التحكم
          </div>
          <div className="w-12" />
        </div>
        <div className="grid min-h-[360px] grid-cols-1 md:grid-cols-[190px_1fr]">
          <aside className="hidden border-l border-slate-800 bg-slate-900/80 p-4 md:block">
            <div className="mb-8 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400 text-slate-950">
                <GraduationCap size={20} />
              </div>
              <span className="text-sm font-bold text-white">منصة التعلم</span>
            </div>
            <div className="space-y-2">
              {[
                { icon: Monitor, label: "لوحة التحكم", active: true },
                { icon: Users, label: "المستخدمون" },
                { icon: FileText, label: "الامتحانات" },
                { icon: BookOpen, label: "بنك الأسئلة" },
                { icon: BarChart3, label: "التقارير" },
              ].map((item) => (
                <div key={item.label} className={`flex items-center gap-3 rounded-lg px-3 py-3 text-xs ${item.active ? "bg-amber-400/15 font-semibold text-amber-300" : "text-slate-400"}`}>
                  <item.icon size={16} /> {item.label}
                </div>
              ))}
            </div>
          </aside>
          <div className="min-w-0 p-4 sm:p-6 md:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-400">مساحة العمل</p>
                <h3 className="mt-1 text-lg font-bold text-white sm:text-xl">لوحة التحكم</h3>
              </div>
              <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> نظرة عامة
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[{ label: "إدارة الطلاب", icon: Users }, { label: "الامتحانات", icon: ClipboardList }, { label: "المحتوى", icon: BookOpen }].map((item) => (
                <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                  <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300">
                    <item.icon size={18} />
                  </div>
                  <p className="text-xs font-medium text-slate-300">{item.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-white">متابعة الأداء</p>
                  <p className="mt-1 text-xs text-slate-500">تصور توضيحي لعرض البيانات</p>
                </div>
                <BarChart3 className="text-amber-300" size={20} />
              </div>
              <div className="flex h-28 items-end justify-between gap-2" aria-hidden="true">
                {[35, 55, 42, 75, 58, 88, 65, 95, 70, 82, 60, 90].map((height, index) => (
                  <div key={index} className="flex-1 rounded-t-sm bg-gradient-to-t from-amber-600 to-amber-300 opacity-80" style={{ height: `${height}%` }} />
                ))}
              </div>
              <div className="mt-3 flex justify-between text-[10px] text-slate-500">
                <span>عرض توضيحي</span>
                <span>بيانات افتراضية</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-ink-400">هذه واجهة توضيحية وليست لقطة شاشة من النظام الفعلي.</p>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description, tag, className }: (typeof features)[number]) {
  return (
    <article className={`group rounded-2xl border border-line bg-paper-elevated p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-card-hover sm:p-8 ${className}`}>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-white">
          <Icon size={23} aria-hidden="true" />
        </div>
        <span className="rounded-full bg-paper-muted px-3 py-1.5 text-xs font-medium text-ink-500">{tag}</span>
      </div>
      <h3 className="text-xl font-bold text-ink">{title}</h3>
      <p className="mt-3 max-w-xl text-sm leading-7 text-ink-500 sm:text-base">{description}</p>
    </article>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <LandingNavbar />

      {/* HERO */}
      <section className="relative isolate overflow-hidden pb-16 pt-20 sm:pb-24 sm:pt-28">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[550px] bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.14),transparent_65%)]" aria-hidden="true" />
        <div className="mx-auto max-w-7xl px-5 text-center sm:px-8">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent-dark dark:text-accent-light">
            <Sparkles size={16} aria-hidden="true" /> حلول رقمية لإدارة التعليم
          </div>
          <h1 className="mx-auto mt-8 max-w-4xl font-display text-4xl font-extrabold leading-[1.35] tracking-tight text-ink sm:text-5xl md:text-6xl lg:text-7xl">
            إدارة تعليمية أكثر
            <span className="block bg-gradient-to-l from-amber-500 to-yellow-300 bg-clip-text text-transparent">تنظيمًا ووضوحًا</span>
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-base leading-8 text-ink-500 sm:text-lg sm:leading-9">
            منصة تعليمية تجمع إدارة الامتحانات والطلاب والمحتوى والتقارير في مساحة عمل واحدة، لتساعدك على تنظيم مؤسستك والتركيز على التعليم.
          </p>
          <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link href="/request-demo" className="group inline-flex min-h-14 items-center justify-center gap-3 rounded-xl bg-accent px-7 py-4 text-base font-bold text-slate-950 shadow-lg shadow-accent/20 transition-all hover:-translate-y-0.5 hover:bg-accent-dark hover:text-white hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
              اطلب عرضًا توضيحيًا
              <ArrowLeft size={19} className="transition-transform group-hover:-translate-x-1" aria-hidden="true" />
            </Link>
            <Link href="#features" className="inline-flex min-h-14 items-center justify-center gap-3 rounded-xl border border-line bg-paper-elevated px-7 py-4 text-base font-semibold text-ink transition-colors hover:bg-paper-muted">
              <Play size={17} aria-hidden="true" /> اكتشف مميزات المنصة
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-ink-400">
            <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} className="text-success" /> عرض توضيحي للتعرف على المنصة</span>
            <span className="inline-flex items-center gap-2"><ShieldCheck size={16} className="text-success" /> تعرّف على الأدوات قبل اتخاذ القرار</span>
          </div>
          <DashboardPreview />
        </div>
      </section>

      {/* AUDIENCE */}
      <section className="border-y border-line bg-paper-muted/50 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <SectionHeading eyebrow="لمن صُممت المنصة؟" title="حل واحد لاحتياجات تعليمية مختلفة" description="سواء كنت مدرسًا مستقلًا أو تدير مركزًا تعليميًا أو مدرسة، يمكنك التعرف على الأدوات التي تساعدك في تنظيم عملك." />
          <div className="grid gap-5 md:grid-cols-3">
            {audiences.map((audience) => (
              <article key={audience.title} className="rounded-2xl border border-line bg-paper-elevated p-7 transition-all hover:-translate-y-1 hover:shadow-card-hover">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent"><audience.icon size={27} aria-hidden="true" /></div>
                <h3 className="text-xl font-bold text-ink">{audience.title}</h3>
                <p className="mt-3 text-sm leading-7 text-ink-500">{audience.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="scroll-mt-24 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <SectionHeading eyebrow="إمكانيات المنصة" title="كل أدواتك التعليمية في مكان واحد" description="بدلًا من توزيع العمل بين أدوات متعددة، اجمع المهام التعليمية والإدارية الأساسية داخل مساحة عمل منظمة." />
          <div className="grid gap-5 md:grid-cols-3">
            {features.map((feature) => (<FeatureCard key={feature.title} {...feature} />))}
          </div>
        </div>
      </section>

      {/* WORKFLOW / HOW IT WORKS */}
      <section id="how-it-works" className="scroll-mt-24 border-y border-line bg-paper-muted/50 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <SectionHeading eyebrow="طريقة العمل" title="ابدأ بخطوات واضحة" description="تصور مبسط لطريقة تنظيم العمل على المنصة من تجهيز المؤسسة وحتى متابعة نتائج الطلاب." />
          <div className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <article key={step.number} className="relative">
                {index !== steps.length - 1 && (<div className="absolute right-12 top-6 hidden h-px w-[calc(100%-3rem)] bg-line-strong lg:block" aria-hidden="true" />)}
                <div className="relative mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-accent/30 bg-paper-elevated font-mono text-sm font-bold text-accent shadow-sm">{step.number}</div>
                <h3 className="text-lg font-bold text-ink">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-ink-500">{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* PLATFORM BENEFITS */}
      <section className="relative overflow-hidden py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent-dark dark:text-accent-light"><Zap size={15} /> تجربة عمل منظمة</span>
            <h2 className="mt-6 font-display text-3xl font-bold leading-tight text-ink sm:text-4xl">وقت أقل في المهام المتكررة،<span className="block text-accent">وتركيز أكبر على التعليم</span></h2>
            <p className="mt-5 text-base leading-8 text-ink-500">اجمع المهام التعليمية الأساسية في مكان واحد، وسهّل على فريقك الوصول إلى المعلومات ومتابعة ما يحدث داخل المؤسسة.</p>
            <ul className="mt-8 space-y-4">
              {["تنظيم الامتحانات والأسئلة.", "إدارة الطلاب والمعلمين والمجموعات.", "تجميع المحتوى التعليمي.", "متابعة النتائج والتقارير المتاحة."].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm font-medium text-ink-600">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/10 text-success"><Check size={13} /></span>
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/request-demo" className="mt-9 inline-flex items-center gap-2 font-bold text-accent-dark transition-colors hover:text-accent dark:text-accent-light">تعرف على المنصة <ArrowUpLeft size={18} /></Link>
          </div>
          <div className="relative">
            <div className="absolute inset-0 -z-10 rounded-full bg-accent/10 blur-3xl" />
            <div className="rounded-3xl border border-line bg-paper-elevated p-5 shadow-card-hover sm:p-8">
              <div className="mb-7 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-ink">مساحة عمل تعليمية</p>
                  <p className="mt-1 text-xs text-ink-400">تنظيم الأدوات والمهام</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent"><Layers3 size={22} /></div>
              </div>
              <div className="space-y-3">
                {[{ icon: Users, title: "المستخدمون", desc: "الطلاب والمعلمون والمجموعات" }, { icon: ClipboardList, title: "الامتحانات", desc: "إعداد الأسئلة وتنظيم الاختبارات" }, { icon: BookOpen, title: "المحتوى التعليمي", desc: "الملفات والمواد والروابط" }, { icon: BarChart3, title: "متابعة الأداء", desc: "النتائج والتقارير" }].map((item) => (
                  <div key={item.title} className="flex items-center gap-4 rounded-xl border border-line bg-paper-muted/60 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-paper-elevated text-accent shadow-sm"><item.icon size={19} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-ink">{item.title}</p>
                      <p className="mt-1 text-xs text-ink-400">{item.desc}</p>
                    </div>
                    <CheckCircle2 size={17} className="shrink-0 text-success" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <PricingSection />

      {/* FAQ */}
      <section id="faq" className="scroll-mt-24 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <SectionHeading eyebrow="الأسئلة الشائعة" title="هل لديك أسئلة؟" description="إجابات مختصرة عن بعض الأسئلة الأساسية حول المنصة وإمكانياتها." />
          <div className="space-y-3">
            {faqs.map((faq, index) => (
              <details key={faq.question} className="group rounded-xl border border-line bg-paper-elevated transition-colors open:border-accent/30" open={index === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold text-ink marker:hidden sm:p-6 [&::-webkit-details-marker]:hidden">
                  <span className="text-sm leading-7 sm:text-base">{faq.question}</span>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper-muted text-ink-500 transition-transform group-open:rotate-180"><ChevronDown size={17} /></span>
                </summary>
                <div className="border-t border-line px-5 pb-5 pt-4 text-sm leading-8 text-ink-500 sm:px-6 sm:pb-6">{faq.answer}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="px-5 pb-20 sm:px-8 sm:pb-28">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl border border-slate-700 bg-slate-950 px-6 py-16 text-center text-white sm:px-12 sm:py-20">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.2),transparent_65%)]" aria-hidden="true" />
          <div className="relative mx-auto max-w-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300"><GraduationCap size={29} /></div>
            <h2 className="mt-7 font-display text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">جاهز لتنظيم مؤسستك التعليمية؟</h2>
            <p className="mt-5 text-base leading-8 text-slate-300 sm:text-lg">تعرّف على المنصة وناقش احتياجاتك، واكتشف كيف يمكن لأدواتها أن تساعدك في إدارة العمل التعليمي.</p>
            <Link href="/request-demo" className="mt-9 inline-flex min-h-14 items-center justify-center gap-3 rounded-xl bg-amber-400 px-8 py-4 font-bold text-slate-950 transition-all hover:-translate-y-0.5 hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">اطلب عرضًا توضيحيًا <ArrowLeft size={19} /></Link>
          </div>
        </div>
      </section>

      <LandingFooter />
    </main>
  );
}