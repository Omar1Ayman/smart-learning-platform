"use client";

import { useModalDirty } from "@/lib/hooks/useModalDirty";
import { Button } from "./Button";
import { Loader } from "./icons";

interface FormFooterProps {
  isSubmitting: boolean;
  submitLabel?: string;
  submitLabelPending?: string;
  cancelLabel?: string;
  onCancel?: () => void;
  showKeyboardHint?: boolean;
  submitDisabled?: boolean;
  // ─── Save & Add Another ───
  showKeepOpen?: boolean;
  keepOpen?: boolean;
  onKeepOpenChange?: (checked: boolean) => void;
}

export function FormFooter({
  isSubmitting,
  submitLabel = "حفظ",
  submitLabelPending = "جارٍ الحفظ...",
  cancelLabel = "إلغاء",
  onCancel,
  showKeyboardHint = true,
  submitDisabled = false,
  showKeepOpen = false,
  keepOpen = false,
  onKeepOpenChange,
}: FormFooterProps) {
  // داخل النوافذ المنبثقة: زر الإلغاء يمر عبر الإغلاق المحروس (تأكيد تجاهل
  // التغييرات). خارجها يسقط على onCancel المعتاد.
  const { requestClose } = useModalDirty();
  const handleCancel = requestClose ?? onCancel;

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-5 mt-6">
      {showKeepOpen && (
        <label className="flex items-center gap-2 text-sm text-ink-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={keepOpen}
            onChange={(e) => onKeepOpenChange?.(e.target.checked)}
            className="h-4 w-4 accent-ink"
          />
          حفظ وإضافة آخر (يبقي النافذة مفتوحة)
        </label>
      )}

      <div className="flex items-center justify-between gap-3">
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            {cancelLabel}
          </Button>
        ) : (
          <div />
        )}
        <Button type="submit" disabled={isSubmitting || submitDisabled}>
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <Loader size={14} className="animate-spin" />
              {submitLabelPending}
            </span>
          ) : (
            submitLabel
          )}
        </Button>
      </div>

      {showKeyboardHint && (
        <p className="text-end text-[11px] text-ink-400 font-medium">
          <kbd className="rounded-md border border-line bg-paper-muted px-1.5 py-0.5 font-mono text-[10px] text-ink-400 shadow-sm">
            Enter
          </kbd>{" "}
          للحفظ
          {onCancel && (
            <>
              {" · "}
              <kbd className="rounded-md border border-line bg-paper-muted px-1.5 py-0.5 font-mono text-[10px] text-ink-400 shadow-sm">
                Esc
              </kbd>{" "}
              للإلغاء
            </>
          )}
        </p>
      )}
    </div>
  );
}