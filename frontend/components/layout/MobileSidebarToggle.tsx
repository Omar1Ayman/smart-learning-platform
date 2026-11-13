"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";

export function MobileSidebarToggle() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div className="border-b border-line bg-paper-elevated px-4 py-2 md:hidden">
      <button
        type="button"
        aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
        aria-expanded={open}
        aria-controls="tenant-mobile-navigation"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink hover:bg-paper-muted"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
        {open ? "إغلاق القائمة" : "القائمة"}
      </button>
      {open && (
        <div
          id="tenant-mobile-navigation"
          className="fixed inset-0 z-50 bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="h-full w-64 bg-paper-elevated shadow-xl"
            onClick={() => setOpen(false)}
          >
            <Sidebar />
          </div>
        </div>
      )}
    </div>
  );
}
