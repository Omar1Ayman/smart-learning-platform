export type Role = "OWNER" | "ADMIN" | "TEACHER" | "STUDENT" | "PARENT";

export type EnrollmentStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "SUSPENDED"
  | "TRANSFERRED"
  | "GRADUATED"
  | "FAILED"
  | "ARCHIVED"
  | "COMPLETED"; 
export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  primary_color: string;   
  logo_url: string;        
  contact_email: string;   
}


export interface Enrollment {
  id: string;
  student: string;
  student_email: string;
  student_name: string;
  group: string;
  group_name: string;
  academic_year: string;
  academic_year_name: string;
  term: string | null;
  term_name: string | null;
  status: EnrollmentStatus;
  enrolled_at: string;
}
export interface CurrentUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  tenant: TenantSummary | null;
  can_view_audit_log?: boolean;
  is_platform_admin: boolean;
  two_factor_enabled: boolean;
}
export type AcademicYearStatus = "DRAFT" | "ACTIVE" | "CLOSING" | "ARCHIVED";

export interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: AcademicYearStatus;
  status_display?: string;
  is_active: boolean;
  activated_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Term {
  id: string;
  academic_year: string;
  name: string;
  start_date: string;
  end_date: string;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}


// ---------- Exam engine (Wave 9D) ----------

export interface AttemptOption {
  id: string;
  text: string;
  order: number;
}

export interface AttemptQuestion {
  id: string;
  text: string;
  question_type: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "ESSAY";
  points: string;
  options: AttemptOption[];
}

export type AttemptStatus = "IN_PROGRESS" | "SUBMITTED" | "GRADED" | "EXPIRED" | "VOIDED";

export interface AttemptAnswerState {
  chosen_option: string | null;
  text_answer: string;
}

export interface AttemptDetail {
  id: string;
  assessment: string;
  assessment_title: string;
  attempt_number: number;
  status: AttemptStatus;
  started_at: string;
  expires_at: string | null;
  submitted_at: string | null;
  max_score: string;
  questions: AttemptQuestion[];
  answers: Record<string, AttemptAnswerState>;
  time_remaining_seconds: number | null;
    tenant_policies: {
    force_fullscreen: boolean;
    auto_submit_after_tab_switches: number;
  };
}

export interface AttemptResultAnswer {
  question: string;
  question_text: string;
  question_type: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "ESSAY";
  chosen_option: string | null;
  text_answer: string;
  is_correct: boolean | null;
  awarded_points: string | null;
  explanation: string | null;
}

export interface AttemptResult {
  id: string;
  assessment: string;
  assessment_title: string;
  student: string;
  student_name: string;
  student_email: string;
  attempt_number: number;
  status: AttemptStatus;
  started_at: string;
  submitted_at: string;
  graded_at: string | null;
  score: string;
  max_score: string;
  percentage: number;
  is_passed: boolean | null;
  suspicion_level: "clean" | "minor" | "major";
  suspicion_score: number;
  answers: AttemptResultAnswer[];
  tenant_policies: {
    show_correct_answers_after_submit: boolean;
  };
  // F-21 (Milestone 3, Batch 11): drives the Retry CTA.
  can_retry: boolean;
  retry_reason: string | null;
}export interface StudentAssessment {
  id: string;
  title: string;
  description: string;
  assessment_type: string;
  starts_at: string | null;
  ends_at: string | null;
  duration_minutes: number | null;
  max_attempts: number;
  passing_score: string | null;
  my_attempts_used: number;
  has_in_progress_attempt: boolean;
  force_fullscreen: boolean;
  window: AssessmentWindow;   
}
// ---------- Wave B3 — Preview as student ----------

export interface AssessmentPreview {
  assessment: StaffAssessment;
  questions: AttemptQuestion[];
  max_score: string;
  /** How many questions a real student will see (honors question_count). */
  effective_question_count: number;
  /** Full pool size — what the teacher sees in the preview. */
  total_question_count: number;
  /** How many students this assessment currently targets. */
  reach: number;
}

// ---------- Staff assessment (Wave 10) ----------

export type AssessmentStatus = "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";

export interface StaffAssessment {
  id: string;
  title: string;
  description: string;
  assessment_type: string;
  status: AssessmentStatus;
  starts_at: string | null;
  ends_at: string | null;
  duration_minutes: number | null;
  max_attempts: number;
  passing_score: string | null;
  published_at: string | null;
  randomize_question_order: boolean;
  randomize_option_order: boolean;
  question_count: number | null;
  created_by: string | null;
  created_by_email: string | null;        
  targets_summary: string[];              
  questions_count: number;                
  attempts_count: number;                 
  submissions_count: number;              
  created_at: string;
  updated_at: string;
   late_entry_minutes: number | null;      
  entry_cutoff_minutes: number | null;    
}
export interface AssessmentQuestionLink {
  id: string;
  assessment: string;
  question: string;
  order: number;
  points_override: string | null;
}

export interface AssessmentTargetLink {
  id: string;
  assessment: string;
  target_type: "TENANT" | "STAGE" | "GRADE" | "GROUP" | "STUDENT";
  stage: string | null;
  grade: string | null;
  group: string | null;
  student: string | null;
  opens_at: string | null;   
  closes_at: string | null;   
}

// ---------- Wizard (Wave 11) ----------

export interface WizardBasicInfo {
  title: string;
  assessment_type: string;
  description: string;
}

export interface WizardSchedule {
  starts_at: string;
  ends_at: string;
  duration_minutes: string;
  late_entry_minutes: string;      // S-05
  entry_cutoff_minutes: string;    // S-05
}

export interface WizardSettings {
  max_attempts: string;
  passing_score: string;
  randomize_question_order: boolean;
  randomize_option_order: boolean;
  question_count: string;
}

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;


// ---------- Promotion (Wave 15) ----------

export type PromotionAction = "PROMOTE" | "REPEAT" | "TRANSFER" | "GRADUATE";

export interface PromotionItem {
  enrollment: string;
  action: PromotionAction;
  target_group?: string | null;
}

export interface PromotionRequest {
  target_academic_year: string;
  dry_run: boolean;
  items: PromotionItem[];
}

export interface PromotionResultRow {
  student: string;
  from_enrollment: string;
  action: PromotionAction;
  to_group: string | null;
  to_academic_year: string | null;
  new_enrollment: string | null;
}

export interface PromotionResponse {
  dry_run: boolean;
  results: PromotionResultRow[];
}

// ---------- Dashboard (Wave 16) ----------

export interface TimeSeriesPoint {
  date: string;
  attempts: number;
  avg_percentage: number | null;
}

export interface AssessmentSummary {
  id: string;
  title: string;
  assessment_type: string;
  status: string;
  attempts_count: number;
  avg_percentage: number | null;
  created_at: string;
}

export interface StudentSummary {
  id: string;
  email: string;
  name: string;
  enrolled_at: string;
  group_name: string;
}

export interface UpcomingAssessment {
  id: string;
  title: string;
  assessment_type: string;
  starts_at: string | null;
  ends_at: string | null;
  duration_minutes: number | null;
  my_attempts_used: number;
  max_attempts: number;
  // F-20 (Milestone 3, Batch 10): direct resume support.
  has_in_progress_attempt: boolean;
  in_progress_attempt_id: string | null;
  /** Phase A — effective window state for this student.
   * Optional because older responses may omit it; treat missing as
   * "unknown" (not gated). */
  window?: AssessmentWindow;
}

export interface RecentResult {
  attempt_id: string;
  assessment_id: string;
  assessment_title: string;
  score: string | null;
  max_score: string;
  percentage: number;
  is_passed: boolean | null;
  status: string;
  submitted_at: string | null;
}

export interface AdminDashboard {
  metrics: {
    total_students: number;
    total_teachers: number;
    active_assessments: number;
    /** Wave D0c-3a — attempts within the selected date range (default 7d). */
    attempts_in_range: number;
    /** Wave D0c-3a — echoes back the range so the UI can render "آخر X يوماً". */
    range_days: number;
    avg_percentage: number | null;
  };
  chart: TimeSeriesPoint[];
  recent_assessments: AssessmentSummary[];
  recent_students: StudentSummary[];
}

// Batch 14 (Milestone 4): one pending-grading item for the teacher hero.
export interface PendingGradingItem {
  attempt_id: string;
  assessment_id: string;
  assessment_title: string;
  student_email: string;
  student_name: string;
  submitted_at: string;
  pending_essays: number;
}

export interface TeacherDashboard {
  metrics: {
    my_students: number;
    my_active_assessments: number;
    pending_grading: number;
    avg_percentage: number | null;
    attempts_in_range: number;
    range_days: number;
  };
  chart: TimeSeriesPoint[];
  recent_assessments: AssessmentSummary[];
  // Batch 14: top 5 attempts awaiting manual grading.
  pending_grading_items: PendingGradingItem[];
}
export interface StudentDashboard {
  metrics: {
    upcoming_assessments: number;
    total_attempts: number;
    avg_percentage: number | null;
    pass_rate: number | null;
    range_days: number;
  };
  chart: TimeSeriesPoint[];
  upcoming: UpcomingAssessment[];
  recent_results: RecentResult[];
  // F-20 (Batch 10): shown as a badge in the greeting.
  unread_notifications_count: number;
}

// ---------- Platform Admin (Wave 19) ----------

export type PlatformTenantStatus =
  | "LEAD"
  | "PENDING"
  | "TRIAL"
  | "ACTIVE"
  | "SUSPENDED"
  | "CHURNED";

export interface PlatformTenantListItem {
  id: string;
  name: string;
  slug: string;
  status: PlatformTenantStatus;
  trial_ends_at: string | null;
  user_count: number;
  owner_email: string | null;
  created_at: string;
}

export interface PlatformTenantUser {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  first_name: string;
  last_name: string;
}

export interface PlatformTenantDetail {
  id: string;
  name: string;
  slug: string;
  status: PlatformTenantStatus;
  trial_ends_at: string | null;
  contact_email: string;
  primary_color: string;
  logo_url: string;
  internal_notes: string;
  created_at: string;
  updated_at: string;
  users: PlatformTenantUser[];
}

export interface PlatformMetrics {
  tenants: {
    total: number;
    lead: number;
    pending: number;
    trial: number;
    active: number;
    suspended: number;
    churned: number;
  };
  total_users: number;
  demo_requests_new: number;
  exams: {
    published_total: number;
    in_progress_now: number;
    pending_grading: number;
    submissions_today: number;
    submissions_this_week: number;
    suspicious_attempts_week: number;
  };
  top_tenants: Array<{
    id: string;
    name: string;
    status: PlatformTenantStatus;
    published_exams: number;
    attempts: number;
    submissions: number;
  }>;
  generated_at: string;
}

export type DemoRequestStatus = "NEW" | "CONTACTED" | "CONVERTED" | "DECLINED";

export interface DemoRequest {
  id: string;
  school_name: string;
  contact_name: string;
  email: string;
  phone: string;
  num_students: number | null;
  message: string;
  status: DemoRequestStatus;
  notes: string;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  converted_tenant_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTenantInput {
  tenant_name: string;
  owner_email: string;
  owner_password: string;
  owner_first_name?: string;
  owner_last_name?: string;
  status?: PlatformTenantStatus;
  trial_days?: number;
  contact_email?: string;
  internal_notes?: string;
}

// ---------- 2FA (Wave 20) ----------
export interface TwoFactorSetupResponse {
  secret: string;
  provisioning_uri: string;
  recovery_codes: string[];
}

export interface TwoFactorLoginChallenge {
  requires_2fa: true;
  twofa_token: string;
}


// ---------- Wave 23 — Sessions & Audit ----------

export interface UserSession {
  id: string;
  device_label: string;
  ip_address: string | null;
  user_agent: string;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  revoked_reason: string;
  is_current: boolean;
  status: "active" | "revoked";
}

export interface SessionsResponse {
  sessions: UserSession[];
  active_count: number;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  action_label: string;
  actor: string | null;
  actor_email: string | null;
  actor_role: string | null;
  object_type: string;
  object_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ---------- Wave 24 — Tenant Ops ----------

export interface ImportRowAnalysis {
  row: number;
  email: string;
  first_name: string;
  last_name: string;
  group_name: string;
  group_id: string | null;
  status: "valid" | "skip" | "error";
  reason: string;
  errors: string[];
}

export interface ImportSummary {
  total: number;
  valid: number;
  skipped: number;
  errors: number;
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
    created_students: number;
    created_enrollments: number;
    skipped: number;
  };
}
// ---------- Wave 25 — Anti-cheat ----------

export type AttemptEventType =
  | "TAB_HIDDEN"
  | "COPY_ATTEMPT"
  | "PASTE_ATTEMPT"
  | "RIGHT_CLICK"
  | "FULLSCREEN_EXIT"
  | "DEVTOOLS_OPEN";

export interface AttemptEvent {
  id: string;
  event_type: AttemptEventType;
  event_label: string;
  metadata: Record<string, unknown>;
  occurred_at: string;
}

export interface SuspicionBreakdown {
  event_type: AttemptEventType;
  count: number;
  contribution: number;
}

export interface SuspicionResult {
  score: number;
  level: "clean" | "minor" | "major";
  breakdown: SuspicionBreakdown[];
}

// ---------- Profile (Wave 26) ----------

export interface Profile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  tenant_name: string | null;
  two_factor_enabled: boolean;
}


// ---------- Wave 27 — Student/Teacher Profiles ----------

export interface StudentEnrollmentContext {
  group_id: string;
  group_name: string;
  grade_name: string;
  stage_name: string;
  academic_year_name: string;
}

export interface AttemptsSummary {
  total_attempts: number;
  graded_attempts: number;
  passed_attempts: number;
  average_percentage: number;
}

export interface RecentAttempt {
  attempt_id: string;
  assessment_id: string;
  assessment_title: string;
  score: string | null;
  max_score: string;
  percentage: number;
  is_passed: boolean | null;
  status: string;
  submitted_at: string;
}

export interface StudentDetail {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: "STUDENT";
  tenant_name: string | null;
  student_code: string | null;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  current_enrollment: StudentEnrollmentContext | null;
  attempts_summary: AttemptsSummary;
  recent_attempts: RecentAttempt[];
  created_at: string;
}

export interface TeacherAssignmentInfo {
  id: string;
  course_name: string;
  subject_name: string;
  grade_name: string;
  group_names: string[];
  scope_label: string;
}

export interface TeacherDetail {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: "TEACHER";
  tenant_name: string | null;
  assignments: TeacherAssignmentInfo[];
  students_summary: { total_students: number };
  assessments_summary: {
    total_assessments: number;
    published: number;
    drafts: number;
    pending_grading: number;
  };
  recent_assessments: {
    id: string;
    title: string;
    assessment_type: string;
    status: string;
    created_at: string;
  }[];
  created_at: string;
}

// ---------- Wave 28 — Tenant Settings ----------

export interface TenantExamPolicy {
  allow_retakes: boolean;
  max_attempts_default: number;
  force_fullscreen: boolean;
  auto_submit_after_tab_switches: number;
  show_correct_answers_after_submit: boolean;
  teachers_can_self_publish: boolean;
  shuffle_questions_default: boolean;
  shuffle_options_default: boolean;
}

export interface TenantQuestionPolicy {
  require_review: boolean;
  owners_can_self_approve: boolean;
}

export interface TenantContentPolicy {
  teachers_can_edit_others_content: boolean;
  max_file_size_mb: number;
}

export interface TenantNotificationPolicy {
  email_on_exam_publish: boolean;
  email_on_result: boolean;
}

export interface TenantSettings {
  exam_policy: TenantExamPolicy;
  question_policy: TenantQuestionPolicy;
  content_policy: TenantContentPolicy;
  notification_policy: TenantNotificationPolicy;
  permissions: TenantPermissions;
}

export interface TenantBranding {
  name: string;
  primary_color: string;
  logo_url: string;
  contact_email: string;
}


// ---------- Wave 30 — Notifications ----------

export type NotificationType =
  | "EXAM_PUBLISHED"
  | "EXAM_SUBMITTED"
  | "EXAM_GRADED"
  | "QUESTION_APPROVED"
  | "QUESTION_REJECTED"
  | "QUESTION_PENDING"
  | "ENROLLMENT_CREATED"
  | "SYSTEM"
  | "EXAM_REOPENED"
  | "ABSENCE_ALERT";
export interface Notification {
  id: string;
  type: NotificationType;
  type_label: string;
  title: string;
  message: string;
  link: string;
  is_read: boolean;
  created_at: string;
}

// ---------- Wave 31 — Enhanced Course ----------

export interface Course {
  id: string;
  subject: string;
  subject_name: string;
  grade: string;
  grade_name: string;
  stage: string;
  stage_name: string;
  academic_year: string;
  academic_year_name: string;
  term: string | null;
  term_name: string | null;
  name: string;
  description: string;
  is_active: boolean;
   lessons_count: number;   
  teachers_count: number;  
  created_at: string;
  updated_at: string;
}


// ---------- Wave 31 — Drill-down payloads ----------

export interface StageDetail {
  stage: { id: string; name: string; order: number };
  grades: Array<{
    id: string;
    name: string;
    order: number;
    courses_count: number;
    groups_count: number;
    students_count: number;
  }>;
  summary: {
    grades_count: number;
    total_students: number;
  };
}

export interface GradeDetail {
  grade: { id: string; name: string; order: number; stage: string };
  courses: Array<{
    id: string;
    name: string;
    subject_name: string;
    academic_year_name: string | null;
    term_name: string | null;
  }>;
  groups: Array<{
    id: string;
    name: string;
    student_count: number;
    academic_year: string;
    capacity: number | null;
  }>;
  teachers: Array<{
    id: string;
    email: string;
    name: string;
    courses: string[];
  }>;
  summary: {
    courses_count: number;
    groups_count: number;
    teachers_count: number;
    total_students: number;
  };
}

export interface CourseDetail {
  course: Course;
  chapters: Array<{
    id: string;
    name: string;
    order: number;
    lessons: Array<{ id: string; name: string; order: number }>;
  }>;
  teachers: Array<{
    id: string;
    email: string;
    name: string;
    groups: Array<{ id: string; name: string }>;
    scope_label: string;
  }>;
  groups: Array<{
    id: string;
    name: string;
    student_count: number;
    academic_year: string;
  }>;
  assessments: Array<{
    id: string;
    title: string;
    assessment_type: string;
    status: string;
    created_at: string;
  }>;
  content: {
    count: number;
    recent: Array<{
      id: string;
      title: string;
      content_type: string;
      created_at: string;
    }>;
  };
}

// ---------- Wave 32A — Lesson & Group Drill-down ----------

export interface LessonDetail {
  lesson: { id: string; name: string; order: number };
  chapter: { id: string; name: string };
  course: {
    id: string;
    name: string;
    subject_name: string;
    grade_name: string;
  };
  content: Array<{
    id: string;
    title: string;
    content_type: string;
    is_published: boolean;
    created_at: string;
  }>;
  nav: {
    prev: { id: string; name: string } | null;
    next: { id: string; name: string } | null;
  };
}

export interface GroupDetail {
  group: { id: string; name: string; capacity: number | null };
  grade: { id: string; name: string };
  academic_year: { id: string; name: string };
  students: Array<{
    id: string;
    email: string;
    name: string;
    status: string;
    term_name: string | null;
  }>;
  teachers: Array<{
    id: string;
    email: string;
    name: string;
    course_name: string;
  }>;
  summary: {
    students_count: number;
    teachers_count: number;
  };
}

// ---------- Wave 34 — Setup Status ----------

export interface SetupStep {
  key: string;
  label: string;
  count: number;
  done: boolean;
  blocked_by: string | null;
  importance: "required" | "recommended";
  action_url: string | null;
  // Batch 17 additions:
  estimated_minutes: number;
  why: string;
  on_minimal_path: boolean;
}

export interface SetupMinimalPath {
  keys: string[];
  done_count: number;
  total_count: number;
  complete: boolean;
}
export interface AfterCompleteAction {
  key: string;
  label: string;
  description: string;
  action_url: string;
  icon: string;
}

export interface SetupStatus {
  complete: boolean;
  steps: SetupStep[];
  counts: Record<string, number>;
  next_action: SetupStep | null;
  minimal_path: SetupMinimalPath;
  estimated_minutes_remaining: number;
  after_complete: AfterCompleteAction[];
}

// ---------- Wave C3 — Analytics ----------

export interface QuestionAnalytics {
  question_id: string;
  question_text: string;
  question_type: "MCQ" | "TRUE_FALSE" | "SHORT_ANSWER" | "ESSAY";
  order: number;
  points: string;
  total_answers: number;
  correct_count: number;
  wrong_count: number;
  pending_count: number;
  graded_count: number;
  correct_percentage: number | null;
  avg_awarded_points: string | null;
}

export interface DistributionBucket {
  bucket: string;
  count: number;
}

export interface AssessmentAnalytics {
  assessment: {
    id: string;
    title: string;
    assessment_type: string;
    status: string;
    max_attempts: number;
    passing_score: string | null;
  };
  summary: {
    total_attempts: number;
    graded_attempts: number;
    pending_attempts: number;
    passed: number;
    failed: number;
    pass_rate: number | null;
    avg_percentage: number | null;
    highest_score: string | null;
    lowest_score: string | null;
    targeted_students: number;
  };
  distribution: DistributionBucket[];
  hardest_questions: QuestionAnalytics[];
  easiest_questions: QuestionAnalytics[];
  all_questions: QuestionAnalytics[];
  has_data: boolean;
}
// ---------- Wave 2A — Attendance ----------

export type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";
export type AttendanceMethod = "QR" | "MANUAL" | "AUTO";
export type AttendanceSessionStatus = "SCHEDULED" | "OPEN" | "CLOSED" | "CANCELLED";
export type AttendanceSessionMode = "AUTO_QR" | "MANUAL" | "HYBRID";

export interface AttendanceSession {
  id: string;
  group: string;
  group_name: string;
  course: string | null;
  course_name: string | null;
  lesson: string | null;
  lesson_name: string | null;
  teacher: string;
  teacher_email: string;
  date: string;
  start_time: string;
  end_time: string;
  status: AttendanceSessionStatus;
  mode: AttendanceSessionMode;
  late_threshold_minutes: number;
  opened_at: string | null;
  closed_at: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  total_students: number;
  present_count: number;
  late_count: number;
  absent_count: number;
}

export interface AttendanceRecord {
  id: string;
  session: string;
  student: string;
  student_email: string;
  student_name: string;
  status: AttendanceStatus;
  check_in_method: AttendanceMethod;
  check_in_at: string | null;
  marked_by: string | null;
  notes: string;
}

export interface QrPayload {
  token: string;
  window_index: number;
  window_seconds: number;
  expires_in_seconds: number;
  qr_url: string;
}

// ---------- Parent Portal ----------

export interface ParentChildSummary {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  student_code: string | null;
  relationship: "FATHER" | "MOTHER" | "GUARDIAN";
  is_primary: boolean;
  group_name: string | null;
  grade_name: string | null;
  stage_name: string | null;
  academic_year_name: string | null;
  attendance_pct: number | null;
  avg_percentage: number | null;
  total_attempts: number;
}

export interface ParentChildRecentAttendance {
  date: string;
  start_time: string;
  end_time: string;
  group_name: string;
  status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";
  check_in_at: string | null;
}

export interface ParentChildRecentAttempt {
  attempt_id: string;
  assessment_title: string;
  attempt_number: number;
  status: string;
  score: string | null;
  max_score: string;
  percentage: number;
  is_passed: boolean | null;
  submitted_at: string | null;
}

export interface ParentChildDetail extends ParentChildSummary {
  current_enrollment: {
    group_name: string;
    grade_name: string;
    stage_name: string;
    academic_year_name: string;
  } | null;
  attendance: {
    total_sessions: number;
    percentage: number | null;
  };
  exams: {
    total_graded: number;
    average_percentage: number | null;
  };
  recent_attendance: ParentChildRecentAttendance[];
  recent_attempts: ParentChildRecentAttempt[];
}

export interface ParentLink {
  id: string;
  parent_id: string;
  parent_email: string;
  parent_name: string;
  relationship: "FATHER" | "MOTHER" | "GUARDIAN";
  is_primary: boolean;
}
// ---------- Recurring Sessions (Today Widget) ----------

export interface TodaySession {
  schedule_id: string;
  group_id: string;
  group_name: string;
  start_time: string;
  end_time: string;
  teacher_email: string | null;
  session_id: string | null;
  session_status: "SCHEDULED" | "OPEN" | "CLOSED" | "CANCELLED" | null;
  can_start: boolean;
  // Batch 20: time-of-day gating
  starts_in_minutes: number;
  ready_to_start: boolean;
  state: "ready" | "upcoming" | "late" | "missed";
}
// ---------- Exam Window (Phase A) ----------

export type AssessmentWindowState = "OPEN" | "NOT_YET" | "CLOSED" | "NO_TARGET";

export interface AssessmentWindow {
  state: AssessmentWindowState;
  can_start: boolean;
  reason: string;
  opens_at: string | null;
  closes_at: string | null;
  latest_entry_at: string | null;
  max_duration_if_started_now: number | null;
}
// ---------- Batch 18 — Admin Reports ----------

export interface AttendanceGroupReport {
  group_id: string;
  group_name: string;
  total_sessions: number;
  total_present: number;
  total_records: number;
  avg_present_pct: number | null;
}

export interface AttendanceTrendPoint {
  date: string;
  sessions: number;
  present_pct: number | null;
}

export interface AssessmentVolumeRow {
  assessment_id: string;
  title: string;
  attempts: number;
  completed: number;
}

export type TeacherActivity = "active" | "low" | "inactive";

export interface TeacherActivityRow {
  teacher_id: string;
  name: string;
  email: string;
  assessments_created: number;
  content_uploaded: number;
  sessions_taught: number;
  grading_pending: number;
  total_actions: number;
  activity: TeacherActivity;
}

export interface AdminReports {
  range_days: number;
  attendance: {
    overall_rate: number | null;
    by_group: AttendanceGroupReport[];
    trend: AttendanceTrendPoint[];
  };
  exams: {
    total_attempts: number;
    completed: number;
    pending_grading: number;
    in_progress: number;
    avg_score_pct: number | null;
    by_assessment: AssessmentVolumeRow[];
  };
  teachers: {
    total: number;
    active: number;
    inactive: number;
    by_teacher: TeacherActivityRow[];
  };
  generated_at: string;
}

// ---------- Wave 35 — Tenant Permissions ----------

export interface TenantPermissions {
  // Teacher
  teachers_can_create_assessments: boolean;
  teachers_can_delete_own_assessments: boolean;
  teachers_can_view_all_student_results: boolean;
  teachers_can_create_questions: boolean;
  teachers_can_mark_attendance: boolean;
  teachers_can_import_students: boolean;
  teachers_can_export_data: boolean;
  teachers_can_manage_own_content: boolean;
  teachers_can_publish_content_directly: boolean;
  teachers_can_delete_others_content: boolean;

  // Admin
  admins_can_manage_teachers: boolean;
  admins_can_delete_assessments: boolean;
  admins_can_approve_questions: boolean;
  admins_can_export_data: boolean;
  admins_can_view_billing: boolean;
  admins_can_manage_settings: boolean;

  // Advanced
  enable_audit_log_for_teachers: boolean;
  enable_bulk_import: boolean;
}

// ============================================================================
// Phase 1.10-1.12 — Rollover Wizard
// ============================================================================

export interface ClosePreflightIssue {
  severity: "error" | "warning";
  code: string;
  count: number;
  message: string;
}

export interface ClosePreflightStats {
  groups: number;
  courses: number;
  terms: number;
  active_enrollments: number;
}

export interface ClosePreflight {
  can_close: boolean;
  year: {
    id: string;
    name: string;
    status: AcademicYearStatus;
  };
  issues: ClosePreflightIssue[];
  stats: ClosePreflightStats;
}

export interface PrepareNextYearInput {
  name: string;
  start_date: string;
  end_date: string;
  copy_terms: boolean;
  copy_groups: boolean;
  copy_courses: boolean;
}

export interface PrepareNextYearResponse {
  new_year_id: string;
  new_year_name: string;
  reused_existing?: boolean;
  request_changed?: boolean;
  copied: {
    terms?: number;
    groups?: number;
    courses?: number;
  };
}




export interface PromoteStudentsInput {
  target_year: string;
  items: PromotionItem[];
}

export interface PromotionResultItem {
  enrollment: string;
  student: string;
  action: PromotionAction;
  status: "ok";
  new_enrollment_id: string | null;
}

export interface PromoteStudentsResponse {
  results: PromotionResultItem[];
}