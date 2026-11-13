"use client";

import Link from "next/link";
import type { ReactNode } from "react";

interface FormPageProps {
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
}

const MAX_WIDTH: Record<NonNullable<FormPageProps["maxWidth"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
};

/**
 * Unified FormPage — صفحة نموذج كاملة.
 *
 *   <FormPage
 *     title="إضافة طالب"
 *     description="أضف طالبًا جديدًا لمؤسستك"
 *     backHref="/students"
 *     backLabel="الطلاب"
 *   >
 *     <UserForm ... />
 *   </FormPage>
 */
export function FormPage({
  title,
  description,
  backHref,
  backLabel = "رجوع",
  children,
  maxWidth = "2xl",
}: FormPageProps) {
  return (
    <div className={`mx-auto flex flex-col gap-6 ${MAX_WIDTH[maxWidth]}`}>
      {/* Back link */}
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-1 text-sm text-ink-400 transition-colors hover:text-ink"
        >
          ← {backLabel}
        </Link>
      )}

      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-ink-400">{description}</p>
        )}
      </div>

      {/* Form container */}
      <div className="card p-6">{children}</div>
    </div>
  );
}