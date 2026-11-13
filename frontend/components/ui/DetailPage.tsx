"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Breadcrumbs, type BreadcrumbItem } from "./Breadcrumbs";
import { ErrorState, Spinner } from "./States";

// ============================================================================
// Types
// ============================================================================

interface DetailPageStat {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "default" | "success" | "warning" | "danger";
  /** If provided, the stat card becomes a clickable link. */
  href?: string;
}

interface DetailPageSection {
  key: string;
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  content: ReactNode;
}

interface DetailPageProps {
  breadcrumb?: BreadcrumbItem[];

  title: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;

  hero?: ReactNode;
  stats?: DetailPageStat[];
  sections?: DetailPageSection[];
  children?: ReactNode;

  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
}

const STAT_ACCENT: Record<NonNullable<DetailPageStat["accent"]>, string> = {
  default: "text-ink",
  success: "text-success",
  warning: "text-accent-dark",
  danger: "text-danger",
};

function statsGridCols(n: number): string {
  if (n === 1) return "grid-cols-1";
  if (n === 2) return "grid-cols-2";
  if (n === 3) return "grid-cols-2 sm:grid-cols-3";
  return "grid-cols-2 sm:grid-cols-4";
}

// ============================================================================
// Component
// ============================================================================

export function DetailPage({
  breadcrumb,
  title,
  description,
  badge,
  actions,
  hero,
  stats,
  sections,
  children,
  isLoading,
  isError,
  errorMessage = "تعذّر تحميل البيانات.",
  onRetry,
}: DetailPageProps) {
  if (isLoading) return <Spinner />;
  if (isError) return <ErrorState message={errorMessage} onRetry={onRetry} />;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      {breadcrumb && breadcrumb.length > 0 && (
        <Breadcrumbs items={breadcrumb} />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">
              {title}
            </h1>
            {badge}
          </div>
          {description && (
            <p className="mt-1.5 text-sm text-ink-500">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {hero}

      {stats && stats.length > 0 && (
        <div className={`grid gap-3 ${statsGridCols(stats.length)}`}>
          {stats.map((stat, idx) => {
            const inner = (
              <>
                <p className="text-xs text-ink-400">{stat.label}</p>
                <p
                  className={`mt-1 font-display text-2xl font-bold tabular-nums ${
                    STAT_ACCENT[stat.accent ?? "default"]
                  }`}
                >
                  {stat.value}
                </p>
                {stat.hint && (
                  <p className="mt-0.5 text-xs text-ink-400">{stat.hint}</p>
                )}
              </>
            );

            if (stat.href) {
              return (
                <Link
                  key={idx}
                  href={stat.href}
                  className="card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
                >
                  {inner}
                </Link>
              );
            }
            return (
              <div key={idx} className="card p-4">
                {inner}
              </div>
            );
          })}
        </div>
      )}

      {sections?.map((section) => (
        <section key={section.key} className="card p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
              {section.icon}
              {section.title}
            </h2>
            {section.action}
          </div>
          {section.content}
        </section>
      ))}

      {children}
    </div>
  );
}