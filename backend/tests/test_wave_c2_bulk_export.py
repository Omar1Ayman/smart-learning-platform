"""Wave C2 — bulk grading + Excel export regression tests."""

import io
from decimal import Decimal

import pytest

from apps.assessments.models import AssessmentQuestion, AssessmentTarget
from apps.exam_engine.models import AttemptAnswer, ExamAttempt
from apps.questions.models import Question

from .conftest import enable_pro_features, login_as, make_teacher_in_scope_of
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _setup_two_submitted_attempts():
    """Two students, two SUBMITTED attempts, each with one pending essay."""
    group = GroupFactory()
    enable_pro_features(group.tenant)
    bank = QuestionBankFactory(tenant=group.tenant)
    q = QuestionFactory(
        bank=bank,
        tenant=group.tenant,
        question_type=Question.QuestionType.ESSAY,
        points="10.00",
        approved=True,
        created_by=TeacherUserFactory(tenant=group.tenant),
    )
    assessment = AssessmentFactory(tenant=group.tenant, status="PUBLISHED")
    AssessmentQuestion.objects.create(
        tenant=group.tenant, assessment=assessment, question=q, order=1
    )
    AssessmentTarget.objects.create(
        tenant=group.tenant, assessment=assessment, target_type="GRADE", grade=group.grade
    )

    attempts = []
    for i in range(2):
        student = StudentUserFactory(tenant=group.tenant)
        EnrollmentFactory(
            tenant=group.tenant,
            student=student,
            group=group,
            academic_year=group.academic_year,
        )
        attempt = ExamAttempt.objects.create(
            tenant=group.tenant,
            assessment=assessment,
            student=student,
            attempt_number=1,
            status=ExamAttempt.Status.SUBMITTED,
            question_order=[str(q.id)],
            max_score=Decimal("10.00"),
            score=Decimal("0"),
        )
        AttemptAnswer.objects.create(
            tenant=group.tenant,
            attempt=attempt,
            question=q,
            text_answer=f"Essay answer {i}",
            awarded_points=None,
        )
        attempts.append(attempt)

    return group, assessment, q, attempts


# ---------------------------------------------------------------------------
# Bulk grading
# ---------------------------------------------------------------------------


def test_bulk_grade_two_attempts(api_client):
    group, assessment, q, attempts = _setup_two_submitted_attempts()
    teacher = TeacherUserFactory(tenant=group.tenant)
    for a in attempts:
        make_teacher_in_scope_of(a, teacher)

    client = login_as(api_client, teacher)
    r = client.post(
        "/api/v1/attempts/bulk_grade/",
        {
            "attempts": [
                {
                    "attempt_id": str(a.id),
                    "grades": [
                        {"question_id": str(q.id), "awarded_points": "8.00", "is_correct": True}
                    ],
                    "finalize": True,
                }
                for a in attempts
            ]
        },
        format="json",
    )
    assert r.status_code == 200, r.data
    assert len(r.data["results"]) == 2
    for res in r.data["results"]:
        assert "error" not in res
        assert res["status"] == "GRADED"
        assert res["score"] == "8.00"


def test_bulk_grade_partial_failure(api_client):
    """One valid, one invalid attempt_id — the valid one still saves."""
    group, assessment, q, attempts = _setup_two_submitted_attempts()
    teacher = TeacherUserFactory(tenant=group.tenant)
    make_teacher_in_scope_of(attempts[0], teacher)

    client = login_as(api_client, teacher)
    r = client.post(
        "/api/v1/attempts/bulk_grade/",
        {
            "attempts": [
                {
                    "attempt_id": str(attempts[0].id),
                    "grades": [
                        {"question_id": str(q.id), "awarded_points": "7.00", "is_correct": True}
                    ],
                    "finalize": True,
                },
                {
                    "attempt_id": "00000000-0000-0000-0000-000000000000",
                    "grades": [],
                    "finalize": True,
                },
            ]
        },
        format="json",
    )
    assert r.status_code == 200
    results = {str(res.get("attempt_id")): res for res in r.data["results"]}

    # Valid one succeeded.
    assert "error" not in results[str(attempts[0].id)]
    # Invalid one reported error, didn't block the other.
    assert "error" in results["00000000-0000-0000-0000-000000000000"]


def test_bulk_grade_without_finalize_keeps_submitted(api_client):
    """If finalize=False and there are still pending essays, status stays
    SUBMITTED."""
    group, assessment, q, attempts = _setup_two_submitted_attempts()
    teacher = TeacherUserFactory(tenant=group.tenant)
    make_teacher_in_scope_of(attempts[0], teacher)

    client = login_as(api_client, teacher)
    r = client.post(
        "/api/v1/attempts/bulk_grade/",
        {
            "attempts": [
                {
                    "attempt_id": str(attempts[0].id),
                    "grades": [
                        {"question_id": str(q.id), "awarded_points": "9.00", "is_correct": True}
                    ],
                    "finalize": False,
                }
            ]
        },
        format="json",
    )
    assert r.status_code == 200
    attempts[0].refresh_from_db()
    assert attempts[0].status == ExamAttempt.Status.SUBMITTED
    assert attempts[0].score == Decimal("9.00")


def test_bulk_grade_rejects_empty_attempts_list(api_client):
    group, _assessment, _q, attempts = _setup_two_submitted_attempts()
    teacher = TeacherUserFactory(tenant=group.tenant)
    make_teacher_in_scope_of(attempts[0], teacher)

    client = login_as(api_client, teacher)
    r = client.post("/api/v1/attempts/bulk_grade/", {"attempts": []}, format="json")
    assert r.status_code == 400


def test_student_cannot_bulk_grade(api_client):
    group, _assessment, q, attempts = _setup_two_submitted_attempts()
    student = StudentUserFactory(tenant=group.tenant)

    client = login_as(api_client, student)
    r = client.post(
        "/api/v1/attempts/bulk_grade/",
        {
            "attempts": [
                {
                    "attempt_id": str(attempts[0].id),
                    "grades": [
                        {"question_id": str(q.id), "awarded_points": "10.00", "is_correct": True}
                    ],
                    "finalize": True,
                }
            ]
        },
        format="json",
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Excel export
# ---------------------------------------------------------------------------


def test_owner_can_export_assessment_results(api_client):
    group, assessment, _q, attempts = _setup_two_submitted_attempts()
    owner = UserFactory(tenant=group.tenant, role="OWNER")

    client = login_as(api_client, owner)
    r = client.get(f"/api/v1/assessments/{assessment.id}/export_results/")
    assert r.status_code == 200
    assert r["Content-Type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    # Every xlsx starts with PK\x03\x04 (zip signature).
    assert r.content[:4] == b"PK\x03\x04"

    # Verify openpyxl can read it back.
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(r.content))
    ws = wb.active
    # Header row + 2 attempts.
    assert ws.max_row == 3
    assert ws.max_column == 11
    assert ws.cell(row=1, column=1).value == "الطالب"


def test_export_empty_assessment_is_still_valid(api_client):
    group = GroupFactory()
    assessment = AssessmentFactory(tenant=group.tenant, status="PUBLISHED")
    owner = UserFactory(tenant=group.tenant, role="OWNER")

    client = login_as(api_client, owner)
    r = client.get(f"/api/v1/assessments/{assessment.id}/export_results/")
    assert r.status_code == 200
    assert r.content[:4] == b"PK\x03\x04"

    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(r.content))
    ws = wb.active
    # Only the header row.
    assert ws.max_row == 1


def test_student_cannot_export_results(api_client):
    """Wave C2 security — a STUDENT must never be able to export results.

    Two scenarios matter:
      1. Non-targeted student (queryset returns nothing → 404)
      2. Targeted student (queryset includes the assessment → permission
         check must still block with 403)

    Without IsStaffMember on the action, scenario #2 would return 200 and
    leak the full results table. This test exercises BOTH cases.
    """
    group, assessment, _q, _attempts = _setup_two_submitted_attempts()

    # Scenario 1: fresh, non-enrolled student (queryset empty → 404).
    outsider = StudentUserFactory(tenant=group.tenant)
    client = login_as(api_client, outsider)
    r1 = client.get(f"/api/v1/assessments/{assessment.id}/export_results/")
    assert r1.status_code in (403, 404)

    # Scenario 2: enrolled student who IS targeted — must still get 403,
    # not 200. This is the real security guarantee.
    targeted = StudentUserFactory(tenant=group.tenant)
    EnrollmentFactory(
        tenant=group.tenant,
        student=targeted,
        group=group,
        academic_year=group.academic_year,
    )
    client2 = login_as(api_client, targeted)
    r2 = client2.get(f"/api/v1/assessments/{assessment.id}/export_results/")
    assert r2.status_code == 403, r2.data
    
def test_bulk_grade_no_attempt_id_returns_error(api_client):
    """F-16 regression: an entry without attempt_id must return a
    per-item error, not 500."""
    group, _assessment, _q, attempts = _setup_two_submitted_attempts()
    teacher = TeacherUserFactory(tenant=group.tenant)
    make_teacher_in_scope_of(attempts[0], teacher)

    client = login_as(api_client, teacher)
    r = client.post(
        "/api/v1/attempts/bulk_grade/",
        {"attempts": [{"grades": [], "finalize": False}]},
        format="json",
    )
    assert r.status_code == 200
    assert r.data["results"][0]["error"] == "attempt_id مطلوب."