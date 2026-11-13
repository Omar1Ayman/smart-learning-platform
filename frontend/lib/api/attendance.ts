import { apiClient } from "@/lib/api/client";
import type {
  AttendanceRecord,
  AttendanceSession,
  AttendanceSessionStatus,
  AttendanceStatus,
  Paginated,
  QrPayload,
  TodaySession,
} from "@/types";

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function listAttendanceSessions(params?: {
  page?: number;
  page_size?: number;
  group?: string;
  course?: string;
  teacher?: string;
  status?: AttendanceSessionStatus;
  date?: string;
  ordering?: string;
}) {
  const { data } = await apiClient.get<Paginated<AttendanceSession>>(
    "/attendance/sessions/",
    { params }
  );
  return data;
}

export async function getAttendanceSession(id: string) {
  const { data } = await apiClient.get<AttendanceSession>(
    `/attendance/sessions/${id}/`
  );
  return data;
}

export interface CreateSessionInput {
  group: string;
  course?: string | null;
  lesson?: string | null;
  teacher?: string;
  date: string;
  start_time: string;
  end_time: string;
  mode?: "AUTO_QR" | "MANUAL" | "HYBRID";
  late_threshold_minutes?: number;
  notes?: string;
}

export async function createAttendanceSession(input: CreateSessionInput) {
  const { data } = await apiClient.post<AttendanceSession>(
    "/attendance/sessions/",
    input
  );
  return data;
}

export async function updateAttendanceSession(
  id: string,
  input: Partial<CreateSessionInput>
) {
  const { data } = await apiClient.patch<AttendanceSession>(
    `/attendance/sessions/${id}/`,
    input
  );
  return data;
}

export async function deleteAttendanceSession(id: string) {
  await apiClient.delete(`/attendance/sessions/${id}/`);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function openSession(id: string) {
  const { data } = await apiClient.post<AttendanceSession>(
    `/attendance/sessions/${id}/open/`
  );
  return data;
}

export async function closeSession(id: string) {
  const { data } = await apiClient.post<AttendanceSession>(
    `/attendance/sessions/${id}/close/`
  );
  return data;
}

export async function reopenSession(id: string) {
  const { data } = await apiClient.post<AttendanceSession>(
    `/attendance/sessions/${id}/reopen/`
  );
  return data;
}

// ---------------------------------------------------------------------------
// Quick start — one-click "start attendance now"
// ---------------------------------------------------------------------------

export interface QuickStartResponse extends AttendanceSession {
  /** true = new session, false = resumed existing OPEN session */
  created: boolean;
}

export async function quickStartSession(input: {
  group: string;
  teacher?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  mode?: "AUTO_QR" | "MANUAL" | "HYBRID";
  late_threshold_minutes?: number;
}) {
  const { data } = await apiClient.post<QuickStartResponse>(
    "/attendance/sessions/quick-start/",
    input
  );
  return data;
}

// ---------------------------------------------------------------------------
// QR
// ---------------------------------------------------------------------------

export async function getSessionQrToken(sessionId: string) {
  const { data } = await apiClient.get<QrPayload>(
    `/attendance/sessions/${sessionId}/qr-token/`
  );
  return data;
}

export async function markAttendanceWithQr(sessionId: string, token: string) {
  const { data } = await apiClient.post<AttendanceRecord>(
    "/attendance/mark-qr/",
    { session: sessionId, token }
  );
  return data;
}

// ---------------------------------------------------------------------------
// Records (roster + marking)
// ---------------------------------------------------------------------------

export async function listSessionRecords(sessionId: string) {
  const { data } = await apiClient.get<AttendanceRecord[]>(
    `/attendance/sessions/${sessionId}/records/`
  );
  return data;
}

export async function markManual(
  sessionId: string,
  studentId: string,
  status: AttendanceStatus,
  notes = ""
) {
  const { data } = await apiClient.post<AttendanceRecord>(
    `/attendance/sessions/${sessionId}/mark-manual/`,
    { student: studentId, status, notes }
  );
  return data;
}

export async function markBulk(
  sessionId: string,
  studentIds: string[],
  status: AttendanceStatus
) {
  const { data } = await apiClient.post<{ updated: number; status: string }>(
    `/attendance/sessions/${sessionId}/mark-bulk/`,
    { students: studentIds, status }
  );
  return data;
}

// ---------------------------------------------------------------------------
// Scan card (teacher scans student barcode)
// ---------------------------------------------------------------------------

export interface ScanCardResponse {
  student_id: string;
  student_name: string;
  student_code: string;
  status: AttendanceStatus;
  check_in_at: string | null;
  /** true when the student was already marked (rescan) */
  duplicate: boolean;
}

export async function scanStudentCard(sessionId: string, studentCode: string) {
  const { data } = await apiClient.post<ScanCardResponse>(
    `/attendance/sessions/${sessionId}/scan-card/`,
    { student_code: studentCode }
  );
  return data;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "حاضر",
  LATE: "متأخر",
  ABSENT: "غائب",
  EXCUSED: "بعذر",
};

export const ATTENDANCE_STATUS_STYLE: Record<AttendanceStatus, string> = {
  PRESENT: "bg-success/10 text-success border-success/20",
  LATE: "bg-accent/10 text-accent-dark border-accent/20",
  ABSENT: "bg-danger/10 text-danger border-danger/20",
  EXCUSED: "bg-info/10 text-info border-info/20",
};

export const SESSION_STATUS_LABEL: Record<AttendanceSessionStatus, string> = {
  SCHEDULED: "مجدولة",
  OPEN: "مفتوحة",
  CLOSED: "مغلقة",
  CANCELLED: "ملغاة",
};

export const SESSION_STATUS_STYLE: Record<AttendanceSessionStatus, string> = {
  SCHEDULED: "bg-ink-50 text-ink-700",
  OPEN: "bg-success/10 text-success",
  CLOSED: "bg-ink-50 text-ink-400",
  CANCELLED: "bg-danger/10 text-danger",
};
// ---------------------------------------------------------------------------
// Scanner setup — lookup a student by code (no session context)
// ---------------------------------------------------------------------------

export interface LookupStudentResponse {
  found: boolean;
  received_code: string;
  code_length: number;
  has_whitespace: boolean;
  student?: {
    id: string;
    name: string;
    email: string;
  };
  hint?: string;
}

export async function lookupStudentByCode(studentCode: string) {
  const { data } = await apiClient.post<LookupStudentResponse>(
    "/attendance/lookup-by-code/",
    { student_code: studentCode }
  );
  return data;
}
// ---------------------------------------------------------------------------
// Today's sessions (computed from GroupSchedule) — Sprint 3
// ---------------------------------------------------------------------------

export async function listTodaySessions() {
  const { data } = await apiClient.get<TodaySession[]>(
    "/attendance/sessions/today/"
  );
  return data;
}

export async function startSessionFromSchedule(
  scheduleId: string,
  options?: { force?: boolean }
) {
  const { data } = await apiClient.post<
    AttendanceSession & { created: boolean }
  >("/attendance/sessions/from-schedule/", {
    schedule: scheduleId,
    force: options?.force ?? false,
  });
  return data;
}