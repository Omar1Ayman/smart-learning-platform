"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { listAcademicYears } from "@/lib/api/academicYears";
import { useAuthStore } from "@/lib/auth/store";
import { useActiveYearStore } from "@/lib/hooks/useActiveYear";
import type { AcademicYearStatus } from "@/types";

const STATUS_META: Record<
  AcademicYearStatus,
  { label: string; cls: string }
> = {
  ACTIVE: { label: "نشطة", cls: "bg-success/10 text-success" },
  CLOSING: { label: "قيد الإغلاق", cls: "bg-accent/20 text-accent-dark" },
  ARCHIVED: { label: "📦 مؤرشفة", cls: "bg-ink-50 text-ink-400" },
  DRAFT: { label: "إعداد", cls: "bg-ink-50 text-ink-400" },
};

export function YearSwitcher() {
  const role = useAuthStore((s) => s.user?.role);
  const isStaff = role === "OWNER" || role === "ADMIN" || role === "TEACHER";

  const {
    activeYearId,
    activeYearName,
    activeYearStatus,
    setActiveYear,
  } = useActiveYearStore();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Fetch all years (staff only)
  const { data, isLoading } = useQuery({
    queryKey: ["academic-years", "for-switcher"],
    queryFn: () => listAcademicYears(),
    staleTime: 60_000,
    enabled: isStaff,
  });

  // Auto-select logic:
  //   1) If no year selected → pick the ACTIVE one
  //   2) If selected year was deleted → pick the ACTIVE one
  useEffect(() => {
    if (!data) return;
    const years = data.results;

    if (!activeYearId) {
      const active = years.find((y) => y.status === "ACTIVE");
      if (active) {
        setActiveYear({ id: active.id, name: active.name, status: active.status });
      }
      return;
    }

    const stillExists = years.some((y) => y.id === activeYearId);
    if (!stillExists) {
      const active = years.find((y) => y.status === "ACTIVE");
      if (active) {
        setActiveYear({ id: active.id, name: active.name, status: active.status });
      } else {
        useActiveYearStore.getState().clearActiveYear();
      }
    }
  }, [data, activeYearId, setActiveYear]);

  // Click-outside + Escape
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Non-staff: nothing to show
  if (!isStaff) return null;

  if (isLoading) {
    return <div className="h-8 w-32 animate-pulse rounded-lg bg-ink-50" />;
  }

  const years = (data?.results ?? []).filter((y) => y.status !== "DRAFT");

  if (years.length === 0) {
    return (
      <Link
        href="/academic-years"
        className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent-dark transition-colors hover:bg-accent/20"
      >
        ⚠️ فعّل سنة دراسية أولًا
      </Link>
    );
  }

  // Only one year → static label, no dropdown
  if (years.length === 1) {
    const only = years[0];
    const status = STATUS_META[only.status];
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-line bg-paper-elevated px-2.5 py-1.5">
        <span className="text-xs text-ink-400">📅</span>
        <span className="text-sm font-medium text-ink">{only.name}</span>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${status.cls}`}
        >
          {status.label}
        </span>
      </div>
    );
  }

  const currentStatus = activeYearStatus
    ? STATUS_META[activeYearStatus]
    : null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-line bg-paper-elevated px-2.5 py-1.5 text-sm transition-colors hover:border-ink/30 hover:bg-paper-muted"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-xs text-ink-400">📅</span>
        <span className="max-w-[120px] truncate font-medium text-ink">
          {activeYearName ?? "اختر السنة"}
        </span>
        {currentStatus && (
          <span
            className={`hidden rounded-full px-1.5 py-0.5 text-[10px] font-medium sm:inline ${currentStatus.cls}`}
          >
            {currentStatus.label}
          </span>
        )}
        <span
          className={`text-ink-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute end-0 z-30 mt-1 min-w-[240px] overflow-hidden rounded-lg border border-line bg-paper-elevated shadow-dropdown animate-fade-in-scale"
        >
          <div className="border-b border-line px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-ink-400">
              السنة الدراسية
            </p>
          </div>
          {years.map((y) => {
            const status = STATUS_META[y.status];
            const isCurrent = y.id === activeYearId;
            return (
              <button
                key={y.id}
                role="option"
                aria-selected={isCurrent}
                onClick={() => {
                  setActiveYear({ id: y.id, name: y.name, status: y.status });
                  setOpen(false);
                  // Refetch every list with the new year
                  queryClient.invalidateQueries();
                }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm transition-colors ${
                  isCurrent
                    ? "bg-ink/5 font-medium text-ink"
                    : "text-ink hover:bg-paper-muted"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {isCurrent && <span className="text-accent">✓</span>}
                  <span className="truncate">{y.name}</span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${status.cls}`}
                >
                  {status.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}