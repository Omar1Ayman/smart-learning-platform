"""
A student is eligible for an Assessment if *any one* of its target rows
matches them (OR, unlike Content's AND). Resolution uses the student's
current (most recent) Enrollment — a student with no enrollment has no
academic context and sees nothing, same rule as apps/content/services.py.
"""

from django.db.models import Q

from apps.assessments.models import Assessment, AssessmentTarget
from apps.people.models import Enrollment


def _current_enrollment(tenant, student):
    return (
        Enrollment.objects.for_tenant(tenant)
        .filter(student=student)
        .select_related("group", "group__grade", "group__grade__stage")
        .order_by("-academic_year__start_date")
        .first()
    )


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
        id__in=list(matching_assessment_ids), status=Assessment.Status.PUBLISHED
    )


def is_student_targeted(assessment, student):
    enrollment = _current_enrollment(assessment.tenant, student)
    if enrollment is None:
        return False
    grade = enrollment.group.grade
    stage = grade.stage
    group = enrollment.group
    return assessment.targets.filter(
        Q(target_type=AssessmentTarget.TargetType.TENANT)
        | Q(target_type=AssessmentTarget.TargetType.STAGE, stage=stage)
        | Q(target_type=AssessmentTarget.TargetType.GRADE, grade=grade)
        | Q(target_type=AssessmentTarget.TargetType.GROUP, group=group)
        | Q(target_type=AssessmentTarget.TargetType.STUDENT, student=student)
    ).exists()
