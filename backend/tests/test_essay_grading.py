"""Wave 14 — manual ESSAY grading end-to-end."""

from decimal import Decimal

import pytest

from apps.assessments.models import AssessmentQuestion, AssessmentTarget
from apps.exam_engine.models import ExamAttempt
from apps.exam_engine.services import (
    finalize_attempt,
    grade_essay_answer,
    save_answer,
    start_attempt,
    submit_attempt,
)
from apps.questions.models import Question

from .conftest import login_as, make_teacher_in_scope_of
from .factories import (
    AssessmentFactory,
    EnrollmentFactory,
    GroupFactory,
    QuestionBankFactory,
    QuestionFactory,
    StudentUserFactory,
    TeacherUserFactory,
)

pytestmark = pytest.mark.django_db


def _setup_essay_attempt():
    group = GroupFactory()
    student = StudentUserFactory(tenant=group.tenant)
    EnrollmentFactory(
        tenant=group.tenant, student=student, group=group, academic_year=group.academic_year
    )
    assessment = AssessmentFactory(tenant=group.tenant, status="PUBLISHED")
    AssessmentTarget.objects.create(
        tenant=group.tenant, assessment=assessment, target_type="GRADE", grade=group.grade
    )
    bank = QuestionBankFactory(tenant=group.tenant)
    q = QuestionFactory(
        bank=bank,
        tenant=group.tenant,
        question_type=Question.QuestionType.ESSAY,
        points="10.00",
        approved=True,
        created_by=TeacherUserFactory(tenant=group.tenant),
    )
    AssessmentQuestion.objects.create(
        tenant=group.tenant, assessment=assessment, question=q, order=1
    )
    attempt = start_attempt(assessment, student, group.tenant)
    save_answer(attempt, q.id, text_answer="This is the student essay.")
    submit_attempt(attempt)
    attempt.refresh_from_db()
    return attempt, q, student


# ---------- services ----------


def test_essay_attempt_starts_as_submitted_not_graded():
    attempt, _q, _s = _setup_essay_attempt()
    assert attempt.status == ExamAttempt.Status.SUBMITTED


def test_grade_essay_updates_answer_and_score():
    attempt, q, _s = _setup_essay_attempt()
    teacher = TeacherUserFactory(tenant=attempt.tenant)
    grade_essay_answer(attempt, q.id, Decimal("7.00"), True, teacher)
    attempt.refresh_from_db()
    answer = attempt.answers.get(question=q)
    assert answer.is_correct is True
    assert answer.awarded_points == Decimal("7.00")
    assert answer.graded_by_id == teacher.id


def test_grade_essay_clamps_oversized_points():
    attempt, q, _s = _setup_essay_attempt()
    teacher = TeacherUserFactory(tenant=attempt.tenant)
    grade_essay_answer(attempt, q.id, Decimal("99.00"), True, teacher)
    answer = attempt.answers.get(question=q)
    assert answer.awarded_points == Decimal("10.00")  # clamped to question.points


def test_grade_essay_rejects_non_essay_question():
    """An MCQ answer must never be manually gradable via the essay path.
    The MCQ is linked after the attempt is submitted (a real user can't
    add questions to a live attempt — the flow is staff-only and gated),
    so we create the AttemptAnswer row directly via ORM. The check we're
    testing is `grade_essay_answer`'s question_type guard, not the
    autosave flow."""
    from apps.exam_engine.models import AttemptAnswer

    attempt, _q, _s = _setup_essay_attempt()
    teacher = TeacherUserFactory(tenant=attempt.tenant)

    bank = QuestionBankFactory(tenant=attempt.tenant)
    mcq = QuestionFactory(
        bank=bank,
        tenant=attempt.tenant,
        question_type=Question.QuestionType.MCQ,
        approved=True,
        created_by=teacher,
    )
    correct_option = mcq.options.create(tenant=attempt.tenant, text="A", is_correct=True, order=1)
    mcq.options.create(tenant=attempt.tenant, text="B", is_correct=False, order=2)
    AssessmentQuestion.objects.create(
        tenant=attempt.tenant, assessment=attempt.assessment, question=mcq, order=2
    )
    AttemptAnswer.objects.create(
        tenant=attempt.tenant,
        attempt=attempt,
        question=mcq,
        chosen_option=correct_option,
    )

    from rest_framework.exceptions import ValidationError

    with pytest.raises(ValidationError):
        grade_essay_answer(attempt, mcq.id, Decimal("5.00"), True, teacher)


def test_finalize_refuses_while_essay_pending():
    attempt, _q, _s = _setup_essay_attempt()
    from rest_framework.exceptions import ValidationError

    with pytest.raises(ValidationError):
        finalize_attempt(attempt)


def test_finalize_marks_graded_after_all_essays_graded():
    attempt, q, _s = _setup_essay_attempt()
    teacher = TeacherUserFactory(tenant=attempt.tenant)
    grade_essay_answer(attempt, q.id, Decimal("8.00"), True, teacher)
    finalize_attempt(attempt)
    attempt.refresh_from_db()
    assert attempt.status == ExamAttempt.Status.GRADED
    assert attempt.score == Decimal("8.00")
    assert attempt.graded_at is not None


# ---------- endpoints ----------


def test_staff_can_fetch_grading_payload(api_client):
    attempt, q, _s = _setup_essay_attempt()
    teacher = TeacherUserFactory(tenant=attempt.tenant)
    # S-6 (Wave Zero): teacher must be in scope. Make them the
    # assessment creator so the queryset-narrowing in
    # AttemptViewSet.get_queryset() includes this attempt.
    make_teacher_in_scope_of(attempt, teacher)

    client = login_as(api_client, teacher)
    resp = client.get(f"/api/v1/attempts/{attempt.id}/grading/")
    assert resp.status_code == 200
    assert resp.data["pending_essays"] == 1
    assert len(resp.data["essay_answers"]) == 1
    assert resp.data["essay_answers"][0]["question_text"] == q.text


def test_student_cannot_fetch_grading_payload(api_client):
    attempt, _q, student = _setup_essay_attempt()
    client = login_as(api_client, student)
    resp = client.get(f"/api/v1/attempts/{attempt.id}/grading/")
    assert resp.status_code == 403


def test_staff_can_grade_essay_via_endpoint(api_client):
    attempt, q, _s = _setup_essay_attempt()
    teacher = TeacherUserFactory(tenant=attempt.tenant)
    # S-6 (Wave Zero): teacher must be in scope for both the attempt
    # (queryset narrowing) AND the specific question (per-question check
    # in grade_essay, when created_by != teacher). Making them the
    # assessment creator satisfies both.
    make_teacher_in_scope_of(attempt, teacher)

    client = login_as(api_client, teacher)
    resp = client.post(
        f"/api/v1/attempts/{attempt.id}/grade_essay/",
        {"question": str(q.id), "awarded_points": "6.50", "is_correct": True},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    assert float(resp.data["score"]) == 6.5


def test_staff_can_finalize_via_endpoint(api_client):
    attempt, q, _s = _setup_essay_attempt()
    teacher = TeacherUserFactory(tenant=attempt.tenant)
    # S-6 (Wave Zero): teacher must be in scope.
    make_teacher_in_scope_of(attempt, teacher)

    client = login_as(api_client, teacher)
    client.post(
        f"/api/v1/attempts/{attempt.id}/grade_essay/",
        {"question": str(q.id), "awarded_points": "9.00", "is_correct": True},
        format="json",
    )
    resp = client.post(f"/api/v1/attempts/{attempt.id}/finalize/")
    assert resp.status_code == 200
    assert resp.data["status"] == "GRADED"


def test_student_cannot_grade_essay(api_client):
    attempt, q, student = _setup_essay_attempt()
    client = login_as(api_client, student)
    resp = client.post(
        f"/api/v1/attempts/{attempt.id}/grade_essay/",
        {"question": str(q.id), "awarded_points": "10.00", "is_correct": True},
        format="json",
    )
    assert resp.status_code == 403


def test_student_cannot_finalize(api_client):
    attempt, _q, student = _setup_essay_attempt()
    client = login_as(api_client, student)
    resp = client.post(f"/api/v1/attempts/{attempt.id}/finalize/")
    assert resp.status_code == 403
