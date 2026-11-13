"""
Data export and bulk student import.

Export rationale:
- Owners sign up for a SaaS knowing they can leave. Data portability is
  as much a trust feature as a compliance one — see Privacy Policy §7.
- Formats chosen for the "if we leave, can we actually use this" test:
  CSV is universal (Excel, Google Sheets, Numbers, any BI tool) and
  doesn't rot.
- CSVs are UTF-8 with BOM so Excel on Windows opens Arabic correctly.
  Without the BOM, Excel defaults to cp1252 and mangles every non-ASCII
  byte.
- Files themselves (PDFs, videos) are NOT bundled — they'd be hundreds
  of MB. Their filenames are recorded so an owner can ask us for the
  binary archive out-of-band.

Import rationale:
- The "500 students in 5 minutes" workflow schools actually want.
- Validation runs before any write; if ANY row fails, the whole batch
  is rejected. This is stricter than partial-import but safer for a
  school who doesn't want a half-populated grade.
- Duplicate emails are skipped (not errored): a CSV that's re-uploaded
  by mistake shouldn't create phantom errors.

Wave Zero fixes:
- **H-6 (CSV injection):** cells starting with `=`, `+`, `-`, `@`, `\t`,
  `\r` are prefixed with a single quote so Excel/Google Sheets treats
  them as literal text, not formula triggers. Without this, a user's
  `first_name` of `=cmd|'/c calc'!A1` would execute on CSV open.
- **H-7 (duplicate audit log):** `import_students` no longer writes its
  own `students.bulk_imported` log — the view does (with a real actor
  instead of None). Two logs per import created confusing audit trails.
- **H-10 (upload size cap):** `_read_rows` refuses any payload over
  10 MB. XLSX decompression is O(n) in memory; the old code happily
  tried to load 500 MB xlsx files into a web worker.
- **M-11 (per-row error clarity):** an `IntegrityError` from a race
  between dry_run and commit now surfaces as a normal 400 with a
  specific row identified, not a raw 500 that leaves the whole batch
  in an inconsistent state.
"""

import csv
import io
import zipfile
from datetime import date, datetime
from decimal import Decimal

from django.db import IntegrityError, transaction

from apps.academics.models import (
    AcademicYear,
    Course,
    Grade,
    Group,
    Stage,
    Subject,
    Term,
)
from apps.accounts.models import User
from apps.assessments.models import Assessment
from apps.content.models import Content
from apps.exam_engine.models import ExamAttempt
from apps.people.models import Enrollment
from apps.questions.models import Question, QuestionBank


# H-10: hard cap on import file size. Django's default DATA_UPLOAD_MAX_MEMORY_SIZE
# is 2.5 MB, which is already too small for a "500 students" CSV in some cases,
# but unbounded is worse. 10 MB is enough for a CSV of ~100K rows, and small
# enough to not stress an XLSX decompression bomb.
MAX_IMPORT_BYTES = 10 * 1024 * 1024  # 10 MB


# ============================================================================
# Export
# ============================================================================


# H-6: characters that Excel/Sheets interpret as formula starts. Escaping
# by prefixing with `'` forces literal-text interpretation (OWASP CSV
# injection recommendation).
_CSV_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _safe_csv_cell(v):
    """Escape a single cell against CSV injection (H-6 fix)."""
    s = _str(v)
    if s and s[0] in _CSV_FORMULA_PREFIXES:
        return "'" + s
    return s


def _str(v):
    if v is None:
        return ""
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return str(v)
    return str(v)


def _write_csv(headers, rows) -> bytes:
    buf = io.StringIO()
    buf.write("\ufeff")  # UTF-8 BOM for Excel
    w = csv.writer(buf)
    w.writerow(headers)
    for row in rows:
        w.writerow([_safe_csv_cell(v) for v in row])
    return buf.getvalue().encode("utf-8")


def export_tenant_data(tenant) -> dict[str, bytes]:
    """Build every CSV the tenant can download. Filename → bytes."""
    out = {}

    users = User.objects.filter(tenant=tenant).order_by("role", "email")
    out["users.csv"] = _write_csv(
        ["email", "first_name", "last_name", "role", "is_active", "created_at"],
        [(u.email, u.first_name, u.last_name, u.role, u.is_active, u.created_at) for u in users],
    )

    out["stages.csv"] = _write_csv(
        ["name", "order"],
        [(s.name, s.order) for s in Stage.objects.for_tenant(tenant).order_by("order")],
    )

    out["grades.csv"] = _write_csv(
        ["name", "stage", "order"],
        [
            (g.name, g.stage.name, g.order)
            for g in Grade.objects.for_tenant(tenant).select_related("stage").order_by("order")
        ],
    )

    out["academic_years.csv"] = _write_csv(
        ["name", "start_date", "end_date", "is_active"],
        [
            (y.name, y.start_date, y.end_date, y.is_active)
            for y in AcademicYear.objects.for_tenant(tenant).order_by("-start_date")
        ],
    )

    out["terms.csv"] = _write_csv(
        ["name", "academic_year", "start_date", "end_date", "order"],
        [
            (t.name, t.academic_year.name, t.start_date, t.end_date, t.order)
            for t in Term.objects.for_tenant(tenant).select_related("academic_year")
        ],
    )

    out["groups.csv"] = _write_csv(
        ["name", "grade", "academic_year", "capacity"],
        [
            (g.name, g.grade.name, g.academic_year.name, g.capacity)
            for g in Group.objects.for_tenant(tenant).select_related("grade", "academic_year")
        ],
    )

    out["subjects.csv"] = _write_csv(
        ["name", "code"],
        [(s.name, s.code) for s in Subject.objects.for_tenant(tenant).order_by("name")],
    )

    out["courses.csv"] = _write_csv(
        ["name", "subject", "grade", "description", "is_active"],
        [
            (c.name, c.subject.name, c.grade.name, c.description, c.is_active)
            for c in Course.objects.for_tenant(tenant).select_related("subject", "grade")
        ],
    )

    out["enrollments.csv"] = _write_csv(
        ["student_email", "group", "academic_year", "status", "enrolled_at"],
        [
            (e.student.email, e.group.name, e.academic_year.name, e.status, e.enrolled_at)
            for e in Enrollment.objects.for_tenant(tenant).select_related(
                "student", "group", "academic_year"
            )
        ],
    )

    out["assessments.csv"] = _write_csv(
        [
            "title",
            "assessment_type",
            "status",
            "duration_minutes",
            "max_attempts",
            "passing_score",
            "starts_at",
            "ends_at",
            "published_at",
            "created_at",
        ],
        [
            (
                a.title,
                a.assessment_type,
                a.status,
                a.duration_minutes,
                a.max_attempts,
                a.passing_score,
                a.starts_at,
                a.ends_at,
                a.published_at,
                a.created_at,
            )
            for a in Assessment.objects.for_tenant(tenant).order_by("-created_at")
        ],
    )

    out["exam_attempts.csv"] = _write_csv(
        [
            "student_email",
            "assessment_title",
            "attempt_number",
            "status",
            "score",
            "max_score",
            "percentage",
            "is_passed",
            "started_at",
            "submitted_at",
        ],
        [
            (
                a.student.email,
                a.assessment.title,
                a.attempt_number,
                a.status,
                a.score,
                a.max_score,
                round(a.percentage, 2),
                a.is_passed,
                a.started_at,
                a.submitted_at,
            )
            for a in ExamAttempt.objects.for_tenant(tenant).select_related(
                "student", "assessment"
            )
        ],
    )

    out["question_banks.csv"] = _write_csv(
        ["name", "description", "subject", "grade", "is_archived"],
        [
            (
                b.name,
                b.description,
                b.subject.name if b.subject_id else "",
                b.grade.name if b.grade_id else "",
                b.is_archived,
            )
            for b in QuestionBank.objects.for_tenant(tenant).select_related("subject", "grade")
        ],
    )

    out["questions.csv"] = _write_csv(
        [
            "bank",
            "text",
            "question_type",
            "difficulty",
            "points",
            "accepted_answers",
            "explanation",
            "review_status",
        ],
        [
            (
                q.bank.name,
                q.text,
                q.question_type,
                q.difficulty,
                q.points,
                " | ".join(q.accepted_answers or []),
                q.explanation,
                q.review_status,
            )
            for q in Question.objects.for_tenant(tenant).select_related("bank")
        ],
    )

    out["content.csv"] = _write_csv(
        [
            "title",
            "content_type",
            "description",
            "file_name",
            "external_url",
            "is_published",
            "created_at",
        ],
        [
            (
                c.title,
                c.content_type,
                c.description,
                c.original_filename,
                c.external_url,
                c.is_published,
                c.created_at,
            )
            for c in Content.objects.for_tenant(tenant)
        ],
    )

    out["README.txt"] = (
        "تصدير بيانات مؤسستك من منصة التعلم الذكية\n"
        f"التاريخ: {datetime.now().isoformat()}\n\n"
        "كل ملف CSV يمكن فتحه في Excel أو Google Sheets.\n"
        "الملفات المرفوعة (PDF، فيديو، إلخ) غير مضمنة، لكن أسماءها محفوظة في content.csv.\n"
    ).encode("utf-8")

    return out


def export_to_zip(tenant) -> io.BytesIO:
    files = export_tenant_data(tenant)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in files.items():
            zf.writestr(name, data)
    buf.seek(0)
    return buf


# ============================================================================
# Import — Students
# ============================================================================

REQUIRED_CSV_HEADERS = {"email", "first_name", "last_name", "group_name"}


def _read_rows(raw_bytes: bytes) -> list[dict]:
    """Detect CSV vs XLSX, return list of dicts with lowercase headers.

    H-10: refuses any payload over MAX_IMPORT_BYTES. The old code loaded
    the whole file into memory via openpyxl regardless of size — a 500 MB
    xlsx could OOM the web worker.
    """
    if len(raw_bytes) > MAX_IMPORT_BYTES:
        raise ValueError(
            f"حجم الملف ({len(raw_bytes) // (1024 * 1024)} ميجابايت) يتجاوز "
            f"الحد المسموح ({MAX_IMPORT_BYTES // (1024 * 1024)} ميجابايت)."
        )

    # Excel starts with PK (zip signature)
    if raw_bytes[:4] == b"PK\x03\x04":
        return _read_xlsx(raw_bytes)
    return _read_csv(raw_bytes)


def _read_csv(raw_bytes: bytes) -> list[dict]:
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw_bytes.decode("latin-1")
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for r in reader:
        rows.append({(k or "").strip().lower(): (v or "").strip() for k, v in r.items()})
    return rows


def _read_xlsx(raw_bytes: bytes) -> list[dict]:
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(raw_bytes), read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    try:
        headers = [str(c or "").strip().lower() for c in next(rows_iter)]
    except StopIteration:
        return []
    rows = []
    for raw in rows_iter:
        if raw is None or all(c is None or str(c).strip() == "" for c in raw):
            continue
        rows.append(
            {
                headers[i]: (str(v).strip() if v is not None else "")
                for i, v in enumerate(raw)
                if i < len(headers)
            }
        )
    return rows


def validate_student_rows(tenant, academic_year, rows: list[dict]) -> list[dict]:
    """Return per-row analysis with status: valid / skip / error.

    Row analysis is READ-ONLY — used by the dry_run endpoint to preview
    the import before committing.
    """
    groups = {
        g.name.strip(): g
        for g in Group.objects.for_tenant(tenant).filter(academic_year=academic_year)
    }

    existing_tenant_emails = set(
        User.objects.filter(tenant=tenant).values_list("email", flat=True)
    )
    existing_global_emails = set(
        User.objects.values_list("email", flat=True).exclude(tenant=tenant)
    )

    analysis = []
    seen_in_this_file = set()

    for idx, row in enumerate(rows, start=2):  # header = row 1
        email = (row.get("email") or "").strip().lower()
        first = (row.get("first_name") or "").strip()
        last = (row.get("last_name") or "").strip()
        group_name = (row.get("group_name") or "").strip()

        errors = []
        status = "valid"
        reason = ""

        if not email:
            errors.append("البريد الإلكتروني مطلوب")
        elif "@" not in email or "." not in email.split("@")[-1]:
            errors.append("البريد الإلكتروني غير صحيح")
        elif email in seen_in_this_file:
            errors.append("البريد مكرر داخل الملف")
        elif email in existing_global_emails:
            errors.append("البريد مستخدم في مؤسسة أخرى")

        if not first:
            errors.append("الاسم الأول مطلوب")
        if not group_name:
            errors.append("المجموعة مطلوبة")

        group = groups.get(group_name) if group_name else None
        if group_name and group is None:
            errors.append(f"المجموعة '{group_name}' غير موجودة في هذه السنة")

        if errors:
            status = "error"
        elif email in existing_tenant_emails:
            status = "skip"
            reason = "الطالب موجود بالفعل في هذه المؤسسة"

        if email:
            seen_in_this_file.add(email)

        analysis.append(
            {
                "row": idx,
                "email": email,
                "first_name": first,
                "last_name": last,
                "group_name": group_name,
                "group_id": str(group.id) if group else None,
                "status": status,
                "reason": reason,
                "errors": errors,
            }
        )

    return analysis


def import_students(tenant, academic_year, analysis: list[dict]) -> dict:
    """Actually create the students + enrollments. Atomic.

    Caller MUST have run `validate_student_rows` first and decided to
    proceed (either all rows are valid/skip, or the user accepted the
    preview). This function does not re-validate.

    H-7: the previous version wrote a second `students.bulk_imported` audit
    log here (with actor=None). The view already writes one with the real
    actor, so every import produced two confusing entries. Removed.
    M-11: an IntegrityError from a true race (two admins importing the same
    email between dry_run and commit) now surfaces as a clean 400.
    """
    created_students = 0
    created_enrollments = 0
    skipped = 0

    with transaction.atomic():
        for row in analysis:
            if row["status"] == "skip":
                skipped += 1
                continue
            if row["status"] != "valid":
                continue

            try:
                student = User.objects.create_user(
                    email=row["email"],
                    password=None,  # unusable password — owner sends reset link later
                    tenant=tenant,
                    role=User.Role.STUDENT,
                    first_name=row["first_name"],
                    last_name=row["last_name"],
                )
                created_students += 1

                group = Group.objects.for_tenant(tenant).get(id=row["group_id"])
                Enrollment.objects.create(
                    tenant=tenant,
                    student=student,
                    group=group,
                    academic_year=academic_year,
                    status=Enrollment.Status.ACTIVE,
                )
                created_enrollments += 1
            except IntegrityError as exc:
                # M-11: the row passed validation but lost a race at commit
                # time (e.g. another admin imported the same email between
                # dry_run and this request). Roll back the whole batch to
                # preserve the all-or-nothing contract, but surface a clear
                # 400 identifying which row failed — not a raw 500.
                raise ValueError(
                    f"فشل الاستيراد عند الصف {row['row']} ({row['email']}): "
                    f"البريد الإلكتروني أو التسجيل مكرر. "
                    f"أعد تشغيل المعاينة للتأكد من البيانات."
                ) from exc

    return {
        "created_students": created_students,
        "created_enrollments": created_enrollments,
        "skipped": skipped,
    }


def read_or_get_rows_for_validation(raw_bytes: bytes) -> list[dict]:
    """Public wrapper for _read_rows (used by views)."""
    return _read_rows(raw_bytes)