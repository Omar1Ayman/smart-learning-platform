"""Wave Zero — H-1 + H-2: only ACTIVE enrollments grant visibility.

H-1: `visible_content_for_student` used to look at the most recent
enrollment regardless of status. A SUSPENDED / TRANSFERRED / GRADUATED /
INACTIVE / ARCHIVED student would still see all published content for
their historical grade — a real data-leak scenario when a school
suspends a student for non-payment.

H-2: `visible_assessments_for_student` and `is_student_targeted` had
the same bug and disagreed with `get_targeted_students` (which
correctly filtered status=ACTIVE). All three now agree.
"""
import pytest
from apps.assessments.models import AssessmentTarget
from apps.assessments.services import (
    is_student_targeted,
    visible_assessments_for_student,
)
from apps.content.models import Content
from apps.content.services import visible_content_for_student
from apps.people.models import Enrollment

from .factories import (
    AssessmentFactory,
    EnrollmentFactory,
    GroupFactory,
    StudentUserFactory,
)

pytestmark = pytest.mark.django_db


def _setup_group_and_student():
    group = GroupFactory()
    student = StudentUserFactory(tenant=group.tenant)
    return group, student


# ---- H-1: content ----


def test_active_student_sees_published_content():
    """Sanity: with ACTIVE enrollment, content is visible as before."""
    group, student = _setup_group_and_student()
    EnrollmentFactory(
        tenant=group.tenant,
        student=student,
        group=group,
        academic_year=group.academic_year,
    )
    content = Content.objects.create(
        tenant=group.tenant,
        title="Biology",
        content_type=Content.ContentType.TEXT,
        text_body="...",
        grade=group.grade,
        is_published=True,
    )

    qs = visible_content_for_student(group.tenant, student)
    assert content in qs


@pytest.mark.parametrize(
    "status",
    [
        Enrollment.Status.SUSPENDED,
        Enrollment.Status.TRANSFERRED,
        Enrollment.Status.GRADUATED,
        Enrollment.Status.INACTIVE,
        Enrollment.Status.ARCHIVED,
    ],
)
def test_non_active_student_sees_no_content(status):
    """H-1: any non-ACTIVE status must yield an empty content queryset."""
    group, student = _setup_group_and_student()
    EnrollmentFactory(
        tenant=group.tenant,
        student=student,
        group=group,
        academic_year=group.academic_year,
        status=status,
    )
    Content.objects.create(
        tenant=group.tenant,
        title="Biology",
        content_type=Content.ContentType.TEXT,
        text_body="...",
        grade=group.grade,
        is_published=True,
    )

    qs = visible_content_for_student(group.tenant, student)
    assert qs.count() == 0


# ---- H-2: assessments ----


def test_suspended_student_sees_no_assessments():
    group, student = _setup_group_and_student()
    EnrollmentFactory(
        tenant=group.tenant,
        student=student,
        group=group,
        academic_year=group.academic_year,
        status=Enrollment.Status.SUSPENDED,
    )
    assessment = AssessmentFactory(tenant=group.tenant, status="PUBLISHED")
    AssessmentTarget.objects.create(
        tenant=group.tenant,
        assessment=assessment,
        target_type="GRADE",
        grade=group.grade,
    )

    assert visible_assessments_for_student(group.tenant, student).count() == 0
    assert is_student_targeted(assessment, student) is False


def test_active_student_sees_targeted_published_assessment():
    """Sanity: with ACTIVE enrollment, targeted assessment is visible."""
    group, student = _setup_group_and_student()
    EnrollmentFactory(
        tenant=group.tenant,
        student=student,
        group=group,
        academic_year=group.academic_year,
    )
    assessment = AssessmentFactory(tenant=group.tenant, status="PUBLISHED")
    AssessmentTarget.objects.create(
        tenant=group.tenant,
        assessment=assessment,
        target_type="GRADE",
        grade=group.grade,
    )

    assert visible_assessments_for_student(group.tenant, student).count() == 1
    assert is_student_targeted(assessment, student) is True