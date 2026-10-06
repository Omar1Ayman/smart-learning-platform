import { apiClient } from "@/lib/api/client";
import type { Paginated } from "@/types";

export interface QuestionBankItem {
  id: string;
  name: string;
  description: string;
  subject: string | null;
  grade: string | null;
  is_archived: boolean;
}

export async function listQuestionBanks() {
  const { data } = await apiClient.get<Paginated<QuestionBankItem>>("/question-banks/");
  return data;
}

export interface QuestionBankInput {
  name: string;
  description?: string;
  subject?: string;
  grade?: string;
}

export async function createQuestionBank(input: QuestionBankInput) {
  const { data } = await apiClient.post<QuestionBankItem>("/question-banks/", input);
  return data;
}

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
  options: QuestionOptionItem[];
  review_status: ReviewStatus;
  review_note: string;
  created_by: string | null;
}

export async function listQuestions() {
  const { data } = await apiClient.get<Paginated<QuestionItem>>("/questions/");
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
  options?: { text: string; is_correct: boolean; order: number }[];
}

export async function createQuestion(input: QuestionInput) {
  const { data } = await apiClient.post<QuestionItem>("/questions/", input);
  return data;
}

export async function approveQuestion(id: string) {
  const { data } = await apiClient.post<QuestionItem>(`/questions/${id}/approve/`);
  return data;
}

export async function rejectQuestion(id: string, reviewNote: string) {
  const { data } = await apiClient.post<QuestionItem>(`/questions/${id}/reject/`, { review_note: reviewNote });
  return data;
}
