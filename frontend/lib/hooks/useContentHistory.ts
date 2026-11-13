"use client";

import { useEffect, useState } from "react";
import type { ContentType } from "@/lib/api/content";

// ---- Config ----

const HISTORY_KEY = "content_history_v1";
const PINNED_KEY = "content_pinned_v1";
const HISTORY_MAX = 20;
const HISTORY_SHOWN = 6;

// ---- Types ----

export interface RecentContent {
  id: string;
  title: string;
  content_type: ContentType;
  viewedAt: number;
}

// ---- History (recently viewed) ----

function readHistory(): RecentContent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(items: RecentContent[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  } catch {
    // quota exceeded or private mode — silently ignore
  }
}

function emit(eventName: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(eventName));
  }
}

/**
 * Records a content view. Bumps the item to the top of the history and
 * trims to the last 20. Safe to call on every open — dedupe is built in.
 *
 * Not a React hook — call directly from event handlers.
 */
export function recordContentView(item: {
  id: string;
  title: string;
  content_type: ContentType;
}): void {
  const current = readHistory();
  const filtered = current.filter((c) => c.id !== item.id);
  const next: RecentContent[] = [
    { ...item, viewedAt: Date.now() },
    ...filtered,
  ].slice(0, HISTORY_MAX);
  writeHistory(next);
  emit("content-history-updated");
}

/** Clears the whole history. */
export function clearContentHistory(): void {
  writeHistory([]);
  emit("content-history-updated");
}

/**
 * Returns the last N viewed items (default 6), newest first. Updates
 * automatically when any tab records a new view or clears history.
 */
export function useRecentlyViewed(limit = HISTORY_SHOWN): RecentContent[] {
  const [items, setItems] = useState<RecentContent[]>([]);

  useEffect(() => {
    function refresh() {
      setItems(readHistory().slice(0, limit));
    }
    refresh();
    window.addEventListener("content-history-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("content-history-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [limit]);

  return items;
}

// ---- Pinned ----

function readPinned(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writePinned(ids: Set<string>): void {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

/**
 * Toggles pin status for a content item. Returns the NEW pinned state.
 * Not a React hook — call directly from event handlers.
 */
export function toggleContentPin(id: string): boolean {
  const current = readPinned();
  let nowPinned: boolean;
  if (current.has(id)) {
    current.delete(id);
    nowPinned = false;
  } else {
    current.add(id);
    nowPinned = true;
  }
  writePinned(current);
  emit("content-pins-updated");
  return nowPinned;
}

/**
 * Returns the set of pinned content IDs. Updates automatically when any
 * tab pins/unpins a row.
 */
export function usePinnedIds(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    function refresh() {
      setIds(readPinned());
    }
    refresh();
    window.addEventListener("content-pins-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("content-pins-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return ids;
}

/**
 * Convenience: is a given ID pinned? Wraps usePinnedIds so components
 * that only need a boolean don't have to hold the whole set.
 */
export function useIsPinned(id: string): boolean {
  const ids = usePinnedIds();
  return ids.has(id);
}