"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useAuthStore } from "@/lib/auth/store";

const LINKS = [
  { href: "/#features", label: "المميزات" },
  { href: "/#how-it-works", label: "كيف تعمل" },
  { href: "/#pricing", label: "الأسعار" },
  { href: "/#faq", label: "الأسئلة الشائعة" },
];

export function LandingNavbar() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const status = useAuthStore((s) => s.status);
  const isPlatformAdmin = useAuthStore((s) => s.user?.is_platform_admin ?? false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(isPlatformAdmin ? "/platform" : "/dashboard");
    }
  }, [isPlatformAdmin, router, status]);

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b transition-colors ${
        scrolled
          ? "border-line bg-paper-elevated/90 backdrop-blur-md shadow-sm"
          : "border-transparent bg-paper/80 backdrop-blur-sm"
      }`}
    >
      <div className="flex items-center justify-between max-w-6xl gap-4 px-6 py-4 mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid w-8 h-8 text-sm font-bold rounded-lg place-items-center bg-ink text-paper">
            ت
          </span>
          <span className="text-base font-bold font-display text-ink">
            منصة التعلم الذكية
          </span>
        </Link>

        <nav className="items-center hidden gap-6 md:flex">
          {LINKS.map((l) => (
            <Link 
              key={l.href} 
              href={l.href} 
              className="text-sm font-medium text-ink-700 hover:text-ink transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {status === "anonymous" && (
            <Link
              href="/login"
              className="hidden text-sm font-medium text-ink-700 hover:text-ink md:inline-block"
            >
              تسجيل الدخول
            </Link>
          )}
          <Link
            href="/request-demo"
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white transition-colors rounded-lg bg-accent hover:bg-accent-dark"
          >
            اطلب عرضًا
          </Link>
          <button
            type="button"
            aria-label={mobileMenuOpen ? "إغلاق القائمة" : "فتح القائمة"}
            aria-expanded={mobileMenuOpen}
            aria-controls="landing-mobile-navigation"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="grid h-10 w-10 place-items-center rounded-lg text-ink hover:bg-ink-50 md:hidden"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {mobileMenuOpen && (
        <nav
          id="landing-mobile-navigation"
          className="border-t border-line bg-paper-elevated px-6 py-3 md:hidden"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-1">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50"
              >
                {link.label}
              </Link>
            ))}
            {status === "anonymous" && (
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50"
              >
                تسجيل الدخول
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}