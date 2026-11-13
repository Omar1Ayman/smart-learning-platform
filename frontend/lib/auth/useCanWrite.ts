"use client";

import { useAuthStore } from "./store";
import { useActiveYearStore } from "@/lib/hooks/useActiveYear";

// ============================================================================
// Phase 1.13 — Archive Read-Only Guard
//
// All write-permission hooks now also check the active year's status.
// When the year is ARCHIVED, every write is blocked regardless of role.
//
// This mirrors the server-side `YearAwareViewSet` (backend) so the UI
// doesn't offer buttons that would 403 on click.
//
// IMPORTANT: this is UX-only. The authoritative check is the backend.
// Anyone bypassing the UI still gets 403 from the server.
// ============================================================================

/** Returns true when the active year is archived (read-only). */
function useIsYearArchived(): boolean {
  return useActiveYearStore((s) => s.activeYearStatus === "ARCHIVED");
}

/** OWNER/ADMIN — can write to core academic structure (years, terms,
 *  stages, grades, subjects, groups, courses, team, enrollments,
 *  teacher-assignments). Matches the server-side IsAdminForWriteActions.
 *
 *  Blocked when the active year is ARCHIVED. */
export function useCanWrite(): boolean {
  const role = useAuthStore((s) => s.user?.role);
  const isArchived = useIsYearArchived();

  if (role !== "OWNER" && role !== "ADMIN") return false;
  if (isArchived) return false;
  return true;
}

/** OWNER/ADMIN/TEACHER — can write to content & questions. Matches the
 *  server-side IsStaffForWriteActions.
 *
 *  Blocked when the active year is ARCHIVED. */
export function useCanWriteContent(): boolean {
  const role = useAuthStore((s) => s.user?.role);
  const isArchived = useIsYearArchived();

  if (role !== "OWNER" && role !== "ADMIN" && role !== "TEACHER") {
    return false;
  }
  if (isArchived) return false;
  return true;
}

/** OWNER/ADMIN/TEACHER — read access to staff-only areas (question bank,
 *  assessment-questions, assessment-targets). Matches IsStaffMember.
 *
 *  NOTE: This is a READ permission — it intentionally does NOT check
 *  the archive status. Archived years remain fully readable. */
export function useIsStaff(): boolean {
  const role = useAuthStore((s) => s.user?.role);
  return role === "OWNER" || role === "ADMIN" || role === "TEACHER";
}

/** Explicit hook for pages that need to know "is this year read-only?"
 *  without conflating it with role. Useful for disabling form inputs,
 *  showing tooltips, or conditionally rendering read-only banners.
 *
 *  Example:
 *    const readOnly = useIsReadOnlyYear();
 *    <input disabled={readOnly} ... />
 */
export function useIsReadOnlyYear(): boolean {
  return useIsYearArchived();
}