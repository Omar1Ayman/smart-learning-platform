"""
Aggregation queries for the three dashboard payloads.

Wave D0c-3a — every function takes `days` (7/14/30/90) and filters the
attempts queryset to that window. Metrics + charts + averages all
reflect the same range so the numbers are internally consistent.

`recent_assessments` / `recent_students` stay "latest N" (independent of
range) — a dashboard asks "what happened recently" for those, not "what
happened in the last 7 days".
"""

from datetime import timedelta

from django.db.models import Avg, Case, Count, F, FloatField, Q, Value, When
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

from apps.accounts.models import User
from apps.assessments.models import Assessment
from apps.assessments.services import visible_assessments_for_student
from apps.exam_engine.models import ExamAttempt
from apps.people.models import Enrollment, TeacherAssignment


ALLOWED_DAYS = (7, 14, 30, 90)


def normalize_days(raw, default: int) -> int:
    """Accept 7/14/30/90; anything else (invalid string, out-of-range)
    returns `default`. Keeps the API forgiving without silently accepting
    values that would blow up the chart (e.g., days=10000)."""
    try:
        days = int(raw)
    except (TypeError, ValueError):
        return default
    return days if days in ALLOWED_DAYS else default


def _percentage_expr():
    """score / max_score * 100 as a float, with safe division."""
    return Case(
        When(max_score=0, then=Value(0.0)),
        default=(F("score") * 100.0 / F("max_score")),
        output_field=FloatField(),
    )


def _daily_series(attempts_qs, days):
    """{days} trailing days: attempt count + average percentage per day.

    Days with zero attempts are included as zeros — a chart with gaps
    looks broken; a chart with a flat line at 0 correctly says "nothing
    happened that day".
    """
    now = timezone.now()
    start = (now - timedelta(days=days - 1)).date()
    rows = (
        attempts_qs.filter(submitted_at__date__gte=start, submitted_at__isnull=False)
        .annotate(day=TruncDate("submitted_at"))
        .values("day")
        .annotate(
            count=Count("id"),
            avg_pct=Avg(_percentage_expr()),
        )
        .order_by("day")
    )
    by_day = {r["day"]: r for r in rows}

    out = []
    for i in range(days):
        d = start + timedelta(days=i)
        row = by_day.get(d)
        out.append(
            {
                "date": d,
                "attempts": row["count"] if row else 0,
                "avg_percentage": (
                    round(float(row["avg_pct"]), 1)
                    if row and row["avg_pct"] is not None
                    else None
                ),
            }
        )
    return out


def _avg_percentage(qs):
    result = qs.filter(status="GRADED", score__isnull=False).aggregate(
        avg=Avg(_percentage_expr())
    )
    return round(float(result["avg"]), 1) if result["avg"] is not None else None


# ============================================================================
# Admin
# ============================================================================

def admin_dashboard(tenant, days=7):
    since = timezone.now() - timedelta(days=days)
    all_attempts = ExamAttempt.objects.for_tenant(tenant)
    attempts = all_attempts.filter(submitted_at__gte=since)

    metrics = {
        "total_students": User.objects.for_tenant(tenant).filter(role=User.Role.STUDENT).count(),
        "total_teachers": User.objects.for_tenant(tenant).filter(role=User.Role.TEACHER).count(),
        "active_assessments": Assessment.objects.for_tenant(tenant)
        .filter(status=Assessment.Status.PUBLISHED)
        .count(),
        "attempts_in_range": attempts.count(),
        "avg_percentage": _avg_percentage(attempts),
        "range_days": days,
    }

    # Recent assessments — "latest 5", not date-scoped.
    assessments = (
        Assessment.objects.for_tenant(tenant)
        .annotate(
            attempts_count=Count("attempts", filter=Q(attempts__submitted_at__isnull=False)),
        )
        .order_by("-created_at")[:5]
    )
    recent_assessments = [
        {
            "id": a.id,
            "title": a.title,
            "assessment_type": a.assessment_type,
            "status": a.status,
            "attempts_count": a.attempts_count,
            "avg_percentage": _avg_percentage(
                ExamAttempt.objects.for_tenant(tenant).filter(assessment=a)
            ),
            "created_at": a.created_at,
        }
        for a in assessments
    ]

    # Recent enrollments — "latest 5", not date-scoped.
    enrollments = (
        Enrollment.objects.for_tenant(tenant)
        .filter(status=Enrollment.Status.ACTIVE)
        .select_related("student", "group")
        .order_by("-enrolled_at")[:5]
    )
    recent_students = [
        {
            "id": e.student.id,
            "email": e.student.email,
            "name": f"{e.student.first_name} {e.student.last_name}".strip() or e.student.email,
            "enrolled_at": e.enrolled_at,
            "group_name": e.group.name,
        }
        for e in enrollments
    ]

    return {
        "metrics": metrics,
        "chart": _daily_series(attempts, days=days),
        "recent_assessments": recent_assessments,
        "recent_students": recent_students,
    }


# ============================================================================
# Teacher
# ============================================================================

def teacher_dashboard(tenant, teacher, days=30):
    """Teacher dashboard aggregation.

    Batch 14 (Milestone 4): added `pending_grading_items` — the top 5
    attempts awaiting manual grading on this teacher's own assessments.
    Powers the priority hero on the teacher dashboard. Scope mirrors the
    existing `pending_grading` metric (assessments created by this
    teacher), so the number and the list never disagree.
    """
    since = timezone.now() - timedelta(days=days)

    # Teacher's assignment scope — same rule Enrollment uses.
    assignments = TeacherAssignment.objects.for_tenant(tenant).filter(teacher=teacher)
    narrowed_group_ids = list(
        assignments.filter(groups__isnull=False).values_list("groups__id", flat=True)
    )
    whole_grade_ids = list(
        assignments.filter(groups__isnull=True).values_list("course__grade_id", flat=True)
    )

    student_qs = (
        Enrollment.objects.for_tenant(tenant)
        .filter(status=Enrollment.Status.ACTIVE)
        .filter(
            Q(group_id__in=narrowed_group_ids)
            | Q(group__grade_id__in=whole_grade_ids)
        )
        .values("student_id")
        .distinct()
    )
    my_students_count = student_qs.count()

    my_assessments = Assessment.objects.for_tenant(tenant).filter(created_by=teacher)
    my_attempts_all = ExamAttempt.objects.for_tenant(tenant).filter(
        assessment__created_by=teacher
    )
    my_attempts = my_attempts_all.filter(submitted_at__gte=since)

    pending_grading = my_attempts_all.filter(status=ExamAttempt.Status.SUBMITTED).count()

    metrics = {
        "my_students": my_students_count,
        "my_active_assessments": my_assessments.filter(
            status=Assessment.Status.PUBLISHED
        ).count(),
        "pending_grading": pending_grading,
        "avg_percentage": _avg_percentage(my_attempts),
        "attempts_in_range": my_attempts.count(),
        "range_days": days,
    }

    recent_assessments = [
        {
            "id": a.id,
            "title": a.title,
            "assessment_type": a.assessment_type,
            "status": a.status,
            "attempts_count": a.attempts.count(),
            "avg_percentage": _avg_percentage(
                ExamAttempt.objects.for_tenant(tenant).filter(assessment=a)
            ),
            "created_at": a.created_at,
        }
        for a in my_assessments.order_by("-created_at")[:5]
    ]

    # Batch 14: pending grading items — oldest first (FIFO fairness:
    # a student who submitted 2 hours ago should be visible before one
    # who submitted 5 minutes ago).
    pending_attempts = list(
        my_attempts_all.filter(status=ExamAttempt.Status.SUBMITTED)
        .select_related("student", "assessment")
        .annotate(
            pending_essays=Count(
                "answers",
                filter=Q(
                    answers__awarded_points__isnull=True,
                    answers__question__question_type="ESSAY",
                ),
            )
        )
        .order_by("submitted_at")[:5]
    )
    pending_grading_items = [
        {
            "attempt_id": str(a.id),
            "assessment_id": str(a.assessment.id),
            "assessment_title": a.assessment.title,
            "student_email": a.student.email,
            "student_name": (
                f"{a.student.first_name} {a.student.last_name}".strip()
                or a.student.email
            ),
            "submitted_at": a.submitted_at,
            "pending_essays": a.pending_essays,
        }
        for a in pending_attempts
    ]

    return {
        "metrics": metrics,
        "chart": _daily_series(my_attempts, days=days),
        "recent_assessments": recent_assessments,
        "pending_grading_items": pending_grading_items,
    }
# ============================================================================
# Student
# ============================================================================

def student_dashboard(tenant, student, days=30):
    """Student dashboard aggregation.

    F-20 (Milestone 3, Batch 10): two additions to enable the new
    Priority Hero card on the frontend:
      1. Each upcoming assessment now carries `has_in_progress_attempt`
         and `in_progress_attempt_id` so the student can resume directly
         from the dashboard (skip the /assessments list detour).
      2. Top-level `unread_notifications_count` — shown as a badge in
         the greeting so a "teacher just graded your exam" alert isn't
         buried in /notifications.
    """
    since = timezone.now() - timedelta(days=days)
    my_attempts_all = ExamAttempt.objects.for_tenant(tenant).filter(student=student)
    my_attempts = my_attempts_all.filter(submitted_at__gte=since)

    upcoming_qs = (
        visible_assessments_for_student(tenant, student)
        .filter(
            Q(ends_at__isnull=True) | Q(ends_at__gte=timezone.now()),
            status=Assessment.Status.PUBLISHED,
        )
        .order_by("ends_at", "starts_at")[:5]
    )

    # Map of assessment_id -> ExamAttempt.id for this student's
    # IN_PROGRESS attempts. Used below to power the resume CTA.
    in_progress_map = {
        a.assessment_id: a.id
        for a in my_attempts_all.filter(status=ExamAttempt.Status.IN_PROGRESS)
    }
    upcoming = []
    for a in upcoming_qs:
        used = my_attempts_all.filter(
            assessment=a,
            status__in=[
                ExamAttempt.Status.SUBMITTED,
                ExamAttempt.Status.GRADED,
                ExamAttempt.Status.EXPIRED,
            ],
        ).count()

        # Phase A — effective window for THIS student (uses target overrides
        # + tenant exam policy). Mirrors what /assessments/ returns.
        from apps.assessments.services import resolve_effective_window
        win = resolve_effective_window(a, student)

        upcoming.append(
        {
            "id": a.id,
            "title": a.title,
            "assessment_type": a.assessment_type,
            "starts_at": a.starts_at,
            "ends_at": a.ends_at,
            "duration_minutes": a.duration_minutes,
            "my_attempts_used": used,
            "max_attempts": a.max_attempts,
            "has_in_progress_attempt": a.id in in_progress_map,
            "in_progress_attempt_id": in_progress_map.get(a.id),
            # NEW: window payload
            "window": {
                "state": win["state"],
                "can_start": win["can_start"],
                "reason": win["reason"],
                "opens_at": win["opens_at"].isoformat() if win["opens_at"] else None,
                "closes_at": win["closes_at"].isoformat() if win["closes_at"] else None,
                "latest_entry_at": (
                    win["latest_entry_at"].isoformat()
                    if win["latest_entry_at"]
                    else None
                ),
                "max_duration_if_started_now": win["max_duration_if_started_now"],
            },
        }
    )
    graded = my_attempts.filter(status=ExamAttempt.Status.GRADED)
    pass_count = graded.filter(is_passed=True).count()
    pass_rate = round(pass_count / graded.count() * 100, 1) if graded.count() else None

    metrics = {
        "upcoming_assessments": len(upcoming),
        "total_attempts": my_attempts.count(),
        "avg_percentage": _avg_percentage(my_attempts),
        "pass_rate": pass_rate,
        "range_days": days,
    }

    recent = (
        my_attempts_all.filter(submitted_at__isnull=False)
        .select_related("assessment")
        .order_by("-submitted_at")[:5]
    )
    recent_results = [
        {
            "attempt_id": a.id,
            "assessment_id": a.assessment.id,
            "assessment_title": a.assessment.title,
            "score": str(a.score) if a.score is not None else None,
            "max_score": str(a.max_score),
            "percentage": round(a.percentage, 1),
            "is_passed": a.is_passed,
            "status": a.status,
            "submitted_at": a.submitted_at,
        }
        for a in recent
    ]

    # F-20: unread notifications badge.
    from apps.notifications.models import Notification

    unread_notifications_count = Notification.objects.filter(
        user=student, is_read=False
    ).count()

    return {
        "metrics": metrics,
        "chart": _daily_series(my_attempts, days=days),
        "upcoming": upcoming,
        "recent_results": recent_results,
        "unread_notifications_count": unread_notifications_count,
    }
    
# ============================================================================
# Batch 18 (Milestone 5) — Admin reports
# ============================================================================


def admin_reports(tenant, days=7):
    """Tenant-wide operational report for OWNER/ADMIN.

    Returns aggregated metrics across three domains over the given range:
      - Attendance: overall rate, per-group breakdown, daily trend
      - Exams: status distribution, avg score, top assessments by volume
      - Teachers: per-teacher activity, active vs inactive classification

    Design:
      - Every "per-teacher" count is computed in ONE grouped query per
        metric (4 queries total for N teachers), never N+1.
      - The teacher activity classification is activity-based over the
        range: 0 actions = inactive, 1-2 = low, ≥3 = active.
      - All percentages are 0-100 rounded to 1 decimal, or None when the
        denominator is 0 (empty range) — never a fake 0%.
    """
    from django.utils import timezone

    from apps.assessments.models import Assessment
    from apps.attendance.models import AttendanceSession
    from apps.content.models import Content

    since_dt = timezone.now() - timedelta(days=days)
    since_date = since_dt.date()
    today = timezone.localdate()

    # ---- Attendance: closed sessions within the range ----
    session_aggs = list(
        AttendanceSession.objects.for_tenant(tenant)
        .filter(
            date__gte=since_date,
            date__lte=today,
            status=AttendanceSession.Status.CLOSED,
        )
        .annotate(
            present_count=Count("records", filter=Q(records__status="PRESENT")),
            late_count=Count("records", filter=Q(records__status="LATE")),
            total_count=Count("records"),
        )
        .select_related("group")
    )

    # By group
    by_group_map: dict = {}
    for s in session_aggs:
        g_id = s.group_id
        if g_id not in by_group_map:
            by_group_map[g_id] = {
                "group_id": str(g_id),
                "group_name": s.group.name,
                "total_sessions": 0,
                "total_present": 0,
                "total_records": 0,
            }
        e = by_group_map[g_id]
        e["total_sessions"] += 1
        e["total_present"] += s.present_count + s.late_count
        e["total_records"] += s.total_count

    by_group = []
    for e in by_group_map.values():
        e["avg_present_pct"] = (
            round(e["total_present"] / e["total_records"] * 100, 1)
            if e["total_records"] > 0
            else None
        )
        by_group.append(e)
    by_group.sort(key=lambda x: -(x["avg_present_pct"] or 0))

    # Overall
    total_present = sum(e["total_present"] for e in by_group)
    total_records = sum(e["total_records"] for e in by_group)
    overall_rate = (
        round(total_present / total_records * 100, 1) if total_records > 0 else None
    )

    # Daily trend
    trend_map: dict = {}
    for s in session_aggs:
        d = s.date.isoformat()
        if d not in trend_map:
            trend_map[d] = {"date": d, "sessions": 0, "present": 0, "total": 0}
        trend_map[d]["sessions"] += 1
        trend_map[d]["present"] += s.present_count + s.late_count
        trend_map[d]["total"] += s.total_count

    attendance_trend = [
        {
            "date": d,
            "sessions": v["sessions"],
            "present_pct": (
                round(v["present"] / v["total"] * 100, 1) if v["total"] > 0 else None
            ),
        }
        for d, v in sorted(trend_map.items())
    ]

    # ---- Exams: attempts started within the range ----
    attempts_in_range = ExamAttempt.objects.for_tenant(tenant).filter(
        started_at__gte=since_dt
    )
    total_attempts = attempts_in_range.count()
    completed_attempts = attempts_in_range.filter(
        status__in=[ExamAttempt.Status.SUBMITTED, ExamAttempt.Status.GRADED]
    ).count()
    pending_grading = attempts_in_range.filter(
        status=ExamAttempt.Status.SUBMITTED
    ).count()
    in_progress = attempts_in_range.filter(
        status=ExamAttempt.Status.IN_PROGRESS
    ).count()

    # Avg percentage (graded only, safe division)
    pct_expr = Case(
        When(max_score=0, then=Value(0.0)),
        default=(F("score") * 100.0 / F("max_score")),
        output_field=FloatField(),
    )
    avg_result = attempts_in_range.filter(status=ExamAttempt.Status.GRADED).aggregate(
        avg_pct=Avg(pct_expr)
    )
    avg_score_pct = (
        round(float(avg_result["avg_pct"]), 1)
        if avg_result["avg_pct"] is not None
        else None
    )

    # Top 5 assessments by attempt volume
    by_assessment_rows = (
        attempts_in_range.values("assessment_id", "assessment__title")
        .annotate(
            attempts=Count("id"),
            completed=Count(
                "id",
                filter=Q(
                    status__in=[
                        ExamAttempt.Status.SUBMITTED,
                        ExamAttempt.Status.GRADED,
                    ]
                ),
            ),
        )
        .order_by("-attempts")[:5]
    )
    by_assessment = [
        {
            "assessment_id": str(r["assessment_id"]),
            "title": r["assessment__title"],
            "attempts": r["attempts"],
            "completed": r["completed"],
        }
        for r in by_assessment_rows
    ]

    # ---- Teachers: activity per teacher (4 aggregated queries total) ----
    teachers_qs = User.objects.for_tenant(tenant).filter(
        role=User.Role.TEACHER, is_active=True
    )
    teacher_ids = list(teachers_qs.values_list("id", flat=True))

    assessments_by_teacher = dict(
        Assessment.objects.for_tenant(tenant)
        .filter(created_by_id__in=teacher_ids, created_at__gte=since_dt)
        .values_list("created_by_id")
        .annotate(c=Count("id"))
        .values_list("created_by_id", "c")
    )
    content_by_teacher = dict(
        Content.objects.for_tenant(tenant)
        .filter(created_by_id__in=teacher_ids, created_at__gte=since_dt)
        .values_list("created_by_id")
        .annotate(c=Count("id"))
        .values_list("created_by_id", "c")
    )
    sessions_by_teacher = dict(
        AttendanceSession.objects.for_tenant(tenant)
        .filter(
            teacher_id__in=teacher_ids,
            date__gte=since_date,
            status=AttendanceSession.Status.CLOSED,
        )
        .values_list("teacher_id")
        .annotate(c=Count("id"))
        .values_list("teacher_id", "c")
    )
    pending_by_teacher = dict(
        ExamAttempt.objects.for_tenant(tenant)
        .filter(
            assessment__created_by_id__in=teacher_ids,
            status=ExamAttempt.Status.SUBMITTED,
        )
        .values_list("assessment__created_by_id")
        .annotate(c=Count("id"))
        .values_list("assessment__created_by_id", "c")
    )

    by_teacher = []
    for t in teachers_qs:
        a_count = assessments_by_teacher.get(t.id, 0)
        c_count = content_by_teacher.get(t.id, 0)
        s_count = sessions_by_teacher.get(t.id, 0)
        p_count = pending_by_teacher.get(t.id, 0)
        total = a_count + c_count + s_count

        if total == 0:
            activity = "inactive"
        elif total < 3:
            activity = "low"
        else:
            activity = "active"

        by_teacher.append(
            {
                "teacher_id": str(t.id),
                "name": (f"{t.first_name} {t.last_name}".strip() or t.email),
                "email": t.email,
                "assessments_created": a_count,
                "content_uploaded": c_count,
                "sessions_taught": s_count,
                "grading_pending": p_count,
                "total_actions": total,
                "activity": activity,
            }
        )

    by_teacher.sort(key=lambda x: -x["total_actions"])
    active_count = sum(1 for t in by_teacher if t["activity"] == "active")
    inactive_count = sum(1 for t in by_teacher if t["activity"] == "inactive")

    return {
        "range_days": days,
        "attendance": {
            "overall_rate": overall_rate,
            "by_group": by_group,
            "trend": attendance_trend,
        },
        "exams": {
            "total_attempts": total_attempts,
            "completed": completed_attempts,
            "pending_grading": pending_grading,
            "in_progress": in_progress,
            "avg_score_pct": avg_score_pct,
            "by_assessment": by_assessment,
        },
        "teachers": {
            "total": len(by_teacher),
            "active": active_count,
            "inactive": inactive_count,
            "by_teacher": by_teacher,
        },
        "generated_at": timezone.now(),
    }