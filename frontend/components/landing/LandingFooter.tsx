import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="bg-ink text-paper">
      <div className="grid max-w-6xl gap-10 px-6 py-16 mx-auto md:grid-cols-4 lg:gap-8">
        
        {/* Brand Column */}
        <div className="md:col-span-2">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 text-lg font-bold rounded-xl bg-paper text-ink shadow-sm">
              ت
            </span>
            <span className="text-xl font-bold font-display">
              منصة التعلم الذكية
            </span>
          </div>
          <p className="max-w-md mt-6 text-sm leading-relaxed text-paper/70">
            منصة تعليمية عربية متكاملة للمدارس والمراكز التعليمية والمدرسين.
            امتحانات، محتوى، طلاب، وتقارير — في مكان واحد.
          </p>
        </div>

        {/* Links Column 1 */}
        <div>
          <p className="mb-4 text-sm font-bold text-paper">المنصة</p>
          <ul className="space-y-3 text-sm text-paper/70">
            <li>
              <Link href="/#features" className="transition-colors hover:text-paper">
                المميزات
              </Link>
            </li>
            <li>
              <Link href="/#pricing" className="transition-colors hover:text-paper">
                الأسعار
              </Link>
            </li>
            <li>
              <Link href="/request-demo" className="transition-colors hover:text-paper">
                اطلب عرضًا
              </Link>
            </li>
            <li>
              <Link href="/login" className="transition-colors hover:text-paper">
                تسجيل الدخول
              </Link>
            </li>
          </ul>
        </div>

        {/* Links Column 2 */}
        <div>
          <p className="mb-4 text-sm font-bold text-paper">قانوني ودعم</p>
          <ul className="space-y-3 text-sm text-paper/70">
            <li>
              <Link href="/legal/privacy" className="transition-colors hover:text-paper">
                سياسة الخصوصية
              </Link>
            </li>
            <li>
              <Link href="/legal/terms" className="transition-colors hover:text-paper">
                شروط الاستخدام
              </Link>
            </li>
            <li>
              <a href="mailto:oa10003000@gmail.com" className="transition-colors hover:text-paper">
                تواصل معنا
              </a>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-paper/10">
        <div className="flex flex-col items-center justify-between max-w-6xl gap-4 px-6 py-6 mx-auto text-xs text-paper/50 sm:flex-row">
          <p>
            © {new Date().getFullYear()} منصة التعلم الذكية. كل الحقوق محفوظة.
          </p>
          <p className="flex items-center gap-1">
            صُنع بحب في مصر 🇪🇬 <span className="mx-1">·</span> عمر أيمن
          </p>
        </div>
      </div>
    </footer>
  );
}