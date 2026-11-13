"use client";

import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

/**
 * Simple, RTL-friendly breadcrumbs. The last item is rendered as plain text
 * (the current page); earlier items are links. Uses `chevron-left` as the
 * separator because we're in RTL — the visual "back" direction is right-to-left.
 */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="breadcrumb" className="text-sm text-ink-500">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={idx} className="flex items-center gap-1.5">
              {idx > 0 && (
                <span className="text-ink-300" aria-hidden="true">
                  ‹
                </span>
              )}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="rounded-md px-1 py-0.5 transition-colors hover:text-ink hover:bg-paper-muted"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={isLast ? "font-medium text-ink" : ""}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}