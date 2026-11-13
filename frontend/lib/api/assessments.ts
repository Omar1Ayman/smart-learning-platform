import { apiClient } from "@/lib/api/client";
import type {
  AssessmentPreview,
  AssessmentStatus,
  AssessmentTargetLink,
  AssessmentQuestionLink,
  AttemptDetail,
  Paginated,
  StaffAssessment,
  StudentAssessment,
  AssessmentAnalytics,
} from "@/types";

// --- Student ---

export async function listStudentAssessments() {
  const { data } = await apiClient.get<Paginated<StudentAssessment>>(
    "/assessments/"
  );
  return data;
}

export async function startAssessment(id: string) {
  const { data } = await apiClient.post<AttemptDetail>(
    `/assessments/${id}/start/`
  );
  return data;
}

// --- Staff (Wave D0c-2a: server-side search/filter/sort) ---

export async function listStaffAssessments(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  status?: AssessmentStatus;
  assessment_type?: string;
  ordering?: string;
}) {
  const { data } = await apiClient.get<Paginated<StaffAssessment>>(
    "/assessments/",
    { params }
  );
  return data;
}

export async function getStaffAssessment(id: string) {
  const { data } = await apiClient.get<StaffAssessment>(`/assessments/${id}/`);
  return data;
}

export interface AssessmentCreateInput {
  title: string;
  description?: string;
  assessment_type: string;
  starts_at?: string | null;
  ends_at?: string | null;
  duration_minutes?: number | null;
  max_attempts?: number;
  passing_score?: string | null;
  randomize_question_order?: boolean;
  randomize_option_order?: boolean;
  question_count?: number | null;
  late_entry_minutes?: number | null;
  entry_cutoff_minutes?: number | null;
}

export async function createAssessment(input: AssessmentCreateInput) {
  const { data } = await apiClient.post<StaffAssessment>("/assessments/", input);
  return data;
}

export async function updateAssessment(
  id: string,
  input: Partial<AssessmentCreateInput>
) {
  const { data } = await apiClient.patch<StaffAssessment>(
    `/assessments/${id}/`,
    input
  );
  return data;
}

export async function deleteAssessment(id: string) {
  await apiClient.delete(`/assessments/${id}/`);
}

export async function publishAssessment(id: string) {
  const { data } = await apiClient.post<StaffAssessment>(
    `/assessments/${id}/publish/`
  );
  return data;
}

export async function duplicateAssessment(id: string) {
  const { data } = await apiClient.post<StaffAssessment>(
    `/assessments/${id}/duplicate/`
  );
  return data;
}

// --- Assessment questions ---

export async function listAssessmentQuestions(assessmentId: string) {
  const { data } = await apiClient.get<Paginated<AssessmentQuestionLink>>(
    "/assessment-questions/",
    { params: { assessment: assessmentId } }
  );
  return data;
}

export async function addAssessmentQuestion(
  assessmentId: string,
  questionId: string,
  order: number
) {
  const { data } = await apiClient.post<AssessmentQuestionLink>(
    "/assessment-questions/",
    { assessment: assessmentId, question: questionId, order }
  );
  return data;
}

export async function removeAssessmentQuestion(linkId: string) {
  await apiClient.delete(`/assessment-questions/${linkId}/`);
}

// --- Assessment targets ---

export async function listAssessmentTargets(assessmentId: string) {
  const { data } = await apiClient.get<Paginated<AssessmentTargetLink>>(
    "/assessment-targets/",
    { params: { assessment: assessmentId } }
  );
  return data;
}

export interface TargetCreateInput {
  assessment: string;
  target_type: AssessmentTargetLink["target_type"];
  stage?: string | null;
  grade?: string | null;
  group?: string | null;
  student?: string | null;
}

export async function addAssessmentTarget(input: TargetCreateInput) {
  const { data } = await apiClient.post<AssessmentTargetLink>(
    "/assessment-targets/",
    input
  );
  return data;
}

export async function removeAssessmentTarget(linkId: string) {
  await apiClient.delete(`/assessment-targets/${linkId}/`);
}

// --- Status helpers ---

export function statusBadgeClass(status: AssessmentStatus): string {
  switch (status) {
    case "DRAFT":
      return "bg-accent/20 text-ink-700";
    case "PUBLISHED":
      return "bg-success/10 text-success";
    case "CLOSED":
      return "bg-ink-50 text-ink-400";
    case "ARCHIVED":
      return "bg-ink-50 text-ink-400";
  }
}

export function statusLabel(status: AssessmentStatus): string {
  switch (status) {
    case "DRAFT":
      return "مسودة";
    case "PUBLISHED":
      return "منشور";
    case "CLOSED":
      return "مغلق";
    case "ARCHIVED":
      return "مؤرشف";
  }
}

export async function fetchReach(assessmentId: string) {
  const { data } = await apiClient.get<{ students: number }>(
    `/assessments/${assessmentId}/reach/`
  );
  return data;
}

// --- Preview + Analytics (unchanged) ---

export async function getAssessmentPreview(id: string) {
  const { data } = await apiClient.get<AssessmentPreview>(
    `/assessments/${id}/preview/`
  );
  return data;
}

export async function exportAssessmentResults(assessmentId: string): Promise<void> {
  const response = await apiClient.get(
    `/assessments/${assessmentId}/export_results/`,
    { responseType: "blob" }
  );
  const url = URL.createObjectURL(response.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `results-${assessmentId.slice(0, 8)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- Analytics (Wave C3) ---

export async function getAssessmentAnalytics(id: string) {
  const { data } = await apiClient.get<AssessmentAnalytics>(
    `/assessments/${id}/analytics/`
  );
  return data;
}