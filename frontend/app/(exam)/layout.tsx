"use client";

import { AuthGuard } from "@/components/layout/AuthGuard";

/**
 * Exam-only layout — NO sidebar, NO topbar.
 *
 * Rationale: exam pages must be distraction-free and fullscreen-friendly.
 * Hiding the sidebar via CSS from the dashboard layout would be fragile
 * (any future layout change breaks the exam view). A dedicated route
 * group is the correct Next.js pattern.
 *
 * AuthGuard still wraps the page — authentication is enforced.
 */
export default function ExamLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}