"use client";

import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Full width — replaces `className="w-full"` pattern. */
  block?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-ink text-white hover:bg-ink-700 disabled:bg-ink-400 dark:bg-accent dark:text-[#111827] dark:hover:bg-accent-dark dark:disabled:bg-accent/50",
  secondary:
    "bg-paper-elevated text-ink border border-line hover:bg-paper-muted disabled:text-ink-400",
  ghost:
    "bg-transparent text-ink hover:bg-paper-muted",
  danger:
    "bg-danger text-white hover:opacity-90 disabled:opacity-50",
};

const sizes: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs gap-1",
  md: "px-4 py-2 text-sm gap-2",
  lg: "px-6 py-3 text-base gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", block = false, className = "", ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed ${sizes[size]} ${variants[variant]} ${block ? "w-full" : ""} ${className}`}
      {...props}
    />
  )
);
Button.displayName = "Button";