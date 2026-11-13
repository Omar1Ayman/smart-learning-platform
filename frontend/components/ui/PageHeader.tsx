"use client";

import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Optional breadcrumb elements shown above the title. */
  breadcrumb?: ReactNode;
  /** Actions (buttons, links) shown on the trailing edge on desktop. */
  actions?: ReactNode;
  /** Small badge/tag rendered inline after the title. */
  badge?: ReactNode;
}

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  badge,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      {breadcrumb && <div>{breadcrumb}</div>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}