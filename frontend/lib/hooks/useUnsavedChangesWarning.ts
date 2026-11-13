"use client";

import { useEffect } from "react";
import { useModalDirty } from "./useModalDirty";

/**
 * Wave A4 — beforeunload guard.
 *
 * Attaches a `beforeunload` handler whenever `hasChanges` is true. Shows the
 * browser's native "Leave site?" confirmation on refresh/tab-close so the
 * user doesn't lose work by accident.
 *
 * Wave C — modal-close guard: the same dirtiness is reported to any
 * enclosing QuickCreateModal (via useModalDirty), which then confirms
 * before discarding unsaved input on ✕ / Escape / backdrop close.
 *
 * IMPORTANT for React Hook Form callers: pass a boolean derived from
 * `dirtyFields` (fields the user actually changed), not `formState.isDirty`.
 * RHF's `isDirty` compares all values against `defaultValues`, so forms with
 * partial defaults report dirty without any user interaction.
 */
export function useUnsavedChangesWarning(
  hasChanges: boolean,
  message = "لديك تغييرات غير محفوظة. هل تريد المغادرة؟"
) {
  const { setDirty: setModalDirty } = useModalDirty();

  useEffect(() => {
    setModalDirty(hasChanges);
  }, [hasChanges, setModalDirty]);

  useEffect(() => {
    if (!hasChanges) return;

    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = message;
      return message;
    }

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasChanges, message]);
}
