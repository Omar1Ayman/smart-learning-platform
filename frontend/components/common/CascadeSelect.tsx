"use client";

import { SmartSelect } from "@/components/common/SmartSelect";
import {
  useCascadeOptions,
  type CascadeKey,
} from "@/lib/hooks/useCascadeOptions";
import type { HierarchyFilters } from "@/lib/hierarchy";

interface CascadeSelectProps {
  cascadeKey: CascadeKey;
  filters: HierarchyFilters;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCreateNew?: () => void;
  createLabel?: string;
  error?: string;
  placeholder?: string;
}

/**
 * A SmartSelect that gets its options, loading state, and empty message
 * from `useCascadeOptions`. Every cascade field in every form should be a
 * CascadeSelect — that's the whole point of Wave 35.
 */
export function CascadeSelect({
  cascadeKey,
  filters,
  label,
  value,
  onChange,
  onCreateNew,
  createLabel,
  error,
  placeholder,
}: CascadeSelectProps) {
  const { options, isLoading, emptyReason } = useCascadeOptions(
    cascadeKey,
    filters
  );

  return (
    <SmartSelect
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      isLoading={isLoading}
      emptyMessage={emptyReason ?? undefined}
      onCreateNew={onCreateNew}
      createLabel={createLabel}
      error={error}
      placeholder={placeholder}
    />
  );
}