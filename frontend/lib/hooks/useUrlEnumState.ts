"use client";

import { useUrlState } from "@/lib/hooks/useUrlState";

/**
 * Wave D0c-2b — strongly-typed URL state for enum-like filters.
 *
 * Wraps `useUrlState` (which is typed as `string`) and narrows the value
 * to `T` by validating it against a whitelist. Invalid URL values (a
 * user typing `?status=FOO`) fall back to `defaultValue` instead of
 * crashing the page or sending garbage to the API.
 *
 * Usage:
 *   const [status, setStatus] = useUrlEnumState(
 *     "status",
 *     ["ALL", "ACTIVE", "COMPLETED"] as const,
 *     "ALL"
 *   );
 *   // status: "ALL" | "ACTIVE" | "COMPLETED"
 */
export function useUrlEnumState<T extends string>(
  key: string,
  allowed: readonly T[],
  defaultValue: T
): [T, (v: T) => void] {
  const [raw, setRaw] = useUrlState(key, defaultValue);
  const value = (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : defaultValue;
  return [value, setRaw];
}