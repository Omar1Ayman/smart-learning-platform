import { apiClient } from "@/lib/api/client";
import type { Paginated } from "@/types";

// ===========================================================================
// Question Banks
// ===========================================================================

export interface QuestionBankItem {
  id: string;
  name: string;
  description: string;
  subject: string | null;
  grade: string | null;
  is_archived: boolean;
  created_by: string | null;
  created_by_name: string; // NEW
  questions_count: number; // NEW
  created_at: string;
  updated_at: string;
}

export async function moveBankQuestions(sourceBankId: string, targetBankId: string) {
  const { data } = await apiClient.post(`/question-banks/${sourceBankId}/move-questions/`, {
    target_bank: targetBankId
  });
  return data;
}

export async function listQuestionBanks(params?: {
  page?: number;
  page_size?: number;
  search?: string;
}) {
  const { data } = await apiClient.get<Paginated<QuestionBankItem>>(
    "/question-banks/",
    { params }
  );
  return data;
}

export async function getQuestionBank(id: string) {
  const { data } = await apiClient.get<QuestionBankItem>(
    `/question-banks/${id}/`
  );
  return data;
}

export interface QuestionBankInput {
  name: string;
  description?: string;
  subject?: string | null;
  grade?: string | null;
  is_archived?: boolean;
}

export async function createQuestionBank(input: QuestionBankInput) {
  const { data } = await apiClient.post<QuestionBankItem>(
    "/question-banks/",
    input
  );
  return data;
}

export async function updateQuestionBank(
  id: string,
  input: Partial<QuestionBankInput>
) {
  const { data } = await apiClient.patch<QuestionBankItem>(
    `/question-banks/${id}/`,
    input
  );
  return data;
}

export async function deleteQuestionBank(id: string) {
  await apiClient.delete(`/question-banks/${id}/`);
}

// ===========================================================================
// Questions
// ===========================================================================

export type QuestionType = "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "ESSAY";
export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface QuestionOptionItem {
  id?: string;
  text: string;
  is_correct: boolean;
  order: number;
}

export interface QuestionItem {
  id: string;
  bank: string;
  text: string;
  question_type: QuestionType;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  topic: string;
  points: string;
  accepted_answers: string[];
  explanation: string;
  options: QuestionOptionItem[];
  review_status: ReviewStatus;
  review_note: string;
  created_by: string | null;
}

export interface QuestionStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  by_type: {
    MCQ: number;
    TRUE_FALSE: number;
    SHORT_ANSWER: number;
    ESSAY: number;
  };
}

export async function getQuestionStats() {
  const { data } = await apiClient.get<QuestionStats>("/questions/stats/");
  return data;
}

export async function listQuestions(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  review_status__in?: string;
  question_type?: QuestionType;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
  bank?: string;
  is_archived?: boolean;
  ordering?: string;
}) {
  const { data } = await apiClient.get<Paginated<QuestionItem>>("/questions/", {
    params,
  });
  return data;
}

export interface QuestionInput {
  bank: string;
  text: string;
  question_type: QuestionType;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
  topic?: string;
  points?: string;
  accepted_answers?: string[];
  explanation?: string;
  options?: { text: string; is_correct: boolean; order: number }[];
}

export async function createQuestion(input: QuestionInput) {
  const { data } = await apiClient.post<QuestionItem>("/questions/", input);
  return data;
}

export async function updateQuestion(
  id: string,
  input: Partial<QuestionInput>
) {
  const { data } = await apiClient.patch<QuestionItem>(
    `/questions/${id}/`,
    input
  );
  return data;
}

export async function deleteQuestion(id: string) {
  await apiClient.delete(`/questions/${id}/`);
}

export async function approveQuestion(id: string) {
  const { data } = await apiClient.post<QuestionItem>(
    `/questions/${id}/approve/`
  );
  return data;
}

export async function rejectQuestion(id: string, reviewNote: string) {
  const { data } = await apiClient.post<QuestionItem>(
    `/questions/${id}/reject/`,
    { review_note: reviewNote }
  );
  return data;
}

export async function duplicateQuestion(id: string) {
  const { data } = await apiClient.post<QuestionItem>(
    `/questions/${id}/duplicate/`
  );
  return data;
}

export async function getQuestion(id: string) {
  const { data } = await apiClient.get<QuestionItem>(`/questions/${id}/`);
  return data;
}

// ===========================================================================
// Wave D1a — bulk import
// ===========================================================================

export interface ImportSummary {
  total: number;
  valid: number;
  errors: number;
}

export interface ImportRowAnalysis {
  row: number;
  bank_name: string;
  text: string;
  question_type: string;
  difficulty: string;
  points: string;
  status: "valid" | "error";
  errors: string[];
}

export interface ImportPreviewResponse {
  dry_run: true;
  summary: ImportSummary;
  rows: ImportRowAnalysis[];
}

export interface ImportCommitResponse {
  dry_run: false;
  summary: ImportSummary;
  result: {
    created_questions: number;
    created_banks: number;
    new_bank_names: string[];
    auto_approved: boolean;
  };
}

export async function downloadQuestionsTemplate(): Promise<void> {
  const response = await apiClient.get("/questions/import_template/", {
    responseType: "blob",
  });
  const url = URL.createObjectURL(response.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = "questions_template.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function previewQuestionsImport(
  file: File
): Promise<ImportPreviewResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("dry_run", "true");
  const { data } = await apiClient.post<ImportPreviewResponse>(
    "/questions/import/",
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data;
}

export async function commitQuestionsImport(
  file: File
): Promise<ImportCommitResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("dry_run", "false");
  const { data } = await apiClient.post<ImportCommitResponse>(
    "/questions/import/",
    form,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data;
}