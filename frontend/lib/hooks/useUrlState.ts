"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Sync a state value with a URL query parameter.
 *
 * FIX (hydration mismatch): The previous version read `window.location.search`
 * inside the lazy useState initializer. On SSR that returns `defaultValue`,
 * on the client's first render it returns the URL value. Different values
 * on server and client = React hydration warning + visible flicker.
 *
 * Now: initialize to `defaultValue` on BOTH server and client (matches SSR
 * output exactly), then synchronize from the URL in a mount effect. One
 * extra paint with the default value, but zero hydration warnings.
 *
 * Everything else unchanged:
 *   - `setValue("")` removes the query param entirely.
 *   - `setValue(fn)` supports functional updates (batched-safe via ref).
 *   - `popstate` listener keeps UI in sync on back/forward.
 *   - `replaceState` (not pushState) so filters don't spam browser history.
 */
export function useUrlState(
  key: string,
  defaultValue = ""
): [string, (v: string | ((prev: string) => string)) => void] {
  // Always start with defaultValue — matches SSR output.
  const [value, setValueState] = useState<string>(defaultValue);

  // Batched-safe mirror: functional updates read the freshest value even
  // when several setValue calls land in the same render cycle.
  const valueRef = useRef(defaultValue);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // After mount only, read the actual URL and sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const urlValue = params.get(key) ?? defaultValue;
    setValueState((prev) => (prev === urlValue ? prev : urlValue));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only

  // Sync on back/forward navigation.
  useEffect(() => {
    function syncFromUrl() {
      const params = new URLSearchParams(window.location.search);
      setValueState(params.get(key) ?? defaultValue);
    }
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [key, defaultValue]);

  const setValue = useCallback(
    (v: string | ((prev: string) => string)) => {
      const next = typeof v === "function" ? v(valueRef.current) : v;
      valueRef.current = next;
      setValueState(next);

      const url = new URL(window.location.href);
      if (next === defaultValue || next === "") {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, next);
      }
      window.history.replaceState({}, "", url.toString());
    },
    [key, defaultValue]
  );

  return [value, setValue];
}
