"""Wave C3 — class analytics dashboard regression tests."""

from decimal import Decimal

import pytest

from apps.assessments.models import AssessmentQuestion, AssessmentTarget
from apps.exam_engine.models import AttemptAnswer, ExamAttempt
from apps.questions.models import Question

from .conftest import enable_pro_features, login_as
from .factories import (
    AssessmentFactory,
    EnrollmentFactory,
    GradeFactory,
    GroupFactory,
    QuestionBankFactory,
    QuestionFactory,
    StudentUserFactory,
    TenantFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Setup — 3 students, 3 MCQ questions, 3 graded attempts
# ---------------------------------------------------------------------------
# | Student | Q1 | Q2 | Q3 | Score | %    | Pass (threshold 50%) |
# |---------|----|----|----|-------|------|----------------------|
# | A       | ✓  | ✓  | ✓  | 30    | 100  | ✓                    |
# | B       | ✓  | ✗  | ✓  | 20    | 66.7 | ✓                    |
# | C       | ✗  | ✗  | ✗  | 0     | 0    | ✗                    |
#
# Per-question correct% (graded only):
#   Q1 = 2/3 = 66.7%    Q2 = 1/3 = 33.3%    Q3 = 2/3 = 66.7%
# Hardest: Q2 | Easiest: Q1 & Q3 (tie)
# Pass rate: 2/3 = 66.7%


def _setup_analytics_data():
    tenant = TenantFactory()
    enable_pro_features(tenant)
    owner = UserFactory(tenant=tenant, role="OWNER")
    grade = GradeFactory(tenant=tenant)
    group = GroupFactory(tenant=tenant, grade=grade)
    bank = QuestionBankFactory(tenant=tenant)

    assessment = AssessmentFactory(
        tenant=tenant,
        status="PUBLISHED",
        passing_score=Decimal("50.00"),
        created_by=owner,
    )
    AssessmentTarget.objects.create(
        tenant=tenant, assessment=assessment, target_type="GRADE", grade=grade
    )

    questions = []
    for i in range(1, 4):
        q = QuestionFactory(
            bank=bank,
            tenant=tenant,
            question_type=Question.QuestionType.MCQ,
            points="10.00",
            approved=True,
            created_by=owner,
        )
        q.options.create(tenant=tenant, text="A", is_correct=True, order=1)
        q.options.create(tenant=tenant, text="B", is_correct=False, order=2)
        AssessmentQuestion.objects.create(tenant=tenant, assessment=assessment, question=q, order=i)
        questions.append(q)

    patterns = [
        (True, True, True),  # A → 100%
        (True, False, True),  # B → 66.7%
        (False, False, False),  # C → 0%
    ]

    attempts = []
    for pattern in patterns:
        student = StudentUserFactory(tenant=tenant)
        EnrollmentFactory(
            tenant=tenant,
            student=student,
            group=group,
            academic_year=group.academic_year,
        )
        score = Decimal("10.00") * sum(1 for p in pattern if p)
        pct = float(score) / 30.0 * 100
        attempt = ExamAttempt.objects.create(
            tenant=tenant,
            assessment=assessment,
            student=student,
            attempt_number=1,
            status=ExamAttempt.Status.GRADED,
            question_order=[str(q.id) for q in questions],
            max_score=Decimal("30.00"),
            score=score,
            is_passed=pct >= 50.0,
        )
        for q, is_correct in zip(questions, pattern):
            correct_opt = q.options.get(is_correct=True)
            wrong_opt = q.options.get(is_correct=False)
            AttemptAnswer.objects.create(
                tenant=tenant,
                attempt=attempt,
                question=q,
                chosen_option=correct_opt if is_correct else wrong_opt,
                is_correct=is_correct,
                awarded_points=Decimal("10.00") if is_correct else Decimal("0.00"),
            )
        attempts.append(attempt)

    return tenant, owner, assessment, questions


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------


def test_owner_can_fetch_analytics(api_client):
    tenant, owner, assessment, _qs = _setup_analytics_data()
    client = login_as(api_client, owner)

    r = client.get(f"/api/v1/assessments/{assessment.id}/analytics/")
    assert r.status_code == 200, r.data


def test_student_cannot_fetch_analytics(api_client):
    tenant, _owner, assessment, _qs = _setup_analytics_data()
    student = StudentUserFactory(tenant=tenant)
    client = login_as(api_client, student)

    r = client.get(f"/api/v1/assessments/{assessment.id}/analytics/")
    assert r.status_code == 403


def test_cross_tenant_analytics_404(api_client):
    tenant_a = TenantFactory()
    owner_a = UserFactory(tenant=tenant_a, role="OWNER")
    tenant_b, _owner_b, assessment_b, _ = _setup_analytics_data()

    client = login_as(api_client, owner_a)
    r = client.get(f"/api/v1/assessments/{assessment_b.id}/analytics/")
    assert r.status_code in (403, 404)


# ---------------------------------------------------------------------------
# Aggregations
# ---------------------------------------------------------------------------


def test_summary_metrics(api_client):
    tenant, owner, assessment, _qs = _setup_analytics_data()
    client = login_as(api_client, owner)

    r = client.get(f"/api/v1/assessments/{assessment.id}/analytics/")
    s = r.data["summary"]
    assert s["total_attempts"] == 3
    assert s["graded_attempts"] == 3
    assert s["pending_attempts"] == 0
    assert s["passed"] == 2
    assert s["failed"] == 1
    assert s["pass_rate"] == pytest.approx(66.7, abs=0.1)
    # Avg % across graded: (100 + 66.7 + 0) / 3 = 55.6
    assert s["avg_percentage"] == pytest.approx(55.6, abs=0.1)
    assert s["highest_score"] == "30.00"
    assert s["lowest_score"] == "0.00"
    assert s["targeted_students"] >= 3


def test_distribution_buckets(api_client):
    tenant, owner, assessment, _qs = _setup_analytics_data()
    client = login_as(api_client, owner)

    r = client.get(f"/api/v1/assessments/{assessment.id}/analytics/")
    dist = {d["bucket"]: d["count"] for d in r.data["distribution"]}

    # Student C (0%) → bucket "0-10"
    # Student B (66.7%) → bucket "60-70"
    # Student A (100%) → bucket "90-100"
    assert dist["0-10"] == 1
    assert dist["60-70"] == 1
    assert dist["90-100"] == 1
    # All others empty
    assert sum(dist.values()) == 3


def test_question_stats(api_client):
    tenant, owner, assessment, questions = _setup_analytics_data()
    client = login_as(api_client, owner)

    r = client.get(f"/api/v1/assessments/{assessment.id}/analytics/")
    all_q = {q["question_id"]: q for q in r.data["all_questions"]}

    # Q1: 2/3 correct (A and B answered true, C false)
    q1 = all_q[str(questions[0].id)]
    assert q1["total_answers"] == 3
    assert q1["correct_count"] == 2
    assert q1["wrong_count"] == 1
    assert q1["correct_percentage"] == pytest.approx(66.7, abs=0.1)

    # Q2: 1/3 correct (only A)
    q2 = all_q[str(questions[1].id)]
    assert q2["correct_count"] == 1
    assert q2["correct_percentage"] == pytest.approx(33.3, abs=0.1)

    # Q3: 2/3 correct
    q3 = all_q[str(questions[2].id)]
    assert q3["correct_count"] == 2


def test_hardest_easiest_sorting(api_client):
    tenant, owner, assessment, questions = _setup_analytics_data()
    client = login_as(api_client, owner)

    r = client.get(f"/api/v1/assessments/{assessment.id}/analytics/")

    # Hardest first = Q2 (33.3%)
    hardest = r.data["hardest_questions"]
    assert hardest[0]["question_id"] == str(questions[1].id)

    # Easiest first = Q1 or Q3 (both 66.7%, tie order depends on sort stability)
    easiest = r.data["easiest_questions"]
    assert easiest[0]["correct_percentage"] == pytest.approx(66.7, abs=0.1)


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_analytics_with_no_attempts_returns_valid_empty(api_client):
    tenant = TenantFactory()
    enable_pro_features(tenant)
    owner = UserFactory(tenant=tenant, role="OWNER")
    grade = GradeFactory(tenant=tenant)
    bank = QuestionBankFactory(tenant=tenant)

    assessment = AssessmentFactory(tenant=tenant, status="PUBLISHED", created_by=owner)
    AssessmentTarget.objects.create(
        tenant=tenant, assessment=assessment, target_type="GRADE", grade=grade
    )
    q = QuestionFactory(
        bank=bank,
        tenant=tenant,
        question_type=Question.QuestionType.MCQ,
        points="5.00",
        approved=True,
        created_by=owner,
    )
    q.options.create(tenant=tenant, text="A", is_correct=True, order=1)
    q.options.create(tenant=tenant, text="B", is_correct=False, order=2)
    AssessmentQuestion.objects.create(tenant=tenant, assessment=assessment, question=q, order=1)

    client = login_as(api_client, owner)
    r = client.get(f"/api/v1/assessments/{assessment.id}/analytics/")
    assert r.status_code == 200
    assert r.data["has_data"] is False
    assert r.data["summary"]["total_attempts"] == 0
    assert r.data["summary"]["pass_rate"] is None
    assert all(d["count"] == 0 for d in r.data["distribution"])
    assert r.data["hardest_questions"] == []
    assert r.data["easiest_questions"] == []


def test_in_progress_attempts_are_excluded(api_client):
    """Only SUBMITTED + GRADED count — a running attempt shouldn't inflate
    the numbers."""
    tenant, owner, assessment, _qs = _setup_analytics_data()

    # Add a 4th student, still IN_PROGRESS.
    student = StudentUserFactory(tenant=tenant)
    grade_id = AssessmentTarget.objects.filter(assessment=assessment).first().grade_id
    from apps.academics.models import Group as G

    group = G.objects.for_tenant(tenant).filter(grade_id=grade_id).first()
    EnrollmentFactory(
        tenant=tenant, student=student, group=group, academic_year=group.academic_year
    )
    ExamAttempt.objects.create(
        tenant=tenant,
        assessment=assessment,
        student=student,
        attempt_number=1,
        status=ExamAttempt.Status.IN_PROGRESS,
        question_order=[],
        max_score=Decimal("30.00"),
    )

    client = login_as(api_client, owner)
    r = client.get(f"/api/v1/assessments/{assessment.id}/analytics/")
    # Still 3, not 4.
    assert r.data["summary"]["total_attempts"] == 3


def test_attempt_result_includes_student_name(api_client):
    """Wave C3.1 — AttemptResultSerializer must include student_name so
    the grading page and results table can show a human-readable name
    instead of the raw email."""
    tenant, owner, assessment, _qs = _setup_analytics_data()
    attempt = assessment.attempts.first()
    attempt.student.first_name = "أحمد"
    attempt.student.last_name = "حسن"
    attempt.student.save(update_fields=["first_name", "last_name"])

    client = login_as(api_client, owner)
    r = client.get(f"/api/v1/attempts/{attempt.id}/result/")
    assert r.status_code == 200
    assert r.data["student_name"] == "أحمد حسن"
    assert r.data["student_email"] == attempt.student.email


def test_attempt_result_student_name_falls_back_to_email(api_client):
    """When both name parts are blank, student_name should fall back to
    the email — never an empty string."""
    tenant, owner, assessment, _qs = _setup_analytics_data()
    attempt = assessment.attempts.first()
    attempt.student.first_name = ""
    attempt.student.last_name = ""
    attempt.student.save(update_fields=["first_name", "last_name"])

    client = login_as(api_client, owner)
    r = client.get(f"/api/v1/attempts/{attempt.id}/result/")
    assert r.status_code == 200
    assert r.data["student_name"] == attempt.student.email
