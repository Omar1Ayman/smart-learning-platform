"""
A student is eligible for an Assessment if *any one* of its target rows
matches them (OR, unlike Content's AND). Resolution uses the student's
current (most recent) *active* Enrollment — a student with no active
enrollment has no academic context and sees nothing, same rule as
apps/content/services.py.

H-2 FIX (Wave Zero): `_current_enrollment` used to filter by `student`
only, meaning `visible_assessments_for_student` and `is_student_targeted`
would let a SUSPENDED/TRANSFERRED/GRADUATED student see and start
assessments — inconsistent with `get_targeted_students`, which already
correctly filtered by `status="ACTIVE"`. The two code paths now agree:
a non-active student is not eligible.

Post-review fixes:
  - Removed the duplicate definition of `is_student_targeted` (the first
    one — based on `_get_matching_targets` — wins and is the only one).
  - `resolve_effective_window` uses `django.utils.timezone.now()`
    instead of an unimported `dj_tz`.
  - `get_targeted_students` now filters directly-targeted student IDs by
    an ACTIVE enrollment, matching `is_student_targeted`'s contract.
  - `duplicate_assessment` now copies `late_entry_minutes`,
    `entry_cutoff_minutes`, and per-target `opens_at`/`closes_at`, so a
    duplicate preserves its window/targeting exactly.
"""

from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from apps.people.models import Enrollment
from django.db import transaction
from apps.common.utils import unique_copy_name
from .models import Assessment, AssessmentQuestion, AssessmentTarget

def _current_enrollment(tenant, student):
    return (
        Enrollment.objects.for_tenant(tenant)
        .filter(student=student, status=Enrollment.Status.ACTIVE)  # H-2
        .select_related("group", "group__grade", "group__grade__stage")
        .order_by("-academic_year__start_date")
        .first()
    )


def _get_matching_targets(assessment, student) -> list:
    """Return all AssessmentTarget rows that match this student.

    Sorted by specificity: STUDENT > GROUP > GRADE > STAGE > TENANT.
    The FIRST item is the "most specific" match and is used to resolve
    this student's effective window.
    """
    enrollment = _current_enrollment(assessment.tenant, student)
    if enrollment is None:
        return []

    grade = enrollment.group.grade
    stage = grade.stage
    group = enrollment.group

    matching = list(
        AssessmentTarget.objects.for_tenant(assessment.tenant)
        .filter(assessment=assessment)
        .filter(
            Q(target_type=AssessmentTarget.TargetType.TENANT)
            | Q(target_type=AssessmentTarget.TargetType.STAGE, stage=stage)
            | Q(target_type=AssessmentTarget.TargetType.GRADE, grade=grade)
            | Q(target_type=AssessmentTarget.TargetType.GROUP, group=group)
            | Q(target_type=AssessmentTarget.TargetType.STUDENT, student=student)
        )
    )

    priority = {
        AssessmentTarget.TargetType.STUDENT: 0,
        AssessmentTarget.TargetType.GROUP: 1,
        AssessmentTarget.TargetType.GRADE: 2,
        AssessmentTarget.TargetType.STAGE: 3,
        AssessmentTarget.TargetType.TENANT: 4,
    }
    matching.sort(key=lambda t: priority[t.target_type])
    return matching


def is_student_targeted(assessment, student) -> bool:
    """True if any target row matches this student."""
    return bool(_get_matching_targets(assessment, student))


def resolve_effective_window(assessment, student, now=None) -> dict:
    """Compute this student's effective exam window + entry state.

    Returns a dict:
      {
        "state": "OPEN" | "NOT_YET" | "CLOSED" | "NO_TARGET",
        "can_start": bool,
        "reason": str,                    # Arabic — empty when can_start=True
        "opens_at": datetime | None,      # effective window start
        "closes_at": datetime | None,     # effective window close
        "latest_entry_at": datetime | None,  # last moment entry is allowed
        "max_duration_if_started_now": int | None,  # seconds
      }

    State meanings:
      - NO_TARGET:   student is not in any matching target row
      - NOT_YET:     now < opens_at
      - CLOSED:      now > latest_entry_at (late-entry or cutoff reached)
      - OPEN:        student can start right now
    """
    now = now or timezone.now()

    matching = _get_matching_targets(assessment, student)
    if not matching:
        return {
            "state": "NO_TARGET",
            "can_start": False,
            "reason": "أنت غير مستهدف بهذا الامتحان.",
            "opens_at": None,
            "closes_at": None,
            "latest_entry_at": None,
            "max_duration_if_started_now": None,
        }

    most_specific = matching[0]

    opens_at = most_specific.opens_at or assessment.starts_at
    closes_at = most_specific.closes_at or assessment.ends_at

    # No schedule at all — always open (edge case: a practice quiz)
    if opens_at is None and closes_at is None:
        return {
            "state": "OPEN",
            "can_start": True,
            "reason": "",
            "opens_at": None,
            "closes_at": None,
            "latest_entry_at": None,
            "max_duration_if_started_now": (
                assessment.duration_minutes * 60
                if assessment.duration_minutes
                else None
            ),
        }

    # Latest entry = earliest of (opens + late_entry, closes - cutoff)
    latest_by_late = None
    if opens_at is not None and assessment.late_entry_minutes is not None:
        latest_by_late = opens_at + timedelta(minutes=assessment.late_entry_minutes)

    latest_by_cutoff = None
    if closes_at is not None:
        cutoff = assessment.entry_cutoff_minutes or 0
        latest_by_cutoff = closes_at - timedelta(minutes=cutoff)

    candidates = [c for c in (latest_by_late, latest_by_cutoff) if c is not None]
    latest_entry_at = min(candidates) if candidates else None

    # --- State checks ---
    if opens_at is not None and now < opens_at:
        return {
            "state": "NOT_YET",
            "can_start": False,
            "reason": "لم يحن وقت الامتحان بعد.",
            "opens_at": opens_at,
            "closes_at": closes_at,
            "latest_entry_at": latest_entry_at,
            "max_duration_if_started_now": None,
        }

    if latest_entry_at is not None and now > latest_entry_at:
        return {
            "state": "CLOSED",
            "can_start": False,
            "reason": "فات وقت الدخول. تواصل مع المعلم.",
            "opens_at": opens_at,
            "closes_at": closes_at,
            "latest_entry_at": latest_entry_at,
            "max_duration_if_started_now": None,
        }

    # --- OPEN: compute max duration from NOW ---
    max_seconds = None
    if closes_at is not None:
        remaining = (closes_at - now).total_seconds()
        if remaining <= 0:
            return {
                "state": "CLOSED",
                "can_start": False,
                "reason": "انتهى وقت الامتحان.",
                "opens_at": opens_at,
                "closes_at": closes_at,
                "latest_entry_at": latest_entry_at,
                "max_duration_if_started_now": None,
            }
        max_seconds = int(remaining)

    if assessment.duration_minutes:
        duration_seconds = assessment.duration_minutes * 60
        max_seconds = (
            min(max_seconds, duration_seconds)
            if max_seconds is not None
            else duration_seconds
        )

    return {
        "state": "OPEN",
        "can_start": True,
        "reason": "",
        "opens_at": opens_at,
        "closes_at": closes_at,
        "latest_entry_at": latest_entry_at,
        "max_duration_if_started_now": max_seconds,
    }


def visible_assessments_for_student(tenant, student):
    """PUBLISHED assessments only — a DRAFT is never visible to a student
    even if a target row would otherwise match it."""
    enrollment = _current_enrollment(tenant, student)
    if enrollment is None:
        return Assessment.objects.none()

    grade = enrollment.group.grade
    stage = grade.stage
    group = enrollment.group

    matching_assessment_ids = (
        AssessmentTarget.objects.for_tenant(tenant)
        .filter(
            Q(target_type=AssessmentTarget.TargetType.TENANT)
            | Q(target_type=AssessmentTarget.TargetType.STAGE, stage=stage)
            | Q(target_type=AssessmentTarget.TargetType.GRADE, grade=grade)
            | Q(target_type=AssessmentTarget.TargetType.GROUP, group=group)
            | Q(target_type=AssessmentTarget.TargetType.STUDENT, student=student)
        )
        .values_list("assessment_id", flat=True)
        .distinct()
    )
    return Assessment.objects.for_tenant(tenant).filter(
        id__in=list(matching_assessment_ids),
        status=Assessment.Status.PUBLISHED,
    )


def estimate_reach(assessment):
    """Rough estimate of distinct students matched by ANY target row.

    This is a *sizing* helper for the UI ("~40 students will see this"),
    not an authoritative count — enrollment statuses are not filtered
    here on purpose (an INACTIVE enrollment in a matching grade still
    counts for the estimate), and a student with historical enrollments
    in multiple years counts once. If a stricter definition is ever
    needed (e.g. "currently-active enrollments only"), that's a separate
    function, not a change here.
    """
    targets = list(assessment.targets.all())
    if not targets:
        return 0

    # Any TENANT target means "everyone with at least one enrollment"
    if any(t.target_type == "TENANT" for t in targets):
        return (
            Enrollment.objects.for_tenant(assessment.tenant)
            .values("student_id")
            .distinct()
            .count()
        )

    q = Q()
    for t in targets:
        if t.target_type == "STAGE" and t.stage_id:
            q |= Q(group__grade__stage_id=t.stage_id)
        elif t.target_type == "GRADE" and t.grade_id:
            q |= Q(group__grade_id=t.grade_id)
        elif t.target_type == "GROUP" and t.group_id:
            q |= Q(group_id=t.group_id)
        elif t.target_type == "STUDENT" and t.student_id:
            q |= Q(student_id=t.student_id)

    if not q:
        return 0

    return (
        Enrollment.objects.for_tenant(assessment.tenant)
        .filter(q)
        .values("student_id")
        .distinct()
        .count()
    )


def get_targeted_students(assessment):
    """Reverse of is_student_targeted. Return every STUDENT who matches
    any target row (OR-across-rows, same as the visibility service).

    Used by the notification trigger on publish. If the assessment has
    zero targets, returns an empty queryset — nothing to notify.

    Post-review fix: directly-targeted students (STUDENT targets) are
    now filtered through an ACTIVE enrollment, matching the contract of
    `is_student_targeted`. Otherwise a graduated/transferred student
    with a direct target row would receive a "new exam" notification
    for an exam they can never open.
    """
    from apps.accounts.models import User

    targets = list(assessment.targets.all())
    if not targets:
        return User.objects.none()

    # TENANT targets mean "every enrolled student" — short-circuit.
    if any(t.target_type == "TENANT" for t in targets):
        enrolled_ids = (
            Enrollment.objects.for_tenant(assessment.tenant)
            .filter(status=Enrollment.Status.ACTIVE)
            .values_list("student_id", flat=True)
            .distinct()
        )
        return User.objects.for_tenant(assessment.tenant).filter(
            role=User.Role.STUDENT, id__in=enrolled_ids
        )

    enrollment_q = Q()
    direct_student_ids = []
    for t in targets:
        if t.target_type == "STAGE" and t.stage_id:
            enrollment_q |= Q(group__grade__stage_id=t.stage_id)
        elif t.target_type == "GRADE" and t.grade_id:
            enrollment_q |= Q(group__grade_id=t.grade_id)
        elif t.target_type == "GROUP" and t.group_id:
            enrollment_q |= Q(group_id=t.group_id)
        elif t.target_type == "STUDENT" and t.student_id:
            direct_student_ids.append(t.student_id)

    # Post-review fix: filter direct student IDs through ACTIVE
    # enrollment so we don't notify an ineligible student.
    student_ids: set[str] = set()
    if direct_student_ids:
        student_ids |= set(
            Enrollment.objects.for_tenant(assessment.tenant)
            .filter(
                student_id__in=direct_student_ids,
                status=Enrollment.Status.ACTIVE,
            )
            .values_list("student_id", flat=True)
            .distinct()
        )

    if enrollment_q:
        student_ids |= set(
            Enrollment.objects.for_tenant(assessment.tenant)
            .filter(enrollment_q, status=Enrollment.Status.ACTIVE)
            .values_list("student_id", flat=True)
            .distinct()
        )

    return User.objects.for_tenant(assessment.tenant).filter(
        role=User.Role.STUDENT, id__in=list(student_ids)
    )


# ============================================================================
# Wave C1 — Duplicate assessment
# ============================================================================

def duplicate_assessment(assessment, actor):
    """Create a full copy of `assessment` as a new DRAFT owned by `actor`.

    What's copied:
      - All scalar fields (title + suffix، description، type، schedule،
        attempts، passing_score، randomize flags، question_count،
        late_entry_minutes، entry_cutoff_minutes)
      - AssessmentQuestion rows (question + order + points_override)
      - AssessmentTarget rows (all targeting rules, INCLUDING the
        per-target opens_at/closes_at overrides — post-review fix)

    What's reset:
      - status → DRAFT (never auto-publish a duplicate)
      - published_at → None
      - created_by → actor (so the duplicator can edit it — a TEACHER
        who duplicates their own draft keeps control؛ an ADMIN who
        duplicates someone else's assessment becomes the owner)
      - attempts are NOT carried over (each copy starts fresh)

    The title gets "(نسخة)" appended — with automatic numbering if that
    name is already taken، so a teacher can duplicate multiple times
    without manually renaming.

    Returns the new Assessment instance.
    """
    from apps.common.utils import unique_copy_name

    new_title = unique_copy_name(
        assessment.title,
        lambda name: Assessment.objects.for_tenant(assessment.tenant)
        .filter(title=name)
        .exists(),
    )

    with transaction.atomic():
        copy = Assessment.objects.create(
            tenant=assessment.tenant,
            title=new_title,
            description=assessment.description,
            assessment_type=assessment.assessment_type,
            status=Assessment.Status.DRAFT,
            # Schedule: keep the times as hints — the user usually adjusts
            # them. Not resetting to None so the wizard's step 4 isn't blank.
            starts_at=assessment.starts_at,
            ends_at=assessment.ends_at,
            duration_minutes=assessment.duration_minutes,
            max_attempts=assessment.max_attempts,
            passing_score=assessment.passing_score,
            randomize_question_order=assessment.randomize_question_order,
            randomize_option_order=assessment.randomize_option_order,
            question_count=assessment.question_count,
            # Post-review fix: copy the entry-window knobs — otherwise
            # the duplicate loses its late-entry/cutoff policy.
            late_entry_minutes=assessment.late_entry_minutes,
            entry_cutoff_minutes=assessment.entry_cutoff_minutes,
            created_by=actor,
        )

        # Copy question links (order + points_override preserved).
        for link in assessment.assessment_questions.all():
            AssessmentQuestion.objects.create(
                tenant=assessment.tenant,
                assessment=copy,
                question=link.question,
                order=link.order,
                points_override=link.points_override,
            )

        # Copy targets (all rows — a teacher often reuses the same
        # targeting across multiple assessments، so this is usually right).
        # Post-review fix: per-target opens_at/closes_at are preserved.
        for t in assessment.targets.all():
            AssessmentTarget.objects.create(
                tenant=assessment.tenant,
                assessment=copy,
                target_type=t.target_type,
                stage=t.stage,
                grade=t.grade,
                group=t.group,
                student=t.student,
                opens_at=t.opens_at,
                closes_at=t.closes_at,
            )

    return copy