"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Wave D0b-3 — lazy-load helper.
 *
 * Returns a ref + a boolean that flips to `true` the first time the
 * referenced element scrolls into view. Used by ContentCard to defer
 * fetching thumbnails until the card is actually visible — without this
 * a page with 100 images would trigger 100 parallel fetches on mount.
 *
 * `rootMargin: "200px"` starts loading slightly before the card is on
 * screen, so the image is usually ready by the time the user scrolls to it.
 *
 * Once `inView` becomes true it stays true (the observer disconnects) —
 * unmounting and remounting the card will restart the process, but a
 * React Query cache hit means no extra network request.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(
  rootMargin = "200px"
) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    if (inView) return; // already triggered

    const node = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootMargin]);

  return { ref, inView };
}