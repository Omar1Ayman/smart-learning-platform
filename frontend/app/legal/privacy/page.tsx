import Link from "next/link";
import { 
  ShieldCheck, ArrowRight, Lock, Database, Share2, 
  UserCheck, Cookie, Mail, CheckCircle2 // <-- ADDED CheckCircle2 HERE
} from "lucide-react";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingNavbar } from "@/components/landing/LandingNavbar";

const SECTIONS = [
  { id: "who-we-are", title: "1. من نحن" },
  { id: "data-collect", title: "2. البيانات التي نجمعها" },
  { id: "data-use", title: "3. كيف نستخدم البيانات" },
  { id: "data-isolation", title: "4. عزل البيانات" },
  { id: "third-party", title: "5. مشاركة البيانات" },
  { id: "security", title: "6. الأمان" },
  { id: "rights", title: "7. حقوقك" },
  { id: "cookies", title: "8. الكوكيز" },
  { id: "changes", title: "9. التغييرات" },
  { id: "contact", title: "10. التواصل" },
];

export default function PrivacyPage() {
  const lastUpdated = new Date().toLocaleDateString("ar-EG", { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen bg-paper">
      <LandingNavbar />
      
      <main className="mx-auto max-w-6xl px-6 py-16 lg:py-24">
        
        {/* Header */}
        <div className="max-w-3xl mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-success/10 text-success text-xs font-bold mb-4">
            <ShieldCheck size={14} />
            الخصوصية والأمان
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-ink mb-4">
            سياسة الخصوصية
          </h1>
          <p className="text-ink-500 flex items-center gap-2">
            آخر تحديث: <span className="font-bold text-ink">{lastUpdated}</span>
          </p>
        </div>

        {/* TL;DR Summary Box */}
        <div className="mb-16 p-6 md:p-8 rounded-2xl bg-success/5 border border-success/20">
          <h3 className="flex items-center gap-2 text-lg font-bold text-success mb-3">
            <ShieldCheck size={20} />
            باختصار (الملخص)
          </h3>
          <p className="text-ink-700 leading-relaxed">
            نحن لا نبيع بياناتك أبداً. بيانات كل مؤسسة معزولة تماماً ولا يمكن لأي مدرسة رؤية بيانات مدرسة أخرى. 
            نستخدم التشفير لحماية بياناتك، والطلاب وأولياء الأمور لهم الحق الكامل في الوصول لبياناتهم أو حذفها.
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
            
            <section id="who-we-are" className="scroll-mt-24">
              <h2 className="mb-4 font-display text-2xl font-bold text-ink">1. من نحن</h2>
              <p className="leading-relaxed text-ink-600">
                منصة التعلم الذكية هي منصة تعليمية عربية متعددة المستأجرين (Multi-tenant) تخدم المدارس والمراكز التعليمية والمدرسين الأفراد. نحن ملتزمون بحماية خصوصية جميع مستخدمينا — سواء كانوا إداريين، معلمين، طلابًا، أو أولياء أمور.
              </p>
            </section>

            <section id="data-collect" className="scroll-mt-24">
              <h2 className="mb-4 font-display text-2xl font-bold text-ink">2. البيانات التي نجمعها</h2>
              <ul className="space-y-4">
                {[
                  { title: "بيانات الحساب", desc: "الاسم، البريد الإلكتروني، رقم الهاتف." },
                  { title: "بيانات المؤسسة", desc: "اسم المدرسة/المركز، الشعار، الألوان." },
                  { title: "بيانات تعليمية", desc: "التسجيلات، الدرجات، الإجابات، المحتوى." },
                  { title: "بيانات الاستخدام", desc: "الصفحات المزارة، الأخطاء، الأجهزة." }
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Database size={18} className="text-accent shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-ink">{item.title}: </span>
                      <span className="text-ink-600">{item.desc}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section id="data-use" className="scroll-mt-24">
              <h2 className="mb-4 font-display text-2xl font-bold text-ink">3. كيف نستخدم البيانات</h2>
              <ul className="space-y-3">
                {[
                  "تقديم الخدمة وتحسينها",
                  "التواصل معك بشأن حسابك",
                  "تقديم الدعم الفني",
                  "الالتزام بالمتطلبات القانونية",
                  "إجراءات أمنية ومنع الاحتيال"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle2 size={18} className="text-success shrink-0 mt-0.5" />
                    <span className="text-ink-600">{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section id="data-isolation" className="scroll-mt-24">
              <h2 className="mb-4 font-display text-2xl font-bold text-ink">4. عزل البيانات بين المؤسسات</h2>
              <div className="p-5 rounded-xl bg-paper-muted border border-line">
                <p className="flex items-start gap-3 text-ink-700 leading-relaxed">
                  <Lock size={20} className="text-ink-500 shrink-0 mt-0.5" />
                  كل مؤسسة (مدرسة، مركز، مدرس) لها بيانات معزولة تمامًا. مدرسة لا تستطيع رؤية بيانات مدرسة أخرى. كل طلب يتحقق من انتماء المستخدم للمؤسسة قبل الوصول لأي بيانات.
                </p>
              </div>
            </section>

            <section id="third-party" className="scroll-mt-24">
              <h2 className="mb-4 font-display text-2xl font-bold text-ink">5. مشاركة البيانات مع أطراف ثالثة</h2>
              <p className="mb-4 leading-relaxed text-ink-600">
                نحن لا نبيع بياناتك. قد نشارك البيانات فقط مع:
              </p>
              <ul className="space-y-3">
                {[
                  "مزودي الخدمات التقنية (استضافة، بريد إلكتروني)",
                  "الجهات القانونية عند الطلب الرسمي",
                  "بموافقتك الصريحة"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Share2 size={18} className="text-ink-400 shrink-0 mt-0.5" />
                    <span className="text-ink-600">{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section id="security" className="scroll-mt-24">
              <h2 className="mb-4 font-display text-2xl font-bold text-ink">6. الأمان</h2>
              <p className="leading-relaxed text-ink-600">
                نستخدم تشفير HTTPS لكل الاتصالات، تشفير كلمات المرور بـ bcrypt، رموز وصول قصيرة العمر، ملفات تعريف httpOnly، وسجلات تدقيق لكل إجراء حساس. البيانات محفوظة في خوادم آمنة مع نسخ احتياطية يومية.
              </p>
            </section>

            <section id="rights" className="scroll-mt-24">
              <h2 className="mb-4 font-display text-2xl font-bold text-ink">7. حقوقك</h2>
              <ul className="space-y-3">
                {[
                  "الوصول إلى بياناتك وتنزيلها",
                  "تصحيح أي بيانات خاطئة",
                  "حذف حسابك وبياناتك",
                  "الاعتراض على استخدام بياناتك لأغراض تسويقية"
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <UserCheck size={18} className="text-accent shrink-0 mt-0.5" />
                    <span className="text-ink-600">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-ink-600">لممارسة أي من هذه الحقوق، تواصل معنا عبر البريد الإلكتروني.</p>
            </section>

            <section id="cookies" className="scroll-mt-24">
              <h2 className="mb-4 font-display text-2xl font-bold text-ink">8. الكوكيز</h2>
              <div className="flex items-start gap-3 p-5 rounded-xl border border-line">
                <Cookie size={20} className="text-ink-500 shrink-0 mt-0.5" />
                <p className="leading-relaxed text-ink-600">
                  نستخدم كوكيز أساسية فقط لجلسة تسجيل الدخول (httpOnly، آمنة، SameSite). لا نستخدم كوكيز تتبع أو إعلانات.
                </p>
              </div>
            </section>

            <section id="changes" className="scroll-mt-24">
              <h2 className="mb-4 font-display text-2xl font-bold text-ink">9. التغييرات على هذه السياسة</h2>
              <p className="leading-relaxed text-ink-600">
                قد نُحدّث هذه السياسة من حين لآخر. التغييرات الجوهرية سيتم إشعارك بها عبر البريد الإلكتروني قبل 30 يومًا من التطبيق.
              </p>
            </section>

            <section id="contact" className="scroll-mt-24 pt-8 border-t border-line">
              <h2 className="mb-4 font-display text-2xl font-bold text-ink">10. التواصل</h2>
              <p className="mb-4 leading-relaxed text-ink-600">
                لأي استفسار بخصوص الخصوصية، تواصل معنا عبر:
              </p>
              {/* Added suppressHydrationWarning to ignore browser extension interference */}
              <a 
                href="mailto:privacy@example.com" 
                className="inline-flex items-center gap-2 text-accent font-bold hover:underline"
                suppressHydrationWarning
              >
                <Mail size={18} />
                privacy@example.com
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