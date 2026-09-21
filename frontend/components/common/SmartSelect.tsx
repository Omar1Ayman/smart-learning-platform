"use client";

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
}

/**
 * A relation picker with an inline "+" to open a QuickCreateModal, so
 * picking OR creating a related record never leaves the current form
 * (spec #16/#17). Today this is a native <select> for simplicity/
 * reliability; swap the control for a searchable combobox without
 * touching any caller once a list gets long enough to need one — the
 * props are already shaped for that.
 */
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
}: SmartSelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-ink-700">{label}</label>
      <div className="flex gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={isLoading}
          className={`flex-1 rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-ink ${
            error ? "border-danger" : "border-line"
          }`}
        >
          <option value="" disabled>
            {isLoading ? "جارٍ التحميل..." : placeholder}
          </option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {onCreateNew && (
          <Button type="button" variant="secondary" onClick={onCreateNew}>
            {createLabel}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
