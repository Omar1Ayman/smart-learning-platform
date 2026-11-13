"use client";

import { useRef, useState } from "react";
import { FileText, Upload, X } from "@/components/ui/icons";

interface FileDropZoneProps {
  file: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
  /** Max size hint — display only. Actual enforcement is on the server. */
  maxSizeMB?: number;
  error?: string;
  disabled?: boolean;
  hint?: string;
  /** Existing file name (edit mode) — shown when no new file is picked. */
  existingFileName?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Wave D0b — drag-and-drop file picker.
 *
 * Handles:
 *   - Click → opens native file picker
 *   - Drag over → visual highlight
 *   - Drop → captures the file
 *   - Selected file → shows name + size + clear button
 *   - Existing file (edit mode) → shows current name as a hint
 *
 * Validation (extension, MIME, size) is intentionally NOT here — the
 * server re-checks everything via `validate_uploaded_file`. Client-side
 * checks are a UX nicety; keeping them out means the "drop zone" can be
 * reused for any file type without duplicating rules.
 */
export function FileDropZone({
  file,
  onChange,
  accept,
  maxSizeMB,
  error,
  disabled,
  hint,
  existingFileName,
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSelect(selected: File | null) {
    if (disabled) return;
    onChange(selected);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleSelect(dropped);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  const hasFile = !!file;
  const showExisting = !file && !!existingFileName;

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-ink">الملف</label>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-all ${
          isDragging
            ? "border-accent bg-accent/10"
            : error
            ? "border-danger bg-danger/5"
            : hasFile || showExisting
            ? "border-success/50 bg-success/5"
            : "border-line bg-paper-elevated hover:border-ink/40 hover:bg-paper-muted"
        } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => handleSelect(e.target.files?.[0] ?? null)}
        />

        {hasFile ? (
          <>
            <FileText
              size={28}
              className="text-success"
              aria-hidden="true"
            />
            <div className="w-full text-center">
              <p className="truncate text-sm font-medium text-ink">
                {file!.name}
              </p>
              <p className="mt-0.5 text-xs text-ink-400">
                {formatBytes(file!.size)}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              disabled={disabled}
              className="absolute end-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-paper-elevated/80 text-ink-400 shadow-sm transition-colors hover:bg-paper-elevated hover:text-danger disabled:hidden"
              aria-label="إزالة الملف"
            >
              <X size={12} />
            </button>
          </>
        ) : showExisting ? (
          <>
            <FileText size={28} className="text-ink-400" aria-hidden="true" />
            <div className="w-full text-center">
              <p className="text-xs text-ink-400">الملف الحالي:</p>
              <p className="truncate text-sm font-medium text-ink">
                {existingFileName}
              </p>
              <p className="mt-1 text-xs text-ink-400">
                اسحب ملفاً جديداً للاستبدال، أو اضغط للاختيار
              </p>
            </div>
          </>
        ) : (
          <>
            <Upload
              size={28}
              className={isDragging ? "text-accent-dark" : "text-ink-400"}
              aria-hidden="true"
            />
            <div className="text-center">
              <p className="text-sm font-medium text-ink">
                {isDragging ? "أفلت الملف هنا" : "اسحب الملف هنا أو اضغط للاختيار"}
              </p>
              {(accept || maxSizeMB) && (
                <p className="mt-1 text-xs text-ink-400">
                  {accept && <span>الصيغ: {accept}</span>}
                  {accept && maxSizeMB && <span> · </span>}
                  {maxSizeMB && <span>حتى {maxSizeMB} ميجابايت</span>}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}