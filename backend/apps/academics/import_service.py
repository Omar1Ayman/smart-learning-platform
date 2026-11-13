"""
Wave D1b — bulk import for the academic structure / curriculum.

One row = one lesson inside (year, stage, grade, subject, course, chapter).
Empty `lesson` column = "create the chapter only, no lessons". This
covers both common shapes:
  - a school that uploads chapter names now and lesson names later,
  - a school that has the full tree in one file.

Auto-create rules (all "reuse-if-exists by name within the natural
parent"):
  - Stage (tenant, name)
  - Grade (stage, name)
  - Subject (tenant, name)
  - Course (grade, subject, name, year) — always created year-only
    (term is not part of curriculum import; term-specific courses can be
    added later via the UI)
  - Chapter (course, name)
  - Lesson (chapter, name)

The academic year is the ONE thing we require to pre-exist. Date fields
(start/end) matter for reports — auto-computing them wrong would poison
promotion logic. Missing year → row error, user fixes their calendar.

Preview (`dry_run`) shows per-row status + a "will create" summary so
the user can see, e.g., "this file creates 3 stages, 5 grades, 20
courses, 200 lessons" before committing.
"""

import io
from dataclasses import dataclass, field

from django.db import transaction

from apps.accounts.models import User

from .models import (
    AcademicYear,
    Chapter,
    Course,
    Grade,
    Lesson,
    Stage,
    Subject,
)

REQUIRED_HEADERS = {
    "academic_year",
    "stage",
    "grade",
    "subject",
    "course",
    "chapter",
}


@dataclass
class RowAnalysis:
    row: int
    academic_year: str
    stage: str
    grade: str
    subject: str
    course: str
    chapter: str
    chapter_order: str
    lesson: str
    lesson_order: str
    status: str = "valid"  # "valid" | "skip" | "error"
    errors: list[str] = field(default_factory=list)
    will_create: dict[str, bool] = field(default_factory=dict)
    reason: str = ""


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def validate_curriculum_rows(tenant, rows: list[dict]) -> list[RowAnalysis]:
    """Analyze every row + report which levels will be created vs reused.

    Multi-row tracking: within a single file, if row 1 creates "الثانوية"
    and row 2 references it, row 2's `will_create["stage"]` is False.
    This is what makes the preview's "will create X stages" count accurate.
    """
    # Preload existing names for O(1) lookups.
    existing_years = {y.name.strip().lower(): y for y in AcademicYear.objects.for_tenant(tenant)}
    existing_stages = {s.name.strip().lower(): s for s in Stage.objects.for_tenant(tenant)}
    existing_grades = {
        (g.stage.name.strip().lower(), g.name.strip().lower()): g
        for g in Grade.objects.for_tenant(tenant).select_related("stage")
    }
    existing_subjects = {s.name.strip().lower(): s for s in Subject.objects.for_tenant(tenant)}
    existing_courses = {
        (
            c.grade.name.strip().lower(),
            c.subject.name.strip().lower(),
            c.name.strip().lower(),
            (c.academic_year.name.strip().lower() if c.academic_year else ""),
        ): c
        for c in Course.objects.for_tenant(tenant)
        .filter(term__isnull=True)
        .select_related("grade", "subject", "academic_year")
    }
    existing_chapters = {
        (ch.course.name.strip().lower(), ch.name.strip().lower()): ch
        for ch in Chapter.objects.for_tenant(tenant).select_related("course")
    }
    existing_lessons = {
        (l.chapter.name.strip().lower(), l.name.strip().lower()): l
        for l in Lesson.objects.for_tenant(tenant).select_related("chapter")
    }

    # Within-file tracking (mutated as we walk rows).
    seen_stages = set(existing_stages.keys())
    seen_grades = set(existing_grades.keys())
    seen_subjects = set(existing_subjects.keys())
    seen_courses = set(existing_courses.keys())
    seen_chapters = set(existing_chapters.keys())
    seen_lessons = set(existing_lessons.keys())

    # Path-level dedupe: if the same (course, chapter, lesson) path
    # appears twice, the second is a "skip" — never a duplicate-create.
    seen_paths: set[tuple] = set()

    analysis: list[RowAnalysis] = []

    for idx, row in enumerate(rows, start=2):

        def get(k: str, default: str = "") -> str:
            return (row.get(k) or default).strip()

        year_name = get("academic_year")
        stage_name = get("stage")
        grade_name = get("grade")
        subject_name = get("subject")
        course_name = get("course")
        chapter_name = get("chapter")
        chapter_order_str = get("chapter_order")
        lesson_name = get("lesson")
        lesson_order_str = get("lesson_order")

        errors: list[str] = []

        # --- Required fields ---
        if not year_name:
            errors.append("اسم السنة الدراسية مطلوب")
        elif year_name.lower() not in existing_years:
            errors.append(
                f"السنة الدراسية '{year_name}' غير موجودة — أنشئها أولاً من صفحة السنوات الدراسية"
            )

        if not stage_name:
            errors.append("اسم المرحلة مطلوب")
        if not grade_name:
            errors.append("اسم الصف مطلوب")
        if not subject_name:
            errors.append("اسم المادة مطلوب")
        if not course_name:
            errors.append("اسم المادة الدراسية مطلوب")
        if not chapter_name:
            errors.append("اسم الفصل مطلوب")

        if errors:
            analysis.append(
                RowAnalysis(
                    row=idx,
                    academic_year=year_name,
                    stage=stage_name,
                    grade=grade_name,
                    subject=subject_name,
                    course=course_name,
                    chapter=chapter_name,
                    chapter_order=chapter_order_str,
                    lesson=lesson_name,
                    lesson_order=lesson_order_str,
                    status="error",
                    errors=errors,
                )
            )
            continue

        # --- Build the path keys ---
        year_key = year_name.lower()
        stage_key = stage_name.lower()
        grade_key = (stage_key, grade_name.lower())
        subject_key = subject_name.lower()
        course_key = (grade_name.lower(), subject_key, course_name.lower(), year_key)
        chapter_key = (course_name.lower(), chapter_name.lower())
        lesson_key = (chapter_name.lower(), lesson_name.lower()) if lesson_name else None

        # --- Path dedupe (within file) ---
        path_key = (stage_key, grade_key, subject_key, course_key, chapter_key, lesson_key)
        if path_key in seen_paths:
            analysis.append(
                RowAnalysis(
                    row=idx,
                    academic_year=year_name,
                    stage=stage_name,
                    grade=grade_name,
                    subject=subject_name,
                    course=course_name,
                    chapter=chapter_name,
                    chapter_order=chapter_order_str,
                    lesson=lesson_name,
                    lesson_order=lesson_order_str,
                    status="skip",
                    reason="هذا المسار موجود بالفعل في الملف — سيُتخطّى",
                )
            )
            continue
        seen_paths.add(path_key)

        # --- Determine will_create flags ---
        will_create = {
            "stage": stage_key not in seen_stages,
            "grade": grade_key not in seen_grades,
            "subject": subject_key not in seen_subjects,
            "course": course_key not in seen_courses,
            "chapter": chapter_key not in seen_chapters,
            "lesson": bool(lesson_name) and lesson_key not in seen_lessons,
        }
        seen_stages.add(stage_key)
        seen_grades.add(grade_key)
        seen_subjects.add(subject_key)
        seen_courses.add(course_key)
        seen_chapters.add(chapter_key)
        if lesson_key:
            seen_lessons.add(lesson_key)

        analysis.append(
            RowAnalysis(
                row=idx,
                academic_year=year_name,
                stage=stage_name,
                grade=grade_name,
                subject=subject_name,
                course=course_name,
                chapter=chapter_name,
                chapter_order=chapter_order_str,
                lesson=lesson_name,
                lesson_order=lesson_order_str,
                status="valid",
                will_create=will_create,
            )
        )

    return analysis


def summarize_will_create(analysis: list[RowAnalysis]) -> dict[str, int]:
    """Aggregate how many NEW things the file will create across all rows."""
    counts = {
        "stages": 0,
        "grades": 0,
        "subjects": 0,
        "courses": 0,
        "chapters": 0,
        "lessons": 0,
    }
    key_map = {
        "stage": "stages",
        "grade": "grades",
        "subject": "subjects",
        "course": "courses",
        "chapter": "chapters",
        "lesson": "lessons",
    }
    for row in analysis:
        if row.status != "valid":
            continue
        for field_name, flag in row.will_create.items():
            if flag:
                counts[key_map[field_name]] += 1
    return counts


# ---------------------------------------------------------------------------
# Commit
# ---------------------------------------------------------------------------


def import_curriculum(tenant, analysis: list[RowAnalysis], author: User) -> dict[str, int]:
    """Create the full hierarchy for every valid row, in one transaction.

    Assumes the caller already ran `validate_curriculum_rows` and
    confirmed that no row has an error.
    """
    counts = {
        "created_stages": 0,
        "created_grades": 0,
        "created_subjects": 0,
        "created_courses": 0,
        "created_chapters": 0,
        "created_lessons": 0,
    }

    with transaction.atomic():
        # Caches — populated lazily as we walk the file, so each row only
        # hits the DB for objects it actually needs.
        years = {y.name.strip().lower(): y for y in AcademicYear.objects.for_tenant(tenant)}
        stages = {s.name.strip().lower(): s for s in Stage.objects.for_tenant(tenant)}
        grades = {
            (g.stage.name.strip().lower(), g.name.strip().lower()): g
            for g in Grade.objects.for_tenant(tenant).select_related("stage")
        }
        subjects = {s.name.strip().lower(): s for s in Subject.objects.for_tenant(tenant)}
        courses = {
            (
                c.grade.name.strip().lower(),
                c.subject.name.strip().lower(),
                c.name.strip().lower(),
                (c.academic_year.name.strip().lower() if c.academic_year else ""),
            ): c
            for c in Course.objects.for_tenant(tenant)
            .filter(term__isnull=True)
            .select_related("grade", "subject", "academic_year")
        }
        chapters = {
            (ch.course.name.strip().lower(), ch.name.strip().lower()): ch
            for ch in Chapter.objects.for_tenant(tenant).select_related("course")
        }
        lessons = {
            (l.chapter.name.strip().lower(), l.name.strip().lower()): l
            for l in Lesson.objects.for_tenant(tenant).select_related("chapter")
        }

        # Auto-number orders per parent (for rows that leave them blank).
        next_chapter_order: dict[int, int] = {}  # course_id → next order
        next_lesson_order: dict[int, int] = {}  # chapter_id → next order

        def ensure_order_map_initialized(course_id: int, chapter_id: int):
            if course_id not in next_chapter_order:
                max_order = (
                    Chapter.objects.filter(course_id=course_id)
                    .order_by("-order")
                    .values_list("order", flat=True)
                    .first()
                ) or 0
                next_chapter_order[course_id] = max_order + 1
            if chapter_id not in next_lesson_order:
                max_order = (
                    Lesson.objects.filter(chapter_id=chapter_id)
                    .order_by("-order")
                    .values_list("order", flat=True)
                    .first()
                ) or 0
                next_lesson_order[chapter_id] = max_order + 1

        for row in analysis:
            if row.status != "valid":
                continue

            year_key = row.academic_year.strip().lower()
            stage_key = row.stage.strip().lower()
            grade_key = (stage_key, row.grade.strip().lower())
            subject_key = row.subject.strip().lower()
            course_key = (
                row.grade.strip().lower(),
                subject_key,
                row.course.strip().lower(),
                year_key,
            )
            chapter_key = (row.course.strip().lower(), row.chapter.strip().lower())

            year = years[year_key]

            # --- Stage ---
            stage = stages.get(stage_key)
            if stage is None:
                stage = Stage.objects.create(
                    tenant=tenant, name=row.stage.strip(), order=len(stages) + 1
                )
                stages[stage_key] = stage
                counts["created_stages"] += 1

            # --- Grade ---
            grade = grades.get(grade_key)
            if grade is None:
                grade = Grade.objects.create(
                    tenant=tenant,
                    stage=stage,
                    name=row.grade.strip(),
                    order=(Grade.objects.filter(stage=stage).count() + 1),
                )
                grades[grade_key] = grade
                counts["created_grades"] += 1

            # --- Subject ---
            subject = subjects.get(subject_key)
            if subject is None:
                subject = Subject.objects.create(tenant=tenant, name=row.subject.strip())
                subjects[subject_key] = subject
                counts["created_subjects"] += 1

            # --- Course (year-only — term stays None) ---
            course = courses.get(course_key)
            if course is None:
                course = Course.objects.create(
                    tenant=tenant,
                    subject=subject,
                    grade=grade,
                    academic_year=year,
                    term=None,
                    name=row.course.strip(),
                )
                courses[course_key] = course
                counts["created_courses"] += 1

            # --- Chapter ---
            chapter = chapters.get(chapter_key)
            if chapter is None:
                ensure_order_map_initialized(course.id, 0)  # (id 0 unused)
                explicit_order: int | None = None
                if row.chapter_order:
                    try:
                        explicit_order = int(row.chapter_order)
                    except ValueError:
                        explicit_order = None
                order = explicit_order or next_chapter_order[course.id]
                if order >= next_chapter_order[course.id]:
                    next_chapter_order[course.id] = order + 1
                chapter = Chapter.objects.create(
                    tenant=tenant,
                    course=course,
                    name=row.chapter.strip(),
                    order=order,
                )
                chapters[chapter_key] = chapter
                counts["created_chapters"] += 1

            # --- Lesson (optional) ---
            if row.lesson:
                ensure_order_map_initialized(0, chapter.id)
                lesson_key = (row.chapter.strip().lower(), row.lesson.strip().lower())
                if lesson_key not in lessons:
                    explicit_order = None
                    if row.lesson_order:
                        try:
                            explicit_order = int(row.lesson_order)
                        except ValueError:
                            explicit_order = None
                    order = explicit_order or next_lesson_order[chapter.id]
                    if order >= next_lesson_order[chapter.id]:
                        next_lesson_order[chapter.id] = order + 1
                    lesson = Lesson.objects.create(
                        tenant=tenant,
                        chapter=chapter,
                        name=row.lesson.strip(),
                        order=order,
                    )
                    lessons[lesson_key] = lesson
                    counts["created_lessons"] += 1

    return counts


# ---------------------------------------------------------------------------
# Template
# ---------------------------------------------------------------------------


def build_template_xlsx() -> io.BytesIO:
    """Generate a ready-to-use XLSX template with example rows."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "curriculum"
    ws.sheet_view.rightToLeft = True

    headers = [
        "academic_year",
        "stage",
        "grade",
        "subject",
        "course",
        "chapter",
        "chapter_order",
        "lesson",
        "lesson_order",
    ]

    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill(start_color="2B3A67", end_color="2B3A67", fill_type="solid")
    center = Alignment(horizontal="center", vertical="center")

    for i, h in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=i, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = center

    examples = [
        [
            "2025/2026",
            "الثانوية",
            "أولى ثانوي",
            "رياضيات",
            "رياضيات — أولى ثانوي",
            "الجبر",
            "1",
            "المعادلات الخطية",
            "1",
        ],
        [
            "2025/2026",
            "الثانوية",
            "أولى ثانوي",
            "رياضيات",
            "رياضيات — أولى ثانوي",
            "الجبر",
            "1",
            "المتباينات",
            "2",
        ],
        [
            "2025/2026",
            "الثانوية",
            "أولى ثانوي",
            "رياضيات",
            "رياضيات — أولى ثانوي",
            "الهندسة",
            "2",
            "المثلثات",
            "1",
        ],
        [
            "2025/2026",
            "الثانوية",
            "أولى ثانوي",
            "أحياء",
            "أحياء — أولى ثانوي",
            "الخلية",
            "1",
            "تركيب الخلية",
            "1",
        ],
        [
            "2025/2026",
            "الثانوية",
            "أولى ثانوي",
            "أحياء",
            "أحياء — أولى ثانوي",
            "الخلية",
            "1",
            "الانقسام الخلوي",
            "2",
        ],
    ]

    for r_idx, row in enumerate(examples, start=2):
        for c_idx, val in enumerate(row, start=1):
            ws.cell(row=r_idx, column=c_idx, value=val).alignment = Alignment(
                vertical="center", wrap_text=True
            )

    widths = [16, 16, 16, 16, 28, 20, 12, 28, 12]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf
