"""Academics service layer — operations that span multiple models.

Phase 1.10-1.12 — Rollover Wizard services:
  - close_preflight: read-only readiness check
  - prepare_next_year: create new year + copy structure
  - promote_students: promote/repeat/graduate/transfer
  - archive_year: close an active/closing year
"""

from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit.services import log_action

from .models import AcademicYear, Course, Group, Term

# ============================================================================
# Duplicate (existing)
# ============================================================================


def duplicate_course(course, actor):
    """Duplicate a Course with its full Chapter/Lesson structure."""
    from apps.common.utils import unique_copy_name

    from .models import Chapter, Course, Lesson

    new_name = unique_copy_name(
        course.name,
        lambda name: (
            Course.objects.for_tenant(course.tenant)
            .filter(
                grade=course.grade,
                subject=course.subject,
                name=name,
                academic_year=course.academic_year,
                term=course.term,
            )
            .exists()
        ),
    )

    with transaction.atomic():
        copy = Course.objects.create(
            tenant=course.tenant,
            subject=course.subject,
            grade=course.grade,
            academic_year=course.academic_year,
            term=course.term,
            name=new_name,
            description=course.description,
            is_active=course.is_active,
        )

        for source_chapter in course.chapters.order_by("order"):
            new_chapter = Chapter.objects.create(
                tenant=course.tenant,
                course=copy,
                name=source_chapter.name,
                order=source_chapter.order,
            )
            for source_lesson in source_chapter.lessons.order_by("order"):
                Lesson.objects.create(
                    tenant=course.tenant,
                    chapter=new_chapter,
                    name=source_lesson.name,
                    order=source_lesson.order,
                )

    return copy


# ============================================================================
# Phase 1.10-1.12 — Rollover Wizard
# ============================================================================


def close_preflight(year):
    """Return a detailed readiness report for closing `year`.

    Returns:
        {
          "can_close": bool,
          "year": {id, name, status},
          "issues": [
            {severity: "error"|"warning", code: str, count: int, message: str}
          ],
          "stats": {groups, courses, active_enrollments, terms}
        }

    Errors prevent closing; warnings are informational.
    """
    from apps.attendance.models import AttendanceSession
    from apps.exam_engine.models import ExamAttempt
    from apps.people.models import Enrollment

    issues = []

    # --- Errors: in-progress exams ---
    in_progress_exams = ExamAttempt.objects.filter(
        tenant=year.tenant,
        status=ExamAttempt.Status.IN_PROGRESS,
    ).count()
    if in_progress_exams > 0:
        issues.append(
            {
                "severity": "error",
                "code": "IN_PROGRESS_EXAMS",
                "count": in_progress_exams,
                "message": f"{in_progress_exams} محاولات امتحان قيد التنفيذ — يجب تسليمها أو إلغاؤها أولاً.",
            }
        )

    # --- Warnings: open / scheduled attendance sessions ---
    open_sessions = AttendanceSession.objects.filter(
        tenant=year.tenant,
        status=AttendanceSession.Status.OPEN,
    ).count()
    if open_sessions > 0:
        issues.append(
            {
                "severity": "warning",
                "code": "OPEN_ATTENDANCE_SESSIONS",
                "count": open_sessions,
                "message": f"{open_sessions} جلسات حضور مفتوحة — يُنصح بإغلاقها.",
            }
        )

    scheduled_sessions = AttendanceSession.objects.filter(
        tenant=year.tenant,
        status=AttendanceSession.Status.SCHEDULED,
    ).count()
    if scheduled_sessions > 0:
        issues.append(
            {
                "severity": "warning",
                "code": "SCHEDULED_ATTENDANCE_SESSIONS",
                "count": scheduled_sessions,
                "message": f"{scheduled_sessions} جلسات حضور مجدولة لم تُفتح.",
            }
        )

    # --- Stats ---
    stats = {
        "groups": Group.objects.for_tenant(year.tenant).filter(academic_year=year).count(),
        "courses": Course.objects.for_tenant(year.tenant).filter(academic_year=year).count(),
        "terms": Term.objects.for_tenant(year.tenant).filter(academic_year=year).count(),
        "active_enrollments": Enrollment.objects.for_tenant(year.tenant)
        .filter(academic_year=year, status=Enrollment.Status.ACTIVE)
        .count(),
    }

    can_close = all(i["severity"] != "error" for i in issues)

    return {
        "can_close": can_close,
        "year": {
            "id": str(year.id),
            "name": year.name,
            "status": year.status,
        },
        "issues": issues,
        "stats": stats,
    }


@transaction.atomic
def prepare_next_year(year, data, *, user):
    """Create a new DRAFT year, optionally copying structure from `year`.

    Args:
        year: the source AcademicYear (must be ACTIVE or CLOSING).
        data: dict with name, start_date, end_date, copy_terms,
              copy_groups, copy_courses (all booleans).
        user: the actor (for audit log).

    Returns:
        {"new_year_id": str, "new_year_name": str, "copied": {...}}

    Repeated requests for the same source year return its existing target,
    preventing duplicate year creation when a response is lost.

    Raises:
        ValidationError if the source status is invalid or the target name
        already belongs to an unrelated academic year.
    """
    options = {
        "name": data["name"],
        "start_date": data["start_date"].isoformat(),
        "end_date": data["end_date"].isoformat(),
        "copy_terms": data.get("copy_terms", True),
        "copy_groups": data.get("copy_groups", True),
        "copy_courses": data.get("copy_courses", True),
    }

    existing = AcademicYear.objects.for_tenant(year.tenant).filter(rollover_source=year).first()
    if existing is not None:
        return {
            "new_year_id": str(existing.id),
            "new_year_name": existing.name,
            "copied": existing.rollover_copied,
            "_created": False,
            "_request_changed": existing.rollover_options != options,
        }

    if year.status not in (AcademicYear.Status.ACTIVE, AcademicYear.Status.CLOSING):
        raise ValidationError(
            f"لا يمكن تجهيز سنة جديدة من سنة بحالة «{year.get_status_display()}». "
            "يجب أن تكون نشطة أو قيد الإغلاق."
        )

    if AcademicYear.objects.for_tenant(year.tenant).filter(name=data["name"]).exists():
        raise ValidationError(f"السنة «{data['name']}» موجودة بالفعل.")

    try:
        with transaction.atomic():
            new_year = AcademicYear.objects.create(
                tenant=year.tenant,
                name=data["name"],
                start_date=data["start_date"],
                end_date=data["end_date"],
                status=AcademicYear.Status.DRAFT,
                rollover_source=year,
                rollover_options=options,
            )
    except IntegrityError:
        existing = AcademicYear.objects.for_tenant(year.tenant).filter(rollover_source=year).first()
        if existing is None:
            raise
        return {
            "new_year_id": str(existing.id),
            "new_year_name": existing.name,
            "copied": existing.rollover_copied,
            "_created": False,
            "_request_changed": existing.rollover_options != options,
        }

    summary = {
        "new_year_id": str(new_year.id),
        "new_year_name": new_year.name,
        "copied": {},
    }

    # --- Copy terms (dates scaled to the new year's span) ---
    if data.get("copy_terms", True):
        source_span_days = max((year.end_date - year.start_date).days, 1)
        target_span_days = (new_year.end_date - new_year.start_date).days
        ratio = target_span_days / source_span_days

        copied_terms = 0
        for term in Term.objects.for_tenant(year.tenant).filter(academic_year=year):
            offset_start = (term.start_date - year.start_date).days
            offset_end = (term.end_date - year.start_date).days

            new_start = new_year.start_date + timedelta(days=int(round(offset_start * ratio)))
            new_end = new_year.start_date + timedelta(days=int(round(offset_end * ratio)))

            Term.objects.create(
                tenant=year.tenant,
                academic_year=new_year,
                name=term.name,
                start_date=new_start,
                end_date=new_end,
                order=term.order,
            )
            copied_terms += 1
        summary["copied"]["terms"] = copied_terms

    # --- Copy groups (same grade, same name, new year) ---
    if data.get("copy_groups", True):
        copied_groups = 0
        for group in Group.objects.for_tenant(year.tenant).filter(academic_year=year):
            Group.objects.create(
                tenant=year.tenant,
                grade=group.grade,
                academic_year=new_year,
                name=group.name,
                capacity=group.capacity,
            )
            copied_groups += 1
        summary["copied"]["groups"] = copied_groups

    # --- Copy courses (year-level only; term-specific courses stay behind) ---
    if data.get("copy_courses", True):
        copied_courses = 0
        for course in Course.objects.for_tenant(year.tenant).filter(
            academic_year=year, term__isnull=True
        ):
            Course.objects.create(
                tenant=year.tenant,
                subject=course.subject,
                grade=course.grade,
                academic_year=new_year,
                name=course.name,
                description=course.description,
                is_active=course.is_active,
            )
            copied_courses += 1
        summary["copied"]["courses"] = copied_courses

    new_year.rollover_copied = summary["copied"]
    new_year.save(update_fields=["rollover_copied", "updated_at"])

    log_action(
        actor=user,
        tenant=year.tenant,
        action="academic_year.prepared",
        obj=new_year,
        metadata={
            "source_year_id": str(year.id),
            "source_year_name": year.name,
            "copied": summary["copied"],
        },
    )

    summary["_created"] = True
    return summary


@transaction.atomic
def promote_students(source_year, target_year, items, *, user):
    """Promote students from `source_year` to `target_year`.

    Args:
        source_year: AcademicYear (source).
        target_year: AcademicYear (target, must differ, same tenant).
        items: list of {enrollment, action, target_group}.
        user: actor.

    Each `action`:
        - PROMOTE:  target_group.grade must be source_group.grade.next_grade()
        - REPEAT:   target_group.grade must be source_group.grade
        - GRADUATE: no target_group; old enrollment → GRADUATED
        - TRANSFER: no target_group; old enrollment → TRANSFERRED

    All-or-nothing: if any item fails validation, nothing is committed.

    Returns: {"results": [...]}
    """
    from apps.people.models import Enrollment

    if source_year.id == target_year.id:
        raise ValidationError("السنة الهدف يجب أن تكون مختلفة عن السنة المصدر.")
    if source_year.tenant_id != target_year.tenant_id:
        raise ValidationError("السنتان لا تنتميان لنفس المؤسسة.")
    if source_year.status not in (
        AcademicYear.Status.ACTIVE,
        AcademicYear.Status.CLOSING,
    ):
        raise ValidationError("يجب أن تكون السنة المصدر نشطة أو قيد الإغلاق لتنفيذ الترقية.")
    if target_year.status != AcademicYear.Status.ACTIVE:
        raise ValidationError("يجب تفعيل السنة الهدف قبل تنفيذ ترقية الطلاب.")

    results = []

    for item in items:
        enrollment_id = item["enrollment"]
        action = item["action"]
        target_group_id = item.get("target_group")

        # --- Load source enrollment ---
        enrollment = (
            Enrollment.objects.for_tenant(source_year.tenant)
            .select_related("student", "group", "group__grade")
            .filter(id=enrollment_id)
            .first()
        )
        if enrollment is None:
            raise ValidationError(f"التسجيل {enrollment_id} غير موجود.")

        if enrollment.academic_year_id != source_year.id:
            raise ValidationError(f"التسجيل {enrollment_id} لا ينتمي للسنة المصدر.")

        if enrollment.status != Enrollment.Status.ACTIVE:
            raise ValidationError(
                f"التسجيل {enrollment_id} ليس نشطًا (حالته: {enrollment.get_status_display()})."
            )

        # --- GRADUATE / TRANSFER ---
        if action == "GRADUATE":
            enrollment.status = Enrollment.Status.GRADUATED
            enrollment.save(update_fields=["status", "updated_at"])
            results.append(
                {
                    "enrollment": str(enrollment_id),
                    "student": str(enrollment.student_id),
                    "action": action,
                    "status": "ok",
                    "new_enrollment_id": None,
                }
            )
            continue

        if action == "TRANSFER":
            enrollment.status = Enrollment.Status.TRANSFERRED
            enrollment.save(update_fields=["status", "updated_at"])
            results.append(
                {
                    "enrollment": str(enrollment_id),
                    "student": str(enrollment.student_id),
                    "action": action,
                    "status": "ok",
                    "new_enrollment_id": None,
                }
            )
            continue

        # --- PROMOTE / REPEAT (need target_group) ---
        if action not in ("PROMOTE", "REPEAT"):
            raise ValidationError(f"إجراء غير معروف: {action}")

        if not target_group_id:
            raise ValidationError(
                f"target_group مطلوب للإجراء {action} (الطالب: {enrollment.student.email})."
            )

        target_group = (
            Group.objects.for_tenant(source_year.tenant)
            .filter(id=target_group_id, academic_year=target_year)
            .select_related("grade")
            .first()
        )
        if target_group is None:
            raise ValidationError(f"المجموعة الهدف {target_group_id} غير موجودة في السنة الهدف.")

        if action == "PROMOTE":
            expected = enrollment.group.grade.next_grade()
            if expected is None:
                raise ValidationError(
                    f"الطالب {enrollment.student.email} في آخر صف "
                    f"({enrollment.group.grade.name}) — استخدم GRADUATE بدلاً من PROMOTE."
                )
            if target_group.grade_id != expected.id:
                raise ValidationError(
                    f"الصف المتوقع للطالب {enrollment.student.email} هو "
                    f"«{expected.name}» لكن المجموعة الهدف في "
                    f"«{target_group.grade.name}»."
                )

        elif action == "REPEAT":
            if target_group.grade_id != enrollment.group.grade_id:
                raise ValidationError(
                    f"عند الإعادة، يجب أن تكون المجموعة الهدف في نفس صف "
                    f"«{enrollment.group.grade.name}» (الطالب: {enrollment.student.email})."
                )

        # --- Prevent duplicate enrollment in target year ---
        if (
            Enrollment.objects.for_tenant(source_year.tenant)
            .filter(student=enrollment.student, academic_year=target_year)
            .exists()
        ):
            raise ValidationError(
                f"الطالب {enrollment.student.email} لديه تسجيل بالفعل في السنة الهدف."
            )

        # --- Mark old + create new ---
        old_status = (
            Enrollment.Status.COMPLETED if action == "PROMOTE" else Enrollment.Status.FAILED
        )
        enrollment.status = old_status
        enrollment.save(update_fields=["status", "updated_at"])

        new_enrollment = Enrollment.objects.create(
            tenant=source_year.tenant,
            student=enrollment.student,
            group=target_group,
            academic_year=target_year,
            status=Enrollment.Status.ACTIVE,
        )

        results.append(
            {
                "enrollment": str(enrollment_id),
                "student": str(enrollment.student_id),
                "action": action,
                "status": "ok",
                "new_enrollment_id": str(new_enrollment.id),
            }
        )

    log_action(
        actor=user,
        tenant=source_year.tenant,
        action="academic_year.students_promoted",
        metadata={
            "source_year_id": str(source_year.id),
            "target_year_id": str(target_year.id),
            "count": len(results),
        },
    )

    return {"results": results}


@transaction.atomic
def archive_year(year, *, user):
    """Archive an ACTIVE or CLOSING year — read-only thereafter."""
    if year.status not in (AcademicYear.Status.ACTIVE, AcademicYear.Status.CLOSING):
        raise ValidationError(
            f"لا يمكن أرشفة سنة بحالة «{year.get_status_display()}». "
            "يجب أن تكون نشطة أو قيد الإغلاق."
        )

    year.status = AcademicYear.Status.ARCHIVED
    year.closed_at = timezone.now()
    year.closed_by = user
    year.is_active = False
    year.save(
        update_fields=[
            "status",
            "closed_at",
            "closed_by",
            "is_active",
            "updated_at",
        ]
    )

    log_action(
        actor=user,
        tenant=year.tenant,
        action="academic_year.archived",
        obj=year,
    )

    return year
