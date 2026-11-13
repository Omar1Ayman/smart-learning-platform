"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";
import { ChevronDown, Search, X } from "@/components/ui/icons";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { useUrlState } from "@/lib/hooks/useUrlState";
import { GroupedSelect, type GroupedSelectGroup } from "./GroupedSelect";

// ---- Public types ----

export interface Column<T> {
  header: string;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
}

export interface FilterDef<T> {
  key: string;
  label: string;
  options?: Array<{ value: string; label: string }>;
  groups?: GroupedSelectGroup[];
  match?: (row: T, value: string) => boolean;
}

interface DataTableProps<T extends { id: string }> {
  data: T[];
  columns: Column<T>[];
  isLoading?: boolean;

  searchable?: boolean;
  searchPlaceholder?: string;
  searchPredicate?: (row: T, query: string) => boolean;

  filters?: FilterDef<T>[];
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;

  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;

  rowActions?: (row: T) => ActionMenuItem[];

  emptyState?: React.ReactNode;
}

// ---- Component ----

export function DataTable<T extends { id: string }>({
  data,
  columns,
  isLoading,
  searchable = true,
  searchPlaceholder = "ابحث...",
  searchPredicate,
  filters = [],
  filterValues = {},
  onFilterChange,
  selectable = false,
  selectedIds = new Set<string>(),
  onSelectionChange,
  rowActions,
  emptyState,
}: DataTableProps<T>) {
  const [searchRaw, setSearchUrl] = useUrlState("q", "");
  const [sortKey, setSortKey] = useUrlState("sort", "");
  const [sortDirRaw, setSortDirUrl] = useUrlState("dir", "asc");
  const sortDir: "asc" | "desc" = sortDirRaw === "desc" ? "desc" : "asc";

  const [searchInput, setSearchInput] = useState(searchRaw);
  const debouncedInput = useDebouncedValue(searchInput, 250);

  // FIX: was useMemo (side effect in render-phase). Now useEffect.
  useEffect(() => {
    if (debouncedInput !== searchRaw) setSearchUrl(debouncedInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedInput]);

  // FIX: was useMemo (side effect in render-phase). Now useEffect.
  useEffect(() => {
    if (searchRaw !== searchInput && searchRaw !== debouncedInput) {
      setSearchInput(searchRaw);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchRaw]);

  const hasActiveFilters = Object.values(filterValues).some((v) => v !== "");

  const filtered = useMemo(() => {
    let out = data;

    for (const f of filters) {
      const val = filterValues[f.key];
      if (!val) continue;
      const matcher = f.match;
      if (matcher) {
        out = out.filter((row) => matcher(row, val));
      } else {
        out = out.filter(
          (row) =>
            String((row as unknown as Record<string, unknown>)[f.key]) === val
        );
      }
    }

    const q = debouncedInput.trim().toLowerCase();
    if (q) {
      if (searchPredicate) out = out.filter((row) => searchPredicate(row, q));
      else out = out.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
    }
    if (sortKey) {
      const col = columns.find((c) => c.header === sortKey && c.sortValue);
      if (col?.sortValue) {
        out = [...out].sort((a, b) => {
          const av = col.sortValue!(a);
          const bv = col.sortValue!(b);
          if (av < bv) return sortDir === "asc" ? -1 : 1;
          if (av > bv) return sortDir === "asc" ? 1 : -1;
          return 0;
        });
      }
    }
    return out;
  }, [
    data,
    filters,
    filterValues,
    debouncedInput,
    searchPredicate,
    sortKey,
    sortDir,
    columns,
  ]);

  function toggleSort(header: string) {
    if (sortKey === header) setSortDirUrl(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(header);
      setSortDirUrl("asc");
    }
  }

  function clearAll() {
    setSearchInput("");
    setSearchUrl("");
    setSortKey("");
    setSortDirUrl("asc");
    filters.forEach((f) => onFilterChange?.(f.key, ""));
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));
  const someFilteredSelected =
    !allFilteredSelected && filtered.some((r) => selectedIds.has(r.id));

  function toggleAllFiltered() {
    if (!onSelectionChange) return;
    if (allFilteredSelected) {
      const next = new Set(selectedIds);
      filtered.forEach((r) => next.delete(r.id));
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      filtered.forEach((r) => next.add(r.id));
      onSelectionChange(next);
    }
  }

  function toggleOne(id: string) {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }

  const showToolbar = searchable || filters.length > 0;
  const hasActiveSearch = !!searchInput || hasActiveFilters || !!sortKey;

  return (
    <div className="flex flex-col gap-3">
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {searchable && (
            <div className="relative min-w-[220px] flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-400"
              />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-line bg-paper-elevated py-2 pe-9 ps-3 text-sm text-ink outline-none transition-colors focus:border-ink focus:ring-2 focus:ring-ink/10"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput("")}
                  className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink"
                  aria-label="مسح البحث"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

         {filters.map((f) => {
  // إذا كان الفلتر يحتوي على groups، استخدم GroupedSelect المخصص
  if (f.groups) {
    return (
      <div key={f.key} className="min-w-[200px]">
        <GroupedSelect
          label=""
          value={filterValues[f.key] ?? ""}
          onChange={(v) => onFilterChange?.(f.key, v)}
          groups={f.groups}
          placeholder={`كل ${f.label}`}
        />
      </div>
    );
  }

  // وإلا، استخدم select العادي
  return (
    <select
      key={f.key}
      value={filterValues[f.key] ?? ""}
      onChange={(e) => onFilterChange?.(f.key, e.target.value)}
      className="rounded-lg border border-line bg-paper-elevated px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-ink"
    >
      <option value="">كل {f.label}</option>
      {(f.options ?? []).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
})}
          {hasActiveSearch && (
            <button
              onClick={clearAll}
              className="text-xs text-ink-400 hover:text-ink"
            >
              مسح الكل
            </button>
          )}

          <div className="ms-auto text-xs text-ink-400">
            {filtered.length === data.length ? (
              <span>{data.length} عنصر</span>
            ) : (
              <span>
                {filtered.length} من {data.length}
              </span>
            )}
          </div>
        </div>
      )}

      {filtered.length === 0 && !isLoading ? (
        <div className="card p-8">
          {hasActiveSearch ? (
            <div className="text-center text-sm text-ink-400">
              <Search size={32} className="mx-auto mb-2 text-ink-300" />
              <p>لا توجد نتائج مطابقة</p>
              <button
                onClick={clearAll}
                className="mt-3 text-xs text-ink hover:underline"
              >
                مسح الفلاتر
              </button>
            </div>
          ) : (
            emptyState
          )}
        </div>
      ) : (
        <>
          {/* Mobile: card view */}
          <div className="flex flex-col gap-2 md:hidden">
            {filtered.map((row) => {
              const isSelected = selectedIds.has(row.id);
              return (
                <div
                  key={row.id}
                  className={`card p-3 ${
                    isSelected ? "ring-2 ring-accent/40" : ""
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    {selectable && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(row.id)}
                        className="h-4 w-4 cursor-pointer accent-ink"
                        aria-label="تحديد العنصر"
                      />
                    )}
                    <div className="ms-auto">
                      {rowActions && <ActionMenu items={rowActions(row)} />}
                    </div>
                  </div>
                  <dl className="flex flex-col gap-1.5">
                    {columns.map((col, i) => (
                      <div
                        key={i}
                        className="flex items-start justify-between gap-3 text-sm"
                      >
                        <dt className="shrink-0 text-xs text-ink-400">
                          {col.header}
                        </dt>
                        <dd className="min-w-0 flex-1 text-end text-ink">
                          {col.render(row)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
          </div>

          {/* Desktop: table view */}
          <div className="hidden overflow-x-auto md:block">
            <div className="card">
              <table className="w-full text-sm">
                <thead className="border-b border-line bg-paper-muted text-start text-ink">
                  <tr>
                    {selectable && (
                      <th className="w-10 px-3 py-3">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someFilteredSelected;
                          }}
                          onChange={toggleAllFiltered}
                          className="h-4 w-4 cursor-pointer accent-ink"
                          aria-label="تحديد الكل"
                        />
                      </th>
                    )}
                    {columns.map((col, i) => {
                      const sortable = !!col.sortValue;
                      const isSorted = sortKey === col.header;
                      return (
                        <th
                          key={i}
                          className={`px-4 py-3 text-start font-medium ${
                            sortable
                              ? "cursor-pointer select-none transition-colors hover:bg-paper-elevated"
                              : ""
                          }`}
                          onClick={() => sortable && toggleSort(col.header)}
                        >
                          <span className="inline-flex items-center gap-1">
                            {col.header}
                            {sortable && (
                              <ChevronDown
                                size={12}
                                className={`transition-transform ${
                                  isSorted && sortDir === "desc"
                                    ? "rotate-180"
                                    : ""
                                } ${isSorted ? "text-ink" : "text-ink-300"}`}
                              />
                            )}
                          </span>
                        </th>
                      );
                    })}
                    {rowActions && (
                      <th className="w-12 px-2 py-3" aria-label="actions" />
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const isSelected = selectedIds.has(row.id);
                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-line transition-colors last:border-0 ${
                          isSelected ? "bg-accent/10" : "hover:bg-paper-muted/50"
                        }`}
                      >
                        {selectable && (
                          <td className="w-10 px-3 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleOne(row.id)}
                              className="h-4 w-4 cursor-pointer accent-ink"
                              aria-label="تحديد العنصر"
                            />
                          </td>
                        )}
                        {columns.map((col, i) => (
                          <td key={i} className="px-4 py-3 text-ink">
                            {col.render(row)}
                          </td>
                        ))}
                        {rowActions && (
                          <td className="px-2 py-3 text-end">
                            <ActionMenu items={rowActions(row)} />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}