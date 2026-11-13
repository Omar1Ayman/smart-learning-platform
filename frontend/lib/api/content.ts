import { apiClient } from "@/lib/api/client";
import type { Paginated } from "@/types";

export type ContentType =
  | "PDF"
  | "VIDEO"
  | "IMAGE"
  | "DOCUMENT"
  | "EXTERNAL_LINK"
  | "TEXT"
  | "BOOK"
  | "SUMMARY"
  | "LESSON_EXPLANATION"
  | "CHAPTER_RESOURCE";

export const FILE_CONTENT_TYPES: ContentType[] = [
  "PDF",
  "VIDEO",
  "IMAGE",
  "DOCUMENT",
  "BOOK",
  "CHAPTER_RESOURCE",
];

export const TEXT_CONTENT_TYPES: ContentType[] = [
  "TEXT",
  "SUMMARY",
  "LESSON_EXPLANATION",
];

// ---------------------------------------------------------------------------
// Content grouping (tabs on /content)
// ---------------------------------------------------------------------------
//
// Single source of truth = CONTENT_GROUP_OF.
//
// `Record<ContentType, Exclude<ContentGroup, "all">>` means:
//   - Adding a new value to the ContentType union WITHOUT an entry here
//     is a TypeScript compile error (no silent "missing bucket").
//   - "all" is excluded as a *value* — every type belongs to exactly one
//     real bucket; "all" is a display-only filter.
//
// typesInGroup() derives the per-bucket ContentType[] from the map at
// module load — there is no second array that could drift out of sync.
// Previously CONTENT_GROUP_TYPES existed as a manually-maintained
// duplicate; a mismatch between the two would let a type show in "all"
// but silently disappear from its own tab.

export type ContentGroup = "all" | "files" | "texts" | "links";

export const CONTENT_GROUP_OF: Record<
  ContentType,
  Exclude<ContentGroup, "all">
> = {
  PDF: "files",
  VIDEO: "files",
  IMAGE: "files",
  DOCUMENT: "files",
  BOOK: "files",
  CHAPTER_RESOURCE: "files",
  TEXT: "texts",
  SUMMARY: "texts",
  LESSON_EXPLANATION: "texts",
  EXTERNAL_LINK: "links",
};

/**
 * Returns the list of ContentType values that belong to the given group,
 * or `null` when group is "all" (meaning "don't filter by type").
 *
 * Derived from CONTENT_GROUP_OF — never edit a second list.
 */
export function typesInGroup(group: ContentGroup): ContentType[] | null {
  if (group === "all") return null;
  return (
    Object.entries(CONTENT_GROUP_OF) as Array<
      [ContentType, Exclude<ContentGroup, "all">]
    >
  )
    .filter(([, g]) => g === group)
    .map(([type]) => type);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContentItem {
  id: string;
  title: string;
  content_type: ContentType;
  description: string;
  is_published: boolean;
  scan_status: string;
  original_filename: string;
  external_url: string;
  text_body: string;
  stage: string | null;
  stage_name: string | null;
  grade: string | null;
  grade_name: string | null;
  group: string | null;
  subject: string | null;
  subject_name: string | null;
  course: string | null;
  course_name: string | null;
  chapter: string | null;
  chapter_name: string | null;
  lesson: string | null;
  lesson_name: string | null;
  academic_year: string | null;
  academic_year_name: string | null;
  term: string | null;
  term_name: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export async function listContent(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  content_type?: ContentType;
  /** Comma-separated list — matches the backend's `content_type__in` filter. */
  content_type__in?: string;
  is_published?: boolean;
  grade?: string;
  subject?: string;
  course?: string;
  /** Backend `OrderingFilter` — e.g. "-created_at", "title". */
  ordering?: string;
}) {
  const { data } = await apiClient.get<Paginated<ContentItem>>("/content/", {
    params,
  });
  return data;
}

export interface ContentInput {
  title: string;
  content_type: ContentType;
  description?: string;
  file?: File;
  external_url?: string;
  text_body?: string;
  is_published?: boolean;
  stage?: string;
  grade?: string;
  group?: string;
  subject?: string;
  course?: string;
  chapter?: string;
  lesson?: string;
  academic_year?: string;
  term?: string;
}
export type UploadProgress = (pct: number) => void;

export async function createContent(
  input: ContentInput,
  onProgress?: UploadProgress
) {
  const form = new FormData();
  Object.entries(input).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    form.append(key, value as string | Blob);
  });
  const { data } = await apiClient.post<ContentItem>("/content/", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: onProgress
      ? (e) => {
          if (e.total && e.total > 0) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        }
      : undefined,
  });
  return data;
}
export async function updateContent(
  id: string,
  input: Partial<ContentInput>,
  onProgress?: UploadProgress
) {
  if (input.file) {
    const form = new FormData();
    Object.entries(input).forEach(([key, value]) => {
      if (value === undefined) return;
      if (value === "" && key !== "file") {
        form.append(key, "");
        return;
      }
      if (value === "") return;
      form.append(key, value as string | Blob);
    });
    const { data } = await apiClient.patch<ContentItem>(
      `/content/${id}/`,
      form,
      {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: onProgress
          ? (e) => {
              if (e.total && e.total > 0) {
                onProgress(Math.round((e.loaded / e.total) * 100));
              }
            }
          : undefined,
      }
    );
    return data;
  }
  const { data } = await apiClient.patch<ContentItem>(`/content/${id}/`, input);
  return data;
}

export async function deleteContent(id: string) {
  await apiClient.delete(`/content/${id}/`);
}

export async function downloadContent(id: string) {
  const response = await apiClient.get(`/content/${id}/download/`, {
    responseType: "blob",
  });
  const contentType = String(response.headers["content-type"] ?? "");
  if (contentType.includes("application/json")) {
    const text = await response.data.text();
    return {
      kind: "json" as const,
      data: JSON.parse(text) as { external_url?: string; text_body?: string },
    };
  }
  return { kind: "file" as const, blob: response.data as Blob };
}

/**
 * Wave D0b-3 — fetch a thumbnail blob for an IMAGE content row.
 *
 * Returns a Blob (not a blob: URL) so React Query can cache it safely.
 * The calling hook is responsible for creating/revoking the object URL —
 * see `useContentPreview`. Never use the file path directly in an
 * `<img src>` — the file is served through an authenticated endpoint
 * that requires the JWT (which <img> can't attach).
 */
export async function fetchContentPreviewBlob(id: string): Promise<Blob> {
  const response = await apiClient.get(`/content/${id}/preview/`, {
    responseType: "blob",
  });
  return response.data as Blob;
}