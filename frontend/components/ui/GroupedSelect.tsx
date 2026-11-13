"use client";

import { forwardRef, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Check } from "./icons";

export interface GroupedSelectOption {
  value: string;
  label: string;
}

export interface GroupedSelectGroup {
  label: string;
  options: GroupedSelectOption[];
}

interface GroupedSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  groups: GroupedSelectGroup[];
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  isLoading?: boolean;
}

export const GroupedSelect = forwardRef<HTMLDivElement, GroupedSelectProps>(
  ({ label, value, onChange, groups, placeholder, error, disabled, isLoading }, _ref) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const generatedId = useId();
    const labelId = `${generatedId}-label`;
    const valueId = `${generatedId}-value`;
    const errorId = `${generatedId}-error`;

    // إغلاق القائمة عند النقر خارجها
    useEffect(() => {
      function handleClickOutside(e: MouseEvent) {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // إيجاد اسم الخيار المختار حالياً
    let selectedLabel = "";
    for (const group of groups) {
      const found = group.options.find((opt) => opt.value === value);
      if (found) {
        selectedLabel = found.label;
        break;
      }
    }

    return (
      <div className="flex flex-col gap-1.5" ref={containerRef}>
        <span
          id={labelId}
          className={`text-sm font-medium text-ink ${label ? "" : "sr-only"}`}
        >
          {label || placeholder || "اختر"}
        </span>

        <div className="relative">
          <button
            type="button"
            onClick={() => !disabled && setOpen(!open)}
            disabled={disabled || isLoading}
            role="combobox"
            aria-labelledby={`${labelId} ${valueId}`}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={Boolean(error)}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={`${generatedId}-options`}
            className={`flex w-full items-center justify-between rounded-lg border bg-paper-elevated px-3 py-2 text-sm text-ink outline-none transition-all focus:border-ink focus:ring-2 focus:ring-ink/10 disabled:cursor-not-allowed disabled:bg-paper-muted disabled:text-ink-400 ${
              error ? "border-danger" : "border-line"
            }`}
          >
            <span id={valueId} className={selectedLabel ? "text-ink" : "text-ink-400"}>
              {isLoading ? "جارٍ التحميل..." : selectedLabel || placeholder || "اختر..."}
            </span>
            <ChevronDown
              size={16}
              className={`text-ink-400 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>

          {open && (
            <div
              id={`${generatedId}-options`}
              role="listbox"
              aria-labelledby={labelId}
              className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-line bg-paper-elevated py-1 shadow-lg animate-fade-in-scale"
            >
              {groups.map((group) => (
                <div key={group.label}>
                  {/* عنوان المرحلة (Bold + Disabled) */}
                  <div className="pointer-events-none select-none bg-paper-muted/50 px-3 py-2 text-xs font-bold text-ink-400">
                    {group.label}
                  </div>
                  {/* الصفوف */}
                  {group.options.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={opt.value === value}
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-6 py-2 text-sm transition-colors ${
                        opt.value === value
                          ? "bg-accent/10 font-medium text-accent-dark dark:text-accent-light"
                          : "text-ink hover:bg-paper-muted"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {opt.value === value && <Check size={14} className="text-accent" />}
                    </button>
                  ))}
                </div>
              ))}
              {groups.length === 0 && !isLoading && (
                <div className="px-3 py-4 text-center text-sm text-ink-400">
                  لا توجد خيارات متاحة
                </div>
              )}
            </div>
          )}
        </div>
        {error && (
          <p id={errorId} className="text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

GroupedSelect.displayName = "GroupedSelect";