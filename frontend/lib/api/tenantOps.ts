import { apiClient } from "@/lib/api/client";
import type { ImportCommitResponse, ImportPreviewResponse } from "@/types";

export async function downloadTenantExport() {
  const response = await apiClient.get("/tenant/export/", {
    responseType: "blob",
  });
  const url = URL.createObjectURL(response.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tenant-export-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadImportTemplate() {
  const response = await apiClient.get("/tenant/import/template/", {
    responseType: "blob",
  });
  const url = URL.createObjectURL(response.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = "students_template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function previewStudentImport(
  file: File,
  academicYearId: string
): Promise<ImportPreviewResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("academic_year", academicYearId);
  form.append("dry_run", "true");
  const { data } = await apiClient.post<ImportPreviewResponse>(
    "/tenant/import/students/",
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data;
}

export async function commitStudentImport(
  file: File,
  academicYearId: string
): Promise<ImportCommitResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("academic_year", academicYearId);
  form.append("dry_run", "false");
  const { data } = await apiClient.post<ImportCommitResponse>(
    "/tenant/import/students/",
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data;
}