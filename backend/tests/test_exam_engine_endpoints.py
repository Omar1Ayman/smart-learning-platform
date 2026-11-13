"""Wave 9B — end-to-end HTTP flow: start -> answer -> submit -> result.
Also verifies cross-student isolation (A cannot reach B's attempt)."""

import pytest

from apps.assessments.models import AssessmentTarget
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
)

pytestmark = pytest.mark.django_db


def _setup_assessment_with_question():
    group = GroupFactory()
    student = StudentUserFactory(tenant=group.tenant)
    EnrollmentFactory(
        tenant=group.tenant, student=student, group=group, academic_year=group.academic_year
    )
    assessment = AssessmentFactory(tenant=group.tenant, status="PUBLISHED", duration_minutes=30)
    AssessmentTarget.objects.create(
        tenant=group.tenant, assessment=assessment, target_type="GRADE", grade=group.grade
    )
    bank = QuestionBankFactory(tenant=group.tenant)
    q = QuestionFactory(
        bank=bank,
        tenant=group.tenant,
        question_type=Question.QuestionType.MCQ,
        points="2.00",
        approved=True,
        created_by=TeacherUserFactory(tenant=group.tenant),
    )
    q.options.create(tenant=group.tenant, text="A", is_correct=True, order=1)
    q.options.create(tenant=group.tenant, text="B", is_correct=False, order=2)
    from apps.assessments.models import AssessmentQuestion

    AssessmentQuestion.objects.create(
        tenant=group.tenant, assessment=assessment, question=q, order=1
    )
    return student, assessment, q


def test_student_can_complete_full_attempt_flow(api_client):
    student, assessment, q = _setup_assessment_with_question()
    client = login_as(api_client, student)

    start = client.post(f"/api/v1/assessments/{assessment.id}/start/")
    assert start.status_code == 201
    attempt_id = start.data["id"]
    assert start.data["status"] == "IN_PROGRESS"
    assert len(start.data["questions"]) == 1
    # Belt-and-braces on the wire format:
    assert "is_correct" not in start.data["questions"][0]["options"][0]

    correct = q.options.get(is_correct=True)
    save = client.post(
        f"/api/v1/attempts/{attempt_id}/answer/",
        {"question": str(q.id), "chosen_option": str(correct.id)},
        format="json",
    )
    assert save.status_code == 200

    submit = client.post(f"/api/v1/attempts/{attempt_id}/submit/")
    assert submit.status_code == 200
    assert submit.data["status"] == "GRADED"
    assert submit.data["score"] == "2.00"

    result = client.get(f"/api/v1/attempts/{attempt_id}/result/")
    assert result.status_code == 200
    # No passing_score set on this assessment -> is_passed is None (correct).
    assert result.data["is_passed"] is None


def test_in_progress_answer_does_not_expose_question_explanation(api_client):
    student, assessment, q = _setup_assessment_with_question()
    q.explanation = "Internal answer explanation"
    q.save(update_fields=["explanation"])
    client = login_as(api_client, student)

    attempt_id = client.post(f"/api/v1/assessments/{assessment.id}/start/").data["id"]
    correct = q.options.get(is_correct=True)
    save = client.post(
        f"/api/v1/attempts/{attempt_id}/answer/",
        {"question": str(q.id), "chosen_option": str(correct.id)},
        format="json",
    )

    assert save.status_code == 200
    answer = save.data["answers"][str(q.id)]
    assert answer["is_correct"] is None
    assert answer["explanation"] is None


def test_student_cannot_see_another_students_attempt(api_client):
    student_a, assessment, _q = _setup_assessment_with_question()
    student_b = StudentUserFactory(tenant=assessment.tenant)
    # B isn't enrolled -> won't be able to start, but A's attempt exists:
    client_a = login_as(api_client, student_a)
    attempt_id = client_a.post(f"/api/v1/assessments/{assessment.id}/start/").data["id"]

    client_b = login_as(api_client, student_b)
    resp = client_b.get(f"/api/v1/attempts/{attempt_id}/")
    assert resp.status_code == 404


def test_teacher_cannot_start_attempt(api_client):
    assessment = AssessmentFactory(status="PUBLISHED")
    teacher = TeacherUserFactory(tenant=assessment.tenant)
    client = login_as(api_client, teacher)
    resp = client.post(f"/api/v1/assessments/{assessment.id}/start/")
    assert resp.status_code == 403


def test_start_attempt_returns_404_for_another_tenants_assessment(api_client):
    student, assessment, _q = _setup_assessment_with_question()
    foreign = AssessmentFactory(status="PUBLISHED")  # different tenant
    client = login_as(api_client, student)
    resp = client.post(f"/api/v1/assessments/{foreign.id}/start/")
    assert resp.status_code == 404


def test_answer_after_submit_returns_400(api_client):
    student, assessment, q = _setup_assessment_with_question()
    client = login_as(api_client, student)
    start = client.post(f"/api/v1/assessments/{assessment.id}/start/")
    attempt_id = start.data["id"]
    client.post(f"/api/v1/attempts/{attempt_id}/submit/")

    correct = q.options.get(is_correct=True)
    resp = client.post(
        f"/api/v1/attempts/{attempt_id}/answer/",
        {"question": str(q.id), "chosen_option": str(correct.id)},
        format="json",
    )
    assert resp.status_code == 400


def test_result_before_submit_returns_400(api_client):
    student, assessment, _q = _setup_assessment_with_question()
    client = login_as(api_client, student)
    attempt_id = client.post(f"/api/v1/assessments/{assessment.id}/start/").data["id"]
    resp = client.get(f"/api/v1/attempts/{attempt_id}/result/")
    assert resp.status_code == 400


def test_is_passed_true_when_above_passing_score(api_client):
    """Different from the flow test above: here passing_score IS set, so
    is_passed must be computed (True/False), not None."""
    from decimal import Decimal

    student, assessment, q = _setup_assessment_with_question()
    assessment.passing_score = Decimal("50.00")  # 50%
    assessment.save(update_fields=["passing_score"])
    client = login_as(api_client, student)

    attempt_id = client.post(f"/api/v1/assessments/{assessment.id}/start/").data["id"]
    correct = q.options.get(is_correct=True)
    client.post(
        f"/api/v1/attempts/{attempt_id}/answer/",
        {"question": str(q.id), "chosen_option": str(correct.id)},
        format="json",
    )
    client.post(f"/api/v1/attempts/{attempt_id}/submit/")

    result = client.get(f"/api/v1/attempts/{attempt_id}/result/")
    assert result.status_code == 200
    assert result.data["is_passed"] is True  # 100% > 50%
