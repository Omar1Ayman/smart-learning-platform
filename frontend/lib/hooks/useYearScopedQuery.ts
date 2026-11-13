"use client";

import { useCallback } from "react";
import { useActiveYearStore } from "./useActiveYear";

/**
 * Wrap a list API function to auto-inject `academic_year`.
 *
 * The type signature is intentionally loose on the base function's
 * parameter type: it only requires that `academic_year` is accepted.
 * Callers can pass any extra params (page, search, group, ...).
 */
type BaseQueryFn<P, R> = (params: P) => Promise<R>;

export function useYearScopedQuery<P extends { academic_year?: string }, R>(
  baseFn: BaseQueryFn<P, R>
): {
  queryFn: (params: Omit<P, "academic_year">) => Promise<R>;
  enabled: boolean;
} {
  const activeYearId = useActiveYearStore((s) => s.activeYearId);

  const queryFn = useCallback(
    (params: Omit<P, "academic_year">) =>
      baseFn({ ...params, academic_year: activeYearId } as unknown as P),
    [activeYearId, baseFn]
  );

  return { queryFn, enabled: !!activeYearId };
}