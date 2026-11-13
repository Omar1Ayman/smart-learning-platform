import { apiClient } from "@/lib/api/client";
import type {
  AttemptDetail,
  AttemptEventType,
  AttemptResult,
  SuspicionResult,
  AttemptEvent,
} from "@/types";

export async function getAttempt(attemptId: string) {
  const { data } = await apiClient.get<AttemptDetail>(`/attempts/${attemptId}/`);
  return data;
}

/**
 * C-6 FIX: the endpoint can now tell us the backend auto-submitted the
 * attempt (e.g. the tenant's `auto_submit_after_tab_switches` threshold
 * was hit). Callers MUST inspect the return value and react to
 * `detail === "auto_submitted"` — silently ignoring the response left
 * the student on a dead exam page with "تعذّر حفظ إجابتك" errors.
 */
export interface AttemptEventResponse {
  detail?: string;
  reason?: string;
}

export async function recordAttemptEvent(
  attemptId: string,
  eventType: AttemptEventType,
  metadata?: Record<string, unknown>
): Promise<AttemptEventResponse | null> {
  try {
    const { data } = await apiClient.post<AttemptEventResponse>(
      `/attempts/${attemptId}/event/`,
      { event_type: eventType, metadata: metadata ?? {} }
    );
    return data;
  } catch {
    // Network failure — silent. We never want to surface anti-cheat
    // telemetry errors to the student mid-exam.
    return null;
  }
}

export async function saveAnswer(
  attemptId: string,
  questionId: string,
  chosenOptionId?: string | null,
  textAnswer?: string
) {
  const { data } = await apiClient.post<AttemptDetail>(`/attempts/${attemptId}/answer/`, {
    question: questionId,
    chosen_option: chosenOptionId ?? null,
    text_answer: textAnswer ?? "",
  });
  return data;
}

export async function submitAttempt(attemptId: string) {
  const { data } = await apiClient.post<AttemptResult>(`/attempts/${attemptId}/submit/`);
  return data;
}

export async function getAttemptResult(attemptId: string) {
  const { data } = await apiClient.get<AttemptResult>(`/attempts/${attemptId}/result/`);
  return data;
}

export interface GradingAnswer {
  question: string;
  question_text: string;
  question_type: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "ESSAY";
  text_answer: string;
  max_points: string;
  awarded_points: string | null;
  is_correct: boolean | null;
  graded_at: string | null;
}

export interface GradingPayload {
  attempt: AttemptResult;
  essay_answers: GradingAnswer[];
  pending_essays: number;
  events: AttemptEvent[];
  suspicion: SuspicionResult;
}

export async function getAttemptForGrading(attemptId: string) {
  const { data } = await apiClient.get<GradingPayload>(`/attempts/${attemptId}/grading/`);
  return data;
}

export async function gradeEssay(
  attemptId: string,
  questionId: string,
  awardedPoints: string,
  isCorrect: boolean
) {
  const { data } = await apiClient.post<AttemptResult>(
    `/attempts/${attemptId}/grade_essay/`,
    { question: questionId, awarded_points: awardedPoints, is_correct: isCorrect }
  );
  return data;
}

export async function finalizeAttempt(attemptId: string) {
  const { data } = await apiClient.post<AttemptResult>(`/attempts/${attemptId}/finalize/`);
  return data;
}

/**
 * Wave B2 — reopen a closed attempt so the student can continue.
 * Staff-only (server-side); the caller (results page) must also be
 * shown only to staff.
 *
 * extended_minutes: if provided, overrides the assessment's default
 * duration for the new timer window.
 */
export async function reopenAttempt(attemptId: string, extendedMinutes?: number) {
  const { data } = await apiClient.post<AttemptResult>(
    `/attempts/${attemptId}/reopen/`,
    extendedMinutes !== undefined ? { extended_minutes: extendedMinutes } : {}
  );
  return data;
}

/**
 * Wave B2 — mark an attempt as VOIDED. Voided attempts don't count
 * towards the student's max_attempts, so they can retry.
 */
export async function voidAttempt(attemptId: string, reason?: string) {
  const { data } = await apiClient.post<AttemptResult>(
    `/attempts/${attemptId}/void/`,
    reason ? { reason } : {}
  );
  return data;
}

/**
 * Wave C2 — bulk grade.
 *
 * Sends multiple attempts' grades in one request. Each attempt is its
 * own transaction on the backend, so failures are per-item (never
 * all-or-nothing). The response tells you which succeeded/failed.
 */
export interface BulkGradeEntry {
  attempt_id: string;
  grades: Array<{
    question_id: string;
    awarded_points: string;
    is_correct: boolean;
  }>;
  finalize?: boolean;
}

export interface BulkGradeResult {
  attempt_id: string | null;
  status?: string;
  score?: string | null;
  is_passed?: boolean | null;
  error?: string;
}

export async function bulkGradeAttempts(attempts: BulkGradeEntry[]) {
  const { data } = await apiClient.post<{ results: BulkGradeResult[] }>(
    "/attempts/bulk_grade/",
    { attempts }
  );
  return data.results;
}