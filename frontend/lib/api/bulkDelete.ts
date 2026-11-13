import { apiClient } from "@/lib/api/client";

export interface BlockedItem {
  id: string;
  label: string;
}

export interface BulkDeleteResult {
  deleted: string[];
  missing: string[];
}

export interface BulkDeleteError {
  status: number;
  detail: string;
  blocked?: BlockedItem[];
}

/**
 * POST /<resource>/bulk_delete/  body: {ids: [...]}
 *
 * Inherited by every TenantScopedViewSet — so "stages", "grades",
 * "subjects", "groups", "courses", "academic-years", "terms",
 * "teacher-assignments", "enrollments", "questions",
 * "question-banks", "assessments", "content", "chapters", "lessons"
 * all support this out of the box.
 */
export async function bulkDelete(
  resource: string,
  ids: string[]
): Promise<BulkDeleteResult> {
  const { data } = await apiClient.post<BulkDeleteResult>(
    `/${resource}/bulk_delete/`,
    { ids }
  );
  return data;
}