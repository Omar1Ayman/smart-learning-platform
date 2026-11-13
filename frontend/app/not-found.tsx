import Link from "next/link";
import { FileQuestion, Home, LayoutDashboard } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 py-24 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md h-[300px] bg-accent/10 blur-[100px] rounded-full pointer-events-none" />
      
      <div className="relative z-10 w-full max-w-lg text-center animate-fade-in">
        <div className="mx-auto flex items-center justify-center w-24 h-24 bg-paper-muted rounded-3xl border border-line mb-8 shadow-sm">
          <FileQuestion size={48} className="text-accent" />
        </div>
        
        <h1 className="text-6xl font-bold font-display text-ink mb-4">
          404
        </h1>
        <h2 className="text-2xl font-bold font-display text-ink mb-3">
          الصفحة غير موجودة
        </h2>
        <p className="text-ink-500 leading-relaxed mb-10 max-w-sm mx-auto">
          عذراً، الرابط الذي تحاول الوصول إليه غير صحيح أو أن الصفحة قد تم نقلها أو حذفها.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link 
            href="/" 
            className="inline-flex w-full sm:w-auto items-center justify-center rounded-xl bg-accent px-6 py-3.5 text-sm font-bold text-white transition-all hover:bg-accent-dark hover:-translate-y-0.5 shadow-lg shadow-accent/20"
          >
            <Home size={18} className="ml-2" />
            العودة للرئيسية
          </Link>
          <Link 
            href="/dashboard" 
            className="inline-flex w-full sm:w-auto items-center justify-center rounded-xl border border-line bg-paper-elevated px-6 py-3.5 text-sm font-bold text-ink transition-all hover:bg-paper-muted hover:-translate-y-0.5"
          >
            <LayoutDashboard size={18} className="ml-2" />
            لوحة التحكم
          </Link>
        </div>

        <p className="mt-10 text-sm text-ink-400">
          تحتاج مساعدة؟{" "}
          <a href="mailto:support@smart-learning.com" className="text-accent font-bold hover:underline">
            تواصل مع الدعم الفني
          </a>
        </p>
      </div>
    </main>
  );
}