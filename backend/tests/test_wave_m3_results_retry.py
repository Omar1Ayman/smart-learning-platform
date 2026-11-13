"""Wave M3 (Milestone 3, Batch 11) — F-21 retry eligibility.

AttemptResult must include `can_retry` and `retry_reason` computed from
the same rules as `start_attempt`, so the UI never offers a Retry
button that would 400 on click.
"""

from decimal import Decimal

import pytest
from django.utils import timezone

from apps.assessments.models import AssessmentQuestion, AssessmentTarget
from apps.exam_engine.models import ExamAttempt

from .conftest import login_as
from .factories import (
    AssessmentFactory,
    EnrollmentFactory,
    GroupFactory,
    QuestionBankFactory,
    QuestionFactory,
    StudentUserFactory,
    TenantFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def _setup_student_with_assessment(*, max_attempts=2, allow_retakes=True, ends_in_days=1):
    tenant = TenantFactory()
    student = StudentUserFactory(tenant=tenant)
    group = GroupFactory(tenant=tenant)
    EnrollmentFactory(
        tenant=tenant, student=student, group=group, academic_year=group.academic_year
    )

    assessment = AssessmentFactory(
        tenant=tenant,
        status="PUBLISHED",
        max_attempts=max_attempts,
        ends_at=timezone.now() + timezone.timedelta(days=ends_in_days),
    )
    AssessmentTarget.objects.create(
        tenant=tenant, assessment=assessment, target_type="GRADE", grade=group.grade
    )
    bank = QuestionBankFactory(tenant=tenant)
    q = QuestionFactory(
        bank=bank,
        tenant=tenant,
        approved=True,
        created_by=UserFactory(tenant=tenant, role="TEACHER"),
    )
    AssessmentQuestion.objects.create(tenant=tenant, assessment=assessment, question=q, order=1)

    if not allow_retakes:
        s = tenant.get_settings()
        s["exam_policy"]["allow_retakes"] = False
        tenant.settings = s
        tenant.save(update_fields=["settings"])

    return tenant, student, assessment


def _make_graded_attempt(tenant, student, assessment, *, attempt_number=1):
    return ExamAttempt.objects.create(
        tenant=tenant,
        assessment=assessment,
        student=student,
        attempt_number=attempt_number,
        status=ExamAttempt.Status.GRADED,
        question_order=[],
        max_score=Decimal("0"),
        score=Decimal("0"),
        submitted_at=timezone.now(),
        graded_at=timezone.now(),
    )


def test_can_retry_true_when_allowed(api_client):
    tenant, student, assessment = _setup_student_with_assessment(max_attempts=2)
    attempt = _make_graded_attempt(tenant, student, assessment, attempt_number=1)

    client = login_as(api_client, student)
    r = client.get(f"/api/v1/attempts/{attempt.id}/result/")
    assert r.status_code == 200
    assert r.data["can_retry"] is True
    assert r.data["retry_reason"] is None


def test_can_retry_false_when_max_attempts_reached(api_client):
    tenant, student, assessment = _setup_student_with_assessment(max_attempts=1)
    attempt = _make_graded_attempt(tenant, student, assessment, attempt_number=1)

    client = login_as(api_client, student)
    r = client.get(f"/api/v1/attempts/{attempt.id}/result/")
    assert r.data["can_retry"] is False
    assert "المحاولات" in r.data["retry_reason"]


def test_can_retry_false_when_allow_retakes_off(api_client):
    tenant, student, assessment = _setup_student_with_assessment(
        max_attempts=5, allow_retakes=False
    )
    attempt = _make_graded_attempt(tenant, student, assessment, attempt_number=1)

    client = login_as(api_client, student)
    r = client.get(f"/api/v1/attempts/{attempt.id}/result/")
    assert r.data["can_retry"] is False
    assert "لا تسمح" in r.data["retry_reason"]


def test_can_retry_false_when_window_closed(api_client):
    tenant, student, assessment = _setup_student_with_assessment(max_attempts=5, ends_in_days=-1)
    attempt = _make_graded_attempt(tenant, student, assessment, attempt_number=1)

    client = login_as(api_client, student)
    r = client.get(f"/api/v1/attempts/{attempt.id}/result/")
    assert r.data["can_retry"] is False
    assert "انتهت" in r.data["retry_reason"]


def test_retry_click_actually_starts_new_attempt(api_client):
    """Sanity: when can_retry is true, startAssessment must succeed."""
    tenant, student, assessment = _setup_student_with_assessment(max_attempts=2)
    first = _make_graded_attempt(tenant, student, assessment, attempt_number=1)

    client = login_as(api_client, student)
    r = client.post(f"/api/v1/assessments/{assessment.id}/start/")
    assert r.status_code == 201
    assert r.data["attempt_number"] == 2
    assert r.data["id"] != str(first.id)
