"use client";

import { forwardRef, useId } from "react";
import { ChevronDown } from "./icons";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  options: SelectOption[];
  /** When provided, an initial disabled option is prepended. */
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      hint,
      required,
      id,
      className = "",
      options,
      placeholder,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id ?? props.name ?? generatedId;
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
        <div className="relative">
          <select
            ref={ref}
            id={inputId}
            required={required}
            className={`w-full appearance-none rounded-lg border bg-paper-elevated px-3 py-2 pe-9 text-sm text-ink outline-none transition-all focus:border-ink focus:ring-2 focus:ring-ink/10 disabled:cursor-not-allowed disabled:bg-paper-muted disabled:text-ink-400 ${
              error
                ? "border-danger focus:border-danger focus:ring-danger/10"
                : "border-line"
            } ${className}`}
            aria-invalid={!!error}
            aria-required={required}
            aria-describedby={
              error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
            }
            {...props}
          >
            {placeholder !== undefined && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-400"
          />
        </div>
        {error ? (
          <p id={`${inputId}-error`} className="text-xs text-danger" role="alert">
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="text-xs text-ink-400">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);
Select.displayName = "Select";