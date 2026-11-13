"use client";

import { useEffect, useState } from "react";

/** Returns a delayed copy of `value`. Useful for search inputs — the
 *  returned value only updates after `delayMs` of stability, so we don't
 *  refilter/refetch on every keystroke. */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}