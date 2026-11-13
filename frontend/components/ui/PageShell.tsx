"use client";

import type { ReactNode } from "react";
import { EmptyState, ErrorState } from "./States";
import { Pagination } from "./Pagination";
import { TableSkeleton } from "./Skeleton";
import { PageHeader } from "./PageHeader";

interface PaginationConfig {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

interface PageShellProps {
  /** Page header */
  title: string;
  description?: string;
  badge?: ReactNode;
  breadcrumb?: ReactNode;
  actions?: ReactNode;

  /** State handling */
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyIcon?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;

  /** Optional pagination */
  pagination?: PaginationConfig;

  /** Loading variant */
  loadingVariant?: "table" | "cards" | "custom";
  loadingContent?: ReactNode;

  /** The list/grid itself */
  children: ReactNode;
}

/**
 * Unified list page wrapper.
 *
 * Every list page currently reimplements: header, loading, error, empty,
 * pagination. That's 5 concerns × ~15 pages = 75 places to get consistent.
 * This component makes it 1 place.
 *
 * Usage:
 *   <PageShell title="..." description="..." actions={...}
 *     isLoading={q.isLoading} isError={q.isError} onRetry={q.refetch}
 *     isEmpty={items.length === 0} emptyAction={<Button>+ إضافة</Button>}
 *     pagination={{page, totalPages, totalItems, pageSize, onPageChange}}>
 *     {items.map(...)}
 *   </PageShell>
 */
export function PageShell({
  title,
  description,
  badge,
  breadcrumb,
  actions,
  isLoading,
  isError,
  errorMessage = "تعذّر تحميل البيانات.",
  onRetry,
  isEmpty,
  emptyIcon = "📭",
  emptyTitle = "لا توجد بيانات",
  emptyDescription,
  emptyAction,
  pagination,
  loadingVariant = "table",
  loadingContent,
  children,
}: PageShellProps) {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={title}
        description={description}
        badge={badge}
        breadcrumb={breadcrumb}
        actions={actions}
      />

      {/* Content area */}
      {isError ? (
        <ErrorState message={errorMessage} onRetry={onRetry} />
      ) : isLoading ? (
        loadingVariant === "custom" ? (
          <>{loadingContent}</>
        ) : loadingVariant === "table" ? (
          <TableSkeleton rows={6} cols={4} />
        ) : (
          <TableSkeleton rows={4} cols={3} />
        )
      ) : isEmpty ? (
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      ) : (
        <>
          {children}
          {pagination && (
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              pageSize={pagination.pageSize}
              onPageChange={pagination.onPageChange}
              isLoading={pagination.isLoading}
            />
          )}
        </>
      )}
    </div>
  );
}