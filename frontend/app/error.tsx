"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 py-24 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md h-[300px] bg-danger/10 blur-[100px] rounded-full pointer-events-none" />
      
      <div className="relative z-10 w-full max-w-lg text-center animate-fade-in">
        <div className="mx-auto flex items-center justify-center w-24 h-24 bg-danger/10 rounded-3xl border border-danger/20 mb-8 shadow-sm">
          <AlertTriangle size={48} className="text-danger" />
        </div>
        
        <h1 className="text-3xl font-bold font-display text-ink mb-3">
          حدث خطأ غير متوقع
        </h1>
        <p className="text-ink-500 leading-relaxed mb-6 max-w-sm mx-auto">
          نعتذر عن هذا. واجه النظام مشكلة أثناء محاولة تحميل الصفحة. الفريق التقني تم إبلاغه تلقائياً.
        </p>

        {error.digest && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-paper-muted border border-line mb-8">
            <ShieldAlert size={14} className="text-ink-400" />
            <span className="text-xs text-ink-500 font-medium">رمز الخطأ للدعم الفني: </span>
            <code className="text-xs font-mono font-bold text-ink">{error.digest}</code>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button 
            onClick={reset} 
            className="w-full sm:w-auto h-12 px-8 rounded-xl font-bold shadow-lg shadow-accent/20 hover:-translate-y-0.5"
          >
            <RefreshCw size={18} className="ml-2" />
            إعادة المحاولة
          </Button>
          <Link 
            href="/" 
            className="inline-flex w-full sm:w-auto h-12 items-center justify-center rounded-xl border border-line bg-paper-elevated px-8 text-sm font-bold text-ink transition-all hover:bg-paper-muted hover:-translate-y-0.5"
          >
            <Home size={18} className="ml-2" />
            العودة للرئيسية
          </Link>
        </div>

        <p className="mt-10 text-sm text-ink-400">
          استمرت المشكلة؟{" "}
          <a href="mailto:support@smart-learning.com" className="text-accent font-bold hover:underline">
            تواصل مع الدعم الفني
          </a>
        </p>
      </div>
    </main>
  );
}