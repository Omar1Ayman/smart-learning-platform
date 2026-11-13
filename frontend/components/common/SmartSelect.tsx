"use client";

import { useId } from "react";
import { Button } from "@/components/ui/Button";

export interface SmartSelectOption {
  value: string;
  label: string;
}

interface SmartSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SmartSelectOption[];
  placeholder?: string;
  onCreateNew?: () => void;
  createLabel?: string;
  error?: string;
  isLoading?: boolean;
  emptyMessage?: string;
  id?: string;
  required?: boolean;
  /** Wave A4b-3 — disable the select (and hide the "+" button). Used in
   *  edit mode for fields that must not change after creation (e.g.,
   *  TeacherAssignment's teacher/course, Enrollment's student). */
  disabled?: boolean;
}

export function SmartSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "اختر...",
  onCreateNew,
  createLabel = "+ إضافة",
  error,
  isLoading,
  emptyMessage,
  disabled = false,
  id,
  required = false,
}: SmartSelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;
  const emptyMessageId = `${selectId}-empty`;
  const isEmpty = !isLoading && options.length === 0;
  const isDisabled = disabled || isLoading || isEmpty;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium text-ink">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      <div className="flex gap-2">
        <select
          id={selectId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={isDisabled}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? errorId : isEmpty && emptyMessage ? emptyMessageId : undefined
          }
          aria-busy={isLoading || undefined}
          className={`flex-1 rounded-lg border bg-paper-elevated px-3 py-2 text-sm text-ink outline-none transition-all focus:border-ink focus:ring-2 focus:ring-ink/10 disabled:cursor-not-allowed disabled:bg-paper-muted disabled:text-ink-400 ${
            error ? "border-danger focus:border-danger focus:ring-danger/10" : "border-line"
          }`}
        >
          <option value="">
            {isLoading
              ? "جارٍ التحميل..."
              : isEmpty
              ? "— لا توجد خيارات —"
              : placeholder}
          </option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {onCreateNew && !disabled && (
          <Button type="button" variant="secondary" onClick={onCreateNew}>
            {createLabel}
          </Button>
        )}
      </div>
      {isEmpty && emptyMessage && (
        <p id={emptyMessageId} className="text-xs text-ink-400" role="status">
          {emptyMessage}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}