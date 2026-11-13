"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchContentPreviewBlob } from "@/lib/api/content";

interface UseContentPreviewResult {
  /** Blob URL, ready to pass to <img src>. Null while loading / disabled. */
  url: string | null;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Wave D0b-3 — fetch + manage a thumbnail blob URL for one Content row.
 *
 * Why the blob-URL dance:
 *   - The `file` field is write-only on the API (never a direct path).
 *   - Thumbnails go through `/content/<id>/preview/` which requires the
 *     user's JWT. An `<img src="/content/<id>/preview/">` would fail
 *     because the browser doesn't attach the Authorization header.
 *   - Solution: fetch as a Blob via axios (which DOES attach the JWT),
 *     then create an object URL. React Query caches the Blob itself, so
 *     navigating back to a page reuses the download without re-fetching.
 *
 * Cleanup: the object URL is revoked when the Blob changes or the
 * component unmounts — otherwise the browser keeps the bytes alive for
 * the tab's whole lifetime (a real leak on a long session).
 *
 * `enabled` is caller-controlled — the ContentCard passes `false` until
 * the card is in view, which defers the fetch for off-screen images.
 */
export function useContentPreview(
  id: string,
  enabled: boolean
): UseContentPreviewResult {
  const { data: blob, isLoading, isError } = useQuery({
    queryKey: ["content-preview", id],
    queryFn: () => fetchContentPreviewBlob(id),
    enabled,
    // Images rarely change — cached for the session. React Query's
    // default gcTime (5 min) already handles unsubscribed cleanup.
    staleTime: Infinity,
    // A failed fetch on a thumbnail is silent — the card falls back to
    // its icon. Retrying would just spam the network for no gain.
    retry: false,
  });

  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [blob]);

  return { url, isLoading, isError };
}