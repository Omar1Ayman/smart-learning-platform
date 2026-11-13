import { apiClient } from "@/lib/api/client";
import type { ParentChildDetail, ParentChildSummary, ParentLink } from "@/types";

// ---------------------------------------------------------------------------
// Parent portal (read-only)
// ---------------------------------------------------------------------------

export async function listMyChildren() {
  const { data } = await apiClient.get<ParentChildSummary[]>("/parent/children/");
  return data;
}

export async function getMyChild(childId: string) {
  const { data } = await apiClient.get<ParentChildDetail>(
    `/parent/children/${childId}/`
  );
  return data;
}

// ---------------------------------------------------------------------------
// Admin: link/unlink a parent to a student
// ---------------------------------------------------------------------------

export async function listParentLinks(studentId: string) {
  const { data } = await apiClient.get<ParentLink[]>("/admin/parent-links/", {
    params: { student: studentId },
  });
  return data;
}

export interface CreateParentLinkInput {
  parent: string;
  student: string;
  relationship?: "FATHER" | "MOTHER" | "GUARDIAN";
  is_primary?: boolean;
}

export async function createParentLink(input: CreateParentLinkInput) {
  const { data } = await apiClient.post<{
    id: string;
    parent_id: string;
    student_id: string;
  }>("/admin/parent-links/", input);
  return data;
}

export async function deleteParentLink(linkId: string) {
  await apiClient.delete(`/admin/parent-links/${linkId}/`);
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export const RELATIONSHIP_LABEL: Record<string, string> = {
  FATHER: "الأب",
  MOTHER: "الأم",
  GUARDIAN: "ولي أمر / وصي",
};

export const ATTENDANCE_STATUS_LABEL: Record<string, string> = {
  PRESENT: "حاضر",
  LATE: "متأخر",
  ABSENT: "غائب",
  EXCUSED: "بعذر",
};

export const ATTENDANCE_STATUS_STYLE: Record<string, string> = {
  PRESENT: "bg-success/10 text-success",
  LATE: "bg-accent/10 text-accent-dark",
  ABSENT: "bg-danger/10 text-danger",
  EXCUSED: "bg-info/10 text-info",
};