import Link from "next/link";
import { ArrowLeft, CreditCard, GraduationCap, Users } from "lucide-react";
import { SecuritySettings } from "@/components/settings/SecuritySettings";

const PLATFORM_CONTROLS = [
  {
    href: "/platform/billing#plans",
    title: "الباقات والأسعار",
    description:
      "أنشئ الباقات وعدّل الأسعار والميزات، وانشرها أو أخفها من صفحة الأسعار العامة.",
    icon: <CreditCard size={20} />,
  },
  {
    href: "/platform/tenants",
    title: "المؤسسات والاشتراكات",
    description: "راجع المؤسسات وحالاتها واشتراكاتها التجريبية والفعّالة.",
    icon: <GraduationCap size={20} />,
  },
  {
    href: "/platform/users",
    title: "مستخدمو المنصة",
    description: "راجع حسابات المستخدمين وحالة تفعيلها عبر المؤسسات.",
    icon: <Users size={20} />,
  },
];

export default function PlatformSettingsPage() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">
          إعدادات المنصة
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          إدارة حسابك وأمانه، والوصول السريع إلى أدوات التحكم العامة.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        {PLATFORM_CONTROLS.map((control) => (
          <Link
            key={control.href}
            href={control.href}
            className="card group flex items-start gap-4 p-5 transition-colors hover:border-ink/30"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-50 text-ink-600">
              {control.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2 font-bold text-ink">
                {control.title}
                <ArrowLeft
                  size={16}
                  className="shrink-0 text-ink-400 transition-transform group-hover:-translate-x-1"
                />
              </span>
              <span className="mt-1 block text-xs leading-5 text-ink-400">
                {control.description}
              </span>
            </span>
          </Link>
        ))}
      </section>

      <SecuritySettings />
    </div>
  );
}
