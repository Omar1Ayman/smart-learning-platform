/**
 * Batch 19.1: friendly display of AuditLog metadata.
 *
 * The backend stores raw JSON in `AuditLog.metadata` — correct for
 * forensics, but unfriendly for school owners. This module provides:
 *   - Arabic labels for known keys ("count" → "العدد")
 *   - Arabic labels for known enum values ("PRESENT" → "حاضر")
 *   - A passthrough for unknown keys/values, so nothing is lost
 *
 * Two exports:
 *   - `formatMetadataForDisplay(metadata)` → { label, value }[] for the
 *     friendly view
 *   - `formatMetadataAsJson(metadata)` → pretty-printed string for the
 *     raw view
 */

const KEY_LABELS: Record<string, string> = {
  count: "العدد",
  status: "الحالة",
  group: "المجموعة",
  group_id: "معرّف المجموعة",
  date: "التاريخ",
  target_academic_year: "السنة الدراسية المستهدفة",
  source_id: "المعرّف الأصلي",
  source_text: "النص الأصلي",
  source_name: "الاسم الأصلي",
  source_title: "العنوان الأصلي",
  reason: "السبب",
  extended_minutes: "الدقائق الممتدة",
  student_email: "بريد الطالب",
  teacher_email: "بريد المعلم",
  owner_email: "بريد المالك",
  review_note: "ملاحظة المراجعة",
  academic_year: "السنة الدراسية",
  term: "الترم",
  section: "القسم",
  sections: "الأقسام",
  fields: "الحقول",
  force: "إجباري",
  forced: "تم بالإجبار",
  question_type: "نوع السؤال",
  content_type: "نوع المحتوى",
  weekday: "يوم الأسبوع",
  new_bank_names: "أسماء البنوك الجديدة",
  total_rows: "إجمالي الصفوف",
  created_questions: "الأسئلة المُنشأة",
  created_banks: "البنوك المُنشأة",
  created_students: "الطلاب المُنشأون",
  created_enrollments: "التسجيلات المُنشأة",
  skipped: "تم تخطيه",
  sessions: "الجلسات",
  sent: "تم إرسالها",
  no_email: "بدون بريد",
  policy_disabled: "السياسة معطلة",
  from: "من",
  to: "إلى",
  device: "الجهاز",
  other_sessions_revoked: "جلسات أخرى تم إنهاؤها",
  kept_current: "تم الاحتفاظ بالجلسة الحالية",
  status_before: "الحالة قبل",
};

const VALUE_LABELS: Record<string, string> = {
  // Attendance statuses
  PRESENT: "حاضر",
  LATE: "متأخر",
  ABSENT: "غائب",
  EXCUSED: "بعذر",
  // Session statuses
  SCHEDULED: "مجدولة",
  OPEN: "مفتوحة",
  CLOSED: "مغلقة",
  CANCELLED: "ملغاة",
  // Assessment statuses
  DRAFT: "مسودة",
  PUBLISHED: "منشور",
  ARCHIVED: "مؤرشف",
  // Attempt statuses
  IN_PROGRESS: "قيد التنفيذ",
  SUBMITTED: "بانتظار التصحيح",
  GRADED: "مصححة",
  EXPIRED: "منتهية",
  VOIDED: "ملغاة",
  // Question review
  PENDING: "بانتظار المراجعة",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
  // Question types
  MCQ: "اختيار متعدد",
  TRUE_FALSE: "صح / خطأ",
  SHORT_ANSWER: "إجابة قصيرة",
  ESSAY: "مقالي",
  // Content types
  PDF: "PDF",
  VIDEO: "فيديو",
  IMAGE: "صورة",
  DOCUMENT: "مستند",
  EXTERNAL_LINK: "رابط خارجي",
  TEXT: "نص",
  BOOK: "كتاب",
  SUMMARY: "ملخص",
  LESSON_EXPLANATION: "شرح درس",
  CHAPTER_RESOURCE: "مرفق فصل",
  // Roles
  OWNER: "مالك",
  ADMIN: "مسؤول",
  TEACHER: "معلم",
  STUDENT: "طالب",
  PARENT: "ولي أمر",
};

/**
 * Translates a single value: known enum → Arabic, everything else → str.
 * Booleans and nulls become Arabic too, so the friendly view is 100% Arabic.
 */
function translateValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    return VALUE_LABELS[value] ?? value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.map((v) => translateValue(v)).join("، ");
  }
  if (typeof value === "object") {
    // Nested object — flatten as key: value on one line
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${KEY_LABELS[k] ?? k}: ${translateValue(v)}`)
      .join(" · ");
  }
  return String(value);
}

export interface FormattedMetadataRow {
  key: string;
  label: string;
  value: string;
  rawValue: unknown;
}

/**
 * Returns a display-friendly view of the metadata object:
 *   [{ key, label, value, rawValue }, ...]
 *
 * Unknown keys keep their original key name as the label so nothing is
 * silently dropped — an admin can still tell what field appeared.
 */
export function formatMetadataForDisplay(
  metadata: Record<string, unknown> | null | undefined
): FormattedMetadataRow[] {
  if (!metadata) return [];
  return Object.entries(metadata).map(([key, rawValue]) => ({
    key,
    label: KEY_LABELS[key] ?? key,
    value: translateValue(rawValue),
    rawValue,
  }));
}

export function formatMetadataAsJson(
  metadata: Record<string, unknown> | null | undefined
): string {
  return JSON.stringify(metadata ?? {}, null, 2);
}