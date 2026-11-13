import { apiClient } from "@/lib/api/client";

// ---------------------------------------------------------------------------
// Wave D1b — curriculum bulk import
// ---------------------------------------------------------------------------

export interface CurriculumImportSummary {
  total: number;
  valid: number;
  skip: number;
  errors: number;
}

export interface CurriculumWillCreate {
  stages: number;
  grades: number;
  subjects: number;
  courses: number;
  chapters: number;
  lessons: number;
}

export interface CurriculumImportRow {
  row: number;
  academic_year: string;
  stage: string;
  grade: string;
  subject: string;
  course: string;
  chapter: string;
  lesson: string;
  status: "valid" | "skip" | "error";
  errors: string[];
  reason: string;
  will_create: {
    stage: boolean;
    grade: boolean;
    subject: boolean;
    course: boolean;
    chapter: boolean;
    lesson: boolean;
  };
}

export interface CurriculumImportPreview {
  dry_run: true;
  summary: CurriculumImportSummary;
  will_create: CurriculumWillCreate;
  rows: CurriculumImportRow[];
}

export interface CurriculumImportCommit {
  dry_run: false;
  summary: CurriculumImportSummary;
  will_create: CurriculumWillCreate;
  result: {
    created_stages: number;
    created_grades: number;
    created_subjects: number;
    created_courses: number;
    created_chapters: number;
    created_lessons: number;
  };
}

export async function downloadCurriculumTemplate(): Promise<void> {
  const response = await apiClient.get("/courses/import_template/", {
    responseType: "blob",
  });
  const url = URL.createObjectURL(response.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = "curriculum_template.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function previewCurriculumImport(
  file: File
): Promise<CurriculumImportPreview> {
  const form = new FormData();
  form.append("file", file);
  form.append("dry_run", "true");
  const { data } = await apiClient.post<CurriculumImportPreview>(
    "/courses/import/",
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data;
}

export async function commitCurriculumImport(
  file: File
): Promise<CurriculumImportCommit> {
  const form = new FormData();
  form.append("file", file);
  form.append("dry_run", "false");
  const { data } = await apiClient.post<CurriculumImportCommit>(
    "/courses/import/",
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data;
}