"""Wave M4 (Milestone 4, Batch 14) — teacher dashboard `pending_grading_items`."""

from decimal import Decimal

import pytest
from django.utils import timezone

from apps.assessments.models import AssessmentQuestion, AssessmentTarget
from apps.exam_engine.models import AttemptAnswer, ExamAttempt
from apps.questions.models import Question

from .conftest import login_as
from .factories import (
    AssessmentFactory,
    EnrollmentFactory,
    GroupFactory,
    QuestionBankFactory,
    QuestionFactory,
    StudentUserFactory,
    TeacherUserFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def _setup_submitted_attempt(*, teacher, essay_points="10.00"):
    """One published assessment (created by `teacher`) with 1 ESSAY question
    and 1 SUBMITTED attempt with a pending essay answer."""
    group = GroupFactory(tenant=teacher.tenant)
    student = StudentUserFactory(tenant=teacher.tenant)
    EnrollmentFactory(
        tenant=teacher.tenant,
        student=student,
        group=group,
        academic_year=group.academic_year,
    )
    assessment = AssessmentFactory(
        tenant=teacher.tenant,
        status="PUBLISHED",
        created_by=teacher,
        title=f"Assessment for {student.email}",
    )
    AssessmentTarget.objects.create(
        tenant=teacher.tenant,
        assessment=assessment,
        target_type="GRADE",
        grade=group.grade,
    )
    bank = QuestionBankFactory(tenant=teacher.tenant)
    essay_q = QuestionFactory(
        bank=bank,
        tenant=teacher.tenant,
        question_type=Question.QuestionType.ESSAY,
        points=essay_points,
        approved=True,
        created_by=teacher,
    )
    AssessmentQuestion.objects.create(
        tenant=teacher.tenant, assessment=assessment, question=essay_q, order=1
    )
    attempt = ExamAttempt.objects.create(
        tenant=teacher.tenant,
        assessment=assessment,
        student=student,
        attempt_number=1,
        status=ExamAttempt.Status.SUBMITTED,
        question_order=[str(essay_q.id)],
        max_score=Decimal(essay_points),
        score=Decimal("0"),
        submitted_at=timezone.now(),
    )
    AttemptAnswer.objects.create(
        tenant=teacher.tenant,
        attempt=attempt,
        question=essay_q,
        text_answer="Some essay answer.",
        awarded_points=None,
    )
    return attempt, student, assessment


def test_pending_grading_items_empty_when_no_submissions(api_client):
    teacher = TeacherUserFactory()
    client = login_as(api_client, teacher)
    r = client.get("/api/v1/dashboard/teacher/")
    assert r.status_code == 200
    assert r.data["pending_grading_items"] == []
    assert r.data["metrics"]["pending_grading"] == 0


def test_pending_grading_items_populated(api_client):
    teacher = TeacherUserFactory()
    attempt, student, assessment = _setup_submitted_attempt(teacher=teacher)

    client = login_as(api_client, teacher)
    r = client.get("/api/v1/dashboard/teacher/")
    assert r.status_code == 200
    assert r.data["metrics"]["pending_grading"] == 1
    assert len(r.data["pending_grading_items"]) == 1

    item = r.data["pending_grading_items"][0]
    assert item["attempt_id"] == str(attempt.id)
    assert item["assessment_id"] == str(assessment.id)
    assert item["assessment_title"] == assessment.title
    assert item["student_email"] == student.email
    assert item["student_name"] != ""  # either name or email fallback
    assert item["pending_essays"] == 1
    assert item["submitted_at"] is not None


def test_pending_grading_items_scoped_to_teacher_own_assessments(api_client):
    """An attempt on another teacher's assessment must NOT appear."""
    teacher_a = TeacherUserFactory()
    teacher_b = TeacherUserFactory(tenant=teacher_a.tenant)
    _setup_submitted_attempt(teacher=teacher_b)

    client = login_as(api_client, teacher_a)
    r = client.get("/api/v1/dashboard/teacher/")
    assert r.data["metrics"]["pending_grading"] == 0
    assert r.data["pending_grading_items"] == []


def test_pending_grading_items_limited_to_5(api_client):
    teacher = TeacherUserFactory()
    for _ in range(7):
        _setup_submitted_attempt(teacher=teacher)

    client = login_as(api_client, teacher)
    r = client.get("/api/v1/dashboard/teacher/")
    assert r.data["metrics"]["pending_grading"] == 7  # total unchanged
    assert len(r.data["pending_grading_items"]) == 5  # list capped at 5


def test_pending_grading_items_ordered_oldest_first(api_client):
    """FIFO fairness — oldest submissions shown first."""
    teacher = TeacherUserFactory()
    a1, _, _ = _setup_submitted_attempt(teacher=teacher)
    a2, _, _ = _setup_submitted_attempt(teacher=teacher)

    # Backdate a1 so it's older than a2.
    ExamAttempt.objects.filter(pk=a1.pk).update(
        submitted_at=timezone.now() - timezone.timedelta(hours=2)
    )
    a1.refresh_from_db()
    a2.refresh_from_db()

    client = login_as(api_client, teacher)
    r = client.get("/api/v1/dashboard/teacher/")
    items = r.data["pending_grading_items"]
    assert items[0]["attempt_id"] == str(a1.id)
    assert items[1]["attempt_id"] == str(a2.id)