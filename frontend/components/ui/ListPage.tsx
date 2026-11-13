"use client";

import type { ReactNode } from "react";
import { Search, X } from "./icons";
import { PageShell } from "./PageShell";
import { EmptyStateV3 } from "./EmptyStateV3";

// ============================================================================
// Types
// ============================================================================

export interface ListPageTab {
  key: string;
  label: string;
  count?: number;
}

export interface ListPageFilter {
  key: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

export interface ListPagePagination {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

interface ListPageProps {
  // Header
  title: string;
  description?: string;
  badge?: ReactNode;
  breadcrumb?: ReactNode;
  actions?: ReactNode;

  // Tabs (optional)
  tabs?: ListPageTab[];
  activeTab?: string;
  onTabChange?: (key: string) => void;

  // Filters (optional)
  searchable?: boolean;
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  filters?: ListPageFilter[];
  hasActiveFilter?: boolean;
  onClearFilters?: () => void;

  // Bulk selection bar
  bulkBar?: ReactNode;

  // States
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;

  // Empty state
  isEmpty?: boolean;
  emptyVariant?: "no-data" | "no-results";
  emptyIcon?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;

  // Pagination
  pagination?: ListPagePagination;

  // Content
  children: ReactNode;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Unified ListPage wrapper.
 *
 * يوفّر:
 *   - Header (title + description + actions)
 *   - Tabs (optional)
 *   - Toolbar (search + filters + clear)
 *   - Loading / Error / Empty states
 *   - Pagination
 *
 * صفحة كاملة في ~15 سطر:
 *
 *   <ListPage
 *     title="الطلاب"
 *     description={`${total} طالب`}
 *     actions={<Button>+ إضافة طالب</Button>}
 *     searchValue={search}
 *     onSearchChange={setSearch}
 *     isLoading={q.isLoading}
 *     isError={q.isError}
 *     onRetry={q.refetch}
 *     isEmpty={items.length === 0}
 *     emptyAction={<Button>+ إضافة طالب</Button>}
 *     pagination={...}
 *   >
 *     {items.map(s => <StudentCard ... />)}
 *   </ListPage>
 */
export function ListPage({
  title,
  description,
  badge,
  breadcrumb,
  actions,
  tabs,
  activeTab,
  onTabChange,
  searchable = true,
  searchValue = "",
  searchPlaceholder = "ابحث...",
  onSearchChange,
  filters = [],
  hasActiveFilter,
  onClearFilters,
  bulkBar,
  isLoading,
  isError,
  errorMessage = "تعذّر تحميل البيانات.",
  onRetry,
  isEmpty,
  emptyVariant,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  pagination,
  children,
}: ListPageProps) {
  const hasSearch = searchable && !!onSearchChange;
  const hasFilters = filters.length > 0;
  const showToolbar = hasSearch || hasFilters;
const activeFilterCount =
  (searchValue ? 1 : 0) + filters.filter((f) => f.value).length;
const showClearButton =
  !!onClearFilters && (hasActiveFilter || activeFilterCount > 0);

  // اختيار variant الـ empty تلقائيًا
  const resolvedEmptyVariant: "no-data" | "no-results" =
    emptyVariant ?? (activeFilterCount > 0 ? "no-results" : "no-data");

  // Pagination يظهر فقط لو مش empty
  const visiblePagination = !isEmpty && !isLoading && !isError ? pagination : undefined;

  return (
    <>
      {bulkBar}

      <PageShell
        title={title}
        description={description}
        badge={badge}
        breadcrumb={breadcrumb}
        actions={actions}
        isLoading={isLoading}
        isError={isError}
        errorMessage={errorMessage}
        onRetry={onRetry}
        pagination={visiblePagination}
      >
        {/* ── Tabs ─────────────────────────────────────────── */}
        {tabs && tabs.length > 0 && onTabChange && (
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const isActive = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => onTabChange(tab.key)}
                  aria-pressed={isActive}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 ${
                    isActive
                      ? "bg-ink text-white dark:bg-accent dark:text-[#111827]"
                      : "bg-paper-muted text-ink hover:bg-paper-elevated"
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && (
                    <span
                      className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-paper-elevated text-ink"
                      }`}
                    >
                      {tab.count > 99 ? "99+" : tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Toolbar: search + filters ────────────────────── */}
        {showToolbar && (
          <div className="flex flex-wrap items-center gap-2">
            {hasSearch && (
              <div className="relative min-w-[240px] flex-1">
                <Search
                  size={16}
                  className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-400"
                />
                <input
                  type="text"
                  value={searchValue}
                  onChange={(e) => onSearchChange?.(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-lg border border-line bg-paper-elevated py-2 pe-9 ps-3 text-sm text-ink outline-none transition-colors focus:border-ink focus:ring-2 focus:ring-ink/10"
                />
                {searchValue && (
                  <button
                    type="button"
                    onClick={() => onSearchChange?.("")}
                    className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink"
                    aria-label="مسح البحث"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}

            {hasFilters &&
              filters.map((filter) => (
                <select
                  key={filter.key}
                  value={filter.value}
                  onChange={(e) => filter.onChange(e.target.value)}
                  className="rounded-lg border border-line bg-paper-elevated px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-ink"
                  aria-label={filter.label}
                >
                  <option value="">كل {filter.label}</option>
                  {filter.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ))}

            {showClearButton && (
              <button
                type="button"
                onClick={onClearFilters}
                className="text-xs text-ink-400 transition-colors hover:text-ink"
              >
                مسح الكل
              </button>
            )}
          </div>
        )}

        {/* ── Content or Empty ─────────────────────────────── */}
        {isEmpty && !isLoading && !isError ? (
          <EmptyStateV3
            variant={resolvedEmptyVariant}
            icon={emptyIcon}
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
          />
        ) : (
          children
        )}
      </PageShell>
    </>
  );
}