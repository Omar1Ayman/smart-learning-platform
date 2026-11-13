import Link from "next/link";
import { 
  FileText, ArrowRight, ShieldAlert, CheckCircle2, 
  Server, Mail 
} from "lucide-react";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingNavbar } from "@/components/landing/LandingNavbar";

const SECTIONS = [
  { id: "acceptance", title: "1. قبول الشروط" },
  { id: "accounts", title: "2. الحسابات والتسجيل" },
  { id: "acceptable-use", title: "3. الاستخدام المقبول" },
  { id: "content", title: "4. مسؤولية المحتوى" },
  { id: "payment", title: "5. الاشتراك والدفع" },
  { id: "termination", title: "6. التعليق والإلغاء" },
  { id: "availability", title: "7. توفر الخدمة" },
  { id: "liability", title: "8. حدود المسؤولية" },
  { id: "ip", title: "9. الملكية الفكرية" },
  { id: "law", title: "10. القانون المعمول به" },
  { id: "contact", title: "11. التواصل" },
];

export default function TermsPage() {
  const lastUpdated = new Date().toLocaleDateString("ar-EG", { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen bg-paper">
      <LandingNavbar />
      
      <main className="mx-auto max-w-6xl px-6 py-16 lg:py-24">
        
        {/* Header */}
        <div className="max-w-3xl mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-paper-muted text-ink-500 text-xs font-bold mb-4">
            <FileText size={14} />
            الوثائق القانونية
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-ink mb-4">
            شروط الاستخدام
          </h1>
          <p className="text-ink-500 flex items-center gap-2">
            آخر تحديث: <span className="font-bold text-ink">{lastUpdated}</span>
          </p>
        </div>

        {/* TL;DR Summary Box */}
        <div className="mb-16 p-6 md:p-8 rounded-2xl bg-accent/10 border border-accent/20">
          <h3 className="flex items-center gap-2 text-lg font-bold text-accent mb-3">
            <ShieldAlert size={20} />
            باختصار (الملخص)
          </h3>
          <p className="text-ink-700 leading-relaxed">
            المنصة مخصصة للمؤسسات التعليمية فقط. أنت مسؤول عن المحتوى الذي ترفعه وعن سرية حسابك. 
            نقدم فترة تجريبية مجانية 14 يوماً، ونسعى لتوفير الخدمة بنسبة 99.5%. 
            يمكنك إلغاء اشتراكك في أي وقت، وسنمنحك 30 يوماً لتصدير بياناتك.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
          
          {/* Sticky Table of Contents (Desktop) */}
          <aside className="hidden lg:block lg:col-span-1">
            <div className="sticky top-28 space-y-2">
              <p className="text-sm font-bold text-ink mb-4">محتويات الصفحة</p>
              {SECTIONS.map((s) => (
                <a 
                  key={s.id} 
                  href={`#${s.id}`}
                  className="block text-sm text-ink-500 hover:text-accent transition-colors py-1"
                >
                  {s.title}
                </a>
              ))}
            </div>
          </aside>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-12">
            
            <section id="acceptance" className="scroll-mt-24">
              <h2 className="mb-4 font-display text-2xl font-bold text-ink">1. قبول الشروط</h2>
              <p className="leading-relaxed text-ink-600">
                باستخدامك لمنصة التعلم الذكية، أنت توافق على هذه الشروط. إذا لم توافق، يُرجى عدم استخدام المنصة.
              </p>
            </section>

            <section id="accounts" className="scroll-mt-24">
              <h2 className="mb-4 font-display text-2xl font-bold text-ink">2. الحسابات والتسجيل</h2>
              <p className="leading-relaxed text-ink-600">
                المنصة مخصصة للمؤسسات التعليمية (مدارس، مراكز، مدرسين). التسجيل يتم عبر التواصل المباشر مع فريق المبيعات، وليس عبر التسجيل الذاتي. أنت مسؤول عن سرية بيانات الدخول الخاصة بك وعن جميع الأنشطة التي تحدث تحت حسابك.
              </p>
            </section>

            <section id="acceptable-use" className="scroll-mt-24">
              <h2 className="mb-4 font-display text-2xl font-bold text-ink">3. الاستخدام المقبول</h2>
              <p className="mb-4 leading-relaxed text-ink-600">يُمنع استخدام المنصة من أجل:</p>
              <ul className="space-y-3">
                {[
                  "نشر محتوى غير قانوني أو مسيء",
                  "انتهاك حقوق الملكية الفكرية",
                  "محاولة اختراق أو تعطيل المنصة",
                  "استخدامها لأغراض غير تعليمية",
                  "مشاركة الحساب مع مؤسسة أخرى"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 size={18} className="text-danger shrink-0 mt-0.5" />
                    <span className="text-ink-600">{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section id="content" className="scroll-mt-24">
              <h2 className="mb-4 font-display text-2xl font-bold text-ink">4. مسؤولية المحتوى</h2>
              <p className="leading-relaxed text-ink-600">
                أنت المسؤول الوحيد عن كل المحتوى الذي ترفعه إلى المنصة — أسئلة، ملفات، ملاحظات، بيانات طلاب. المنصة تُقدم كأداة فقط ولا تتحمل مسؤولية المحتوى الذي يرفعه العملاء.
              </p>
            </section>

            <section id="payment" className="scroll-mt-24">
              <h2 className="mb-4 font-display text-2xl font-bold text-ink">5. الاشتراك والدفع</h2>
              <ul className="space-y-3">
                {[
                  "الفترة التجريبية: 14 يومًا مجانًا من تاريخ التفعيل.",
                  "الدفع شهري أو سنوي (خصم 20% للدفع السنوي).",
                  "جميع الأسعار قابلة للتغيير بإشعار مسبق 60 يومًا.",
                  "لا يوجد استرداد للفترات المدفوعة مسبقًا."
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 size={18} className="text-accent shrink-0 mt-0.5" />
                    <span className="text-ink-600">{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section id="termination" className="scroll-mt-24">
              <h2 className="mb-4 font-display text-2xl font-bold text-ink">6. التعليق والإلغاء</h2>
              <p className="mb-4 leading-relaxed text-ink-600">
                نحتفظ بحق تعليق أو إلغاء أي حساب يخالف هذه الشروط. أنت أيضًا تستطيع إلغاء اشتراكك في أي وقت. عند الإلغاء:
              </p>
              <div className="p-5 rounded-xl bg-paper-muted border border-line">
                <p className="flex items-center gap-2 text-ink-700 font-medium">
                  <Server size={18} className="text-ink-500" />
                  ستتمكن من تصدير بياناتك لمدة 30 يومًا، بعدها قد تُحذف البيانات نهائيًا.
                </p>
              </div>
            </section>

            <section id="availability" className="scroll-mt-24">
              <h2 className="mb-4 font-display text-2xl font-bold text-ink">7. توفر الخدمة</h2>
              <p className="leading-relaxed text-ink-600">
                نسعى لتوفير الخدمة 99.5% من الوقت شهريًا (SLA). قد تحدث أعطال للصيانة المخططة، وسنُعلمك بها مسبقًا. الصيانة الطارئة قد تحدث بدون إشعار مسبق في حالات الأمان الحرجة.
              </p>
            </section>

            <section id="liability" className="scroll-mt-24">
              <h2 className="mb-4 font-display text-2xl font-bold text-ink">8. حدود المسؤولية</h2>
              <p className="leading-relaxed text-ink-600">
                المنصة تُقدم &quot;كما هي&quot;. لا نتحمل مسؤولية أي أضرار غير مباشرة، عرضية، أو تبعية تنشأ عن استخدام المنصة. مسؤوليتنا القصوى محدودة بالمبلغ المدفوع في آخر 12 شهرًا.
              </p>
            </section>

            <section id="ip" className="scroll-mt-24">
              <h2 className="mb-4 font-display text-2xl font-bold text-ink">9. الملكية الفكرية</h2>
              <p className="leading-relaxed text-ink-600">
                المنصة وكل مكوناتها (كود، تصميم، علامة تجارية) مملوكة لنا. المحتوى الذي ترفعه أنت يبقى ملكك. أنت تمنحنا ترخيصًا محدودًا لمعالجته فقط لتقديم الخدمة.
              </p>
            </section>

            <section id="law" className="scroll-mt-24">
              <h2 className="mb-4 font-display text-2xl font-bold text-ink">10. القانون المعمول به</h2>
              <p className="leading-relaxed text-ink-600">
                تخضع هذه الشروط لقوانين جمهورية مصر العربية. أي نزاع يُحل أمام المحاكم المصرية المختصة.
              </p>
            </section>

            <section id="contact" className="scroll-mt-24 pt-8 border-t border-line">
              <h2 className="mb-4 font-display text-2xl font-bold text-ink">11. التواصل</h2>
              <p className="mb-4 leading-relaxed text-ink-600">
                لأي استفسار بخصوص هذه الشروط، تواصل معنا عبر:
              </p>
              <a 
                href="mailto:legal@example.com" 
                className="inline-flex items-center gap-2 text-accent font-bold hover:underline"
                suppressHydrationWarning
              >
                <Mail size={18} />
                legal@example.com
              </a>
            </section>

          </div>
        </div>

        {/* Back Link */}
        <div className="mt-16 pt-8 border-t border-line">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-ink-500 hover:text-ink transition-colors">
            <ArrowRight size={16} />
            العودة للرئيسية
          </Link>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}