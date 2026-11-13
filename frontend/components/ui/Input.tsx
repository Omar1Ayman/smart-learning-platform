"use client";

import { forwardRef, useId, useState } from "react";
import { Eye, EyeOff } from "./icons";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  /** Helper text below the input — shown only when there's no error. */
  hint?: string;
  /** Adds a red asterisk to the label. */
  required?: boolean;
  /** Show a visibility toggle for password fields. Defaults to true for
   *  type="password". Set false to hide. */
  showPasswordToggle?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      required,
      showPasswordToggle,
      id,
      className = "",
      type,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id ?? props.name ?? generatedId;
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === "password";
    const shouldToggle = showPasswordToggle ?? isPassword;
    const actualType = shouldToggle && showPassword ? "text" : type;

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={actualType}
            required={required}
            className={`w-full rounded-lg border bg-paper-elevated px-3 py-2 text-sm text-ink outline-none transition-all focus:border-ink focus:ring-2 focus:ring-ink/10 ${
              error
                ? "border-danger focus:border-danger focus:ring-danger/10"
                : "border-line"
            } ${shouldToggle ? "pe-10" : ""} ${className}`}
            aria-invalid={!!error}
            aria-required={required}
            aria-describedby={
              error
                ? `${inputId}-error`
                : hint
                ? `${inputId}-hint`
                : undefined
            }
            {...props}
          />
          {shouldToggle && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 transition-colors hover:text-ink"
              aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              aria-pressed={showPassword}
              aria-controls={inputId}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
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
Input.displayName = "Input";