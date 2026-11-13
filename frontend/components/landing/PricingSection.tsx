"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Star } from "lucide-react";
import { listPublicPlans, type Plan } from "@/lib/api/billing";

type BillingCycle = "monthly" | "yearly";

const FEATURE_LABELS: Record<string, string> = {
  bulk_grading: "تصحيح جماعي",
  advanced_analytics: "تقارير وتحليلات متقدمة",
  parent_portal: "بوابة ولي الأمر",
  custom_branding: "هوية بصرية مخصصة",
  bulk_import: "استيراد جماعي للبيانات",
  attendance: "إدارة الحضور",
  api_access: "الوصول إلى API",
  priority_support: "دعم فني بأولوية",
};

function formatCurrency(value: string, currency: string): string {
  return new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function getHighlights(plan: Plan): string[] {
  const highlights: string[] = [];

  if (plan.limits.max_students !== null) {
    highlights.push(`حتى ${plan.limits.max_students} طالب`);
  } else {
    highlights.push("عدد طلاب غير محدود");
  }

  if (plan.limits.max_teachers !== null) {
    highlights.push(`حتى ${plan.limits.max_teachers} معلم`);
  } else {
    highlights.push("عدد معلمين غير محدود");
  }

  if (plan.limits.max_assessments_per_month !== null) {
    highlights.push(
      `حتى ${plan.limits.max_assessments_per_month} امتحان شهريًا`
    );
  } else {
    highlights.push("امتحانات غير محدودة");
  }

  if (plan.limits.max_storage_mb !== null) {
    const storage =
      plan.limits.max_storage_mb >= 1024
        ? `${new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 1 }).format(
            plan.limits.max_storage_mb / 1024
          )} جيجابايت`
        : `${plan.limits.max_storage_mb} ميجابايت`;
    highlights.push(`${storage} مساحة تخزين`);
  } else {
    highlights.push("مساحة تخزين غير محدودة");
  }

  for (const [key, enabled] of Object.entries(plan.features)) {
    if (enabled && FEATURE_LABELS[key]) {
      highlights.push(FEATURE_LABELS[key]);
    }
  }

  return highlights;
}

export function PricingSection() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const plansQuery = useQuery({
    queryKey: ["billing", "public-plans"],
    queryFn: listPublicPlans,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <section
      id="pricing"
      className="scroll-mt-24 border-y border-line bg-paper-muted/50 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="text-sm font-semibold text-accent">الأسعار</p>
          <h2 className="mt-3 font-display text-3xl font-bold text-ink sm:text-4xl">
            أسعار واضحة، بدون مفاجآت
          </h2>
          <p className="mt-4 text-sm leading-7 text-ink-500 sm:text-base">
            اختر الباقة المناسبة لحجم مؤسستك. الأسعار والميزات محدثة من كتالوج
            الاشتراكات.
          </p>
          <div
            className="mt-6 inline-flex rounded-xl border border-line bg-paper-elevated p-1"
            aria-label="دورة الفوترة"
          >
            {(["monthly", "yearly"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={cycle === value}
                onClick={() => setCycle(value)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  cycle === value
                    ? "bg-ink text-white dark:bg-accent dark:text-[#111827]"
                    : "text-ink-500 hover:text-ink"
                }`}
              >
                {value === "monthly" ? "شهري" : "سنوي"}
              </button>
            ))}
          </div>
        </div>

        {plansQuery.isPending && (
          <p className="py-12 text-center text-sm text-ink-500" aria-live="polite">
            جارٍ تحميل الباقات...
          </p>
        )}

        {plansQuery.isError && (
          <div className="rounded-2xl border border-danger/20 bg-danger/5 p-6 text-center">
            <p className="text-sm text-danger" role="alert">
              تعذّر تحميل الأسعار حاليًا. يمكنك التواصل معنا لمعرفة تفاصيل
              الاشتراك.
            </p>
            <button
              type="button"
              onClick={() => void plansQuery.refetch()}
              disabled={plansQuery.isFetching}
              className="mt-4 inline-flex rounded-lg border border-line bg-paper-elevated px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
            >
              {plansQuery.isFetching ? "جارٍ إعادة المحاولة..." : "إعادة المحاولة"}
            </button>
            <Link
              href="/request-demo"
              className="mt-4 inline-flex rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white"
            >
              تواصل معنا
            </Link>
          </div>
        )}

        {plansQuery.isSuccess && plansQuery.data.length === 0 && (
          <p className="py-12 text-center text-sm text-ink-500">
            لا توجد باقات متاحة حاليًا. تواصل معنا لمعرفة الخيارات المتوفرة.
          </p>
        )}

        {plansQuery.isSuccess && plansQuery.data.length > 0 && (
          <div className="grid items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {plansQuery.data.map((plan) => {
              const isFeatured = plan.key === "pro";
              const price =
                cycle === "yearly" ? plan.price_yearly : plan.price_monthly;
              const amount = Number(price);
              const discount =
                cycle === "yearly" &&
                Number(plan.price_monthly) > 0 &&
                amount < Number(plan.price_monthly) * 12
                  ? Math.round(
                      (1 - amount / (Number(plan.price_monthly) * 12)) * 100
                    )
                  : 0;

              return (
                <article
                  key={plan.id}
                  className={`relative flex flex-col rounded-2xl border p-6 transition-all sm:p-7 ${
                    isFeatured
                      ? "border-ink bg-ink text-paper shadow-xl"
                      : "border-line bg-paper-elevated text-ink hover:-translate-y-1 hover:shadow-card-hover"
                  }`}
                >
                  {isFeatured && (
                    <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-accent px-3 py-1 text-xs font-bold text-white">
                      <Star size={12} fill="currentColor" />
                      الأكثر اختيارًا
                    </span>
                  )}

                  <h3 className="text-xl font-bold font-display">{plan.name}</h3>
                  <p
                    className={`mt-2 min-h-12 text-sm leading-6 ${
                      isFeatured ? "text-paper/70" : "text-ink-500"
                    }`}
                  >
                    {plan.description}
                  </p>

                  <div className="mt-6">
                    <p className="text-3xl font-bold font-display">
                      {amount === 0 ? "مجانًا" : formatCurrency(price, plan.currency)}
                    </p>
                    <p
                      className={`mt-1 text-xs ${
                        isFeatured ? "text-paper/60" : "text-ink-400"
                      }`}
                    >
                      {amount === 0
                        ? "لا توجد رسوم اشتراك"
                        : cycle === "monthly"
                          ? "للمؤسسة شهريًا"
                          : "إجمالي الاشتراك السنوي"}
                      {discount > 0 && ` · وفر ${discount}%`}
                    </p>
                  </div>

                  <ul
                    className={`mt-6 flex-1 space-y-3 text-sm ${
                      isFeatured ? "text-paper/90" : "text-ink-600"
                    }`}
                  >
                    {getHighlights(plan).map((highlight) => (
                      <li key={highlight} className="flex items-start gap-2.5">
                        <Check
                          size={17}
                          className={`mt-0.5 shrink-0 ${
                            isFeatured ? "text-accent" : "text-success"
                          }`}
                          aria-hidden="true"
                        />
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/request-demo"
                    className={`mt-8 inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-3 text-sm font-bold transition-colors ${
                      isFeatured
                        ? "bg-accent text-white hover:bg-accent-dark"
                        : "border border-line bg-paper text-ink hover:bg-paper-muted"
                    }`}
                  >
                    استفسر عن الباقة
                  </Link>
                </article>
              );
            })}
          </div>
        )}

        <p className="mt-8 text-center text-xs text-ink-400">
          الاشتراك والدفع يتمان بالتنسيق مع فريقنا حاليًا؛ لا تتوفر مدفوعات
          إلكترونية مباشرة بعد.
        </p>
      </div>
    </section>
  );
}
