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

export const FILE_CONTENT_TYPES: ContentType[] = ["PDF", "VIDEO", "IMAGE", "DOCUMENT", "BOOK", "CHAPTER_RESOURCE"];
export const TEXT_CONTENT_TYPES: ContentType[] = ["TEXT", "SUMMARY", "LESSON_EXPLANATION"];

export interface ContentItem {
  id: string;
  title: string;
  content_type: ContentType;
  description: string;
  is_published: boolean;
  stage: string | null;
  grade: string | null;
  group: string | null;
  subject: string | null;
  course: string | null;
  chapter: string | null;
  lesson: string | null;
  academic_year: string | null;
  term: string | null;
}

export async function listContent() {
  const { data } = await apiClient.get<Paginated<ContentItem>>("/content/");
  return data;
}

export interface ContentInput {
  title: string;
  content_type: ContentType;
  description?: string;
  file?: File;
  external_url?: string;
  text_body?: string;
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

export async function createContent(input: ContentInput) {
  const form = new FormData();
  Object.entries(input).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    form.append(key, value as string | Blob);
  });
  const { data } = await apiClient.post<ContentItem>("/content/", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/** Text/link content returns JSON; file content returns a Blob — the
 * caller decides what to do with each (open a blob URL vs. show a link
 * vs. render text). */
export async function downloadContent(id: string) {
  const response = await apiClient.get(`/content/${id}/download/`, {
    responseType: "blob",
  });
  const contentType = String(response.headers["content-type"] ?? "");
  if (contentType.includes("application/json")) {
    const text = await response.data.text();
    return { kind: "json" as const, data: JSON.parse(text) as { external_url?: string; text_body?: string } };
  }
  return { kind: "file" as const, blob: response.data as Blob };
}
