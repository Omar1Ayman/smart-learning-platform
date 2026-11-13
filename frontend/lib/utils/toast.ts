import { toast } from "sonner";

interface ApiError {
  response?: {
    data?: {
      error?: {
        detail?: unknown;
        blocked?: Array<{ id: string; label: string }>;
      };
    };
  };
}

export function extractErrorMessage(err: unknown, fallback: string): string {
  // 0. Our own `new Error(...)` — the message WAS constructed by our code
  //    (e.g. bulk partial-success summary). Surface it directly.
  //    BUT: AxiosError is also `instanceof Error` and has a generic
  //    "Request failed with status code 400" message — we must skip it
  //    so the API-shape branch below can extract the actual detail.
  if (err instanceof Error && err.message.trim()) {
    const hasApiResponse = (err as unknown as { response?: unknown }).response;
    if (!hasApiResponse) return err.message;
  }

  // 1. Raw string — some callers do `throw "some text"`.
  if (typeof err === "string" && err.trim()) return err;

  // 2. API error shape: { response.data.error.detail }
  const detail = (err as ApiError)?.response?.data?.error?.detail;
  if (typeof detail === "string") return detail;

  if (detail && typeof detail === "object") {
    const values = Object.values(detail as Record<string, unknown>);
    const messages = values
      .flatMap((v) => (Array.isArray(v) ? v : [v]))
      .filter(Boolean);
    if (messages.length > 0) return messages.map(String).join(" · ");
  }

  // 3. Fallback.
  return fallback;
}

/** Returns a blocked-items list if the error came from bulk_delete. */
export function extractBlockedItems(
  err: unknown
): Array<{ id: string; label: string }> {
  const blocked = (err as ApiError)?.response?.data?.error?.blocked;
  return Array.isArray(blocked) ? blocked : [];
}

export function toastSuccess(message: string) {
  if (!message.trim()) return;
  const id = toast.success(message, { duration: 3000 });
  setTimeout(() => toast.dismiss(id), 3050);
}

export function toastError(err: unknown, fallback: string) {
  const message = extractErrorMessage(err, fallback);
  if (!message.trim()) return;
  const id = toast.error(message, { duration: 5000 });
  setTimeout(() => toast.dismiss(id), 5050);
}

export function toastWarning(message: string) {
  if (!message.trim()) return;
  const id = toast.warning(message, { duration: 6000 });
  setTimeout(() => toast.dismiss(id), 6050);
}

/**
 * Wave D0c fix — neutral info toast for mixed/partial outcomes.
 *
 * Bulk actions often produce a *summary* result, not a clean success or
 * a clean failure: "اعتُمد 3 · 1 من إنشائك". Calling toastError on that
 * paints the whole message red, which is misleading (3 actually
 * succeeded). This helper gives the message a neutral/amber skin.
 */
export function toastInfo(message: string) {
  if (!message.trim()) return;
  const id = toast.info(message, { duration: 5000 });
  setTimeout(() => toast.dismiss(id), 5050);
}

/**
 * Wave A3 — undo-friendly toast. Shows a message with a single action
 * button (e.g., "تراجع"). Auto-dismisses after `durationMs`.
 */
export function toastWithAction(
  message: string,
  options: {
    actionLabel: string;
    onAction: () => void;
    durationMs?: number;
  }
): string | number {
  const duration = options.durationMs ?? 5000;
  const id = toast.success(message, {
    duration,
    action: {
      label: options.actionLabel,
      onClick: options.onAction,
    },
  });
  return id;
}

/** Surface `_warnings` returned by the backend on a successful action. */
export function showResponseWarnings(response: unknown) {
  const warnings = (response as { _warnings?: Record<string, string[]> })
    ?._warnings;
  if (!warnings) return;
  for (const messages of Object.values(warnings)) {
    for (const msg of messages) {
      toastWarning(msg);
    }
  }
}