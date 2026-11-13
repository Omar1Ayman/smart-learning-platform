"""Wave 25 — anti-cheat event recording + suspicion scoring."""

import pytest

from apps.assessments.models import AssessmentQuestion, AssessmentTarget
from apps.exam_engine.models import AttemptEvent
from apps.exam_engine.services import (
    compute_suspicion,
    record_attempt_event,
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


def _setup_active_attempt():
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
        approved=True,
        created_by=TeacherUserFactory(tenant=group.tenant),
    )
    AssessmentQuestion.objects.create(
        tenant=group.tenant, assessment=assessment, question=q, order=1
    )
    attempt = start_attempt(assessment, student, group.tenant)
    return attempt, student, group


# ---------- Event recording ----------


def test_can_record_event_on_active_attempt():
    attempt, _s, _g = _setup_active_attempt()
    event = record_attempt_event(attempt, "TAB_HIDDEN", {"duration_ms": 5000})
    assert event is not None
    assert AttemptEvent.objects.filter(attempt=attempt).count() == 1


def test_cannot_record_event_on_submitted_attempt():
    attempt, _s, _g = _setup_active_attempt()
    # Save an answer then submit so the attempt is SUBMITTED
    save_answer(attempt, attempt.question_order[0], text_answer="...")
    submit_attempt(attempt)
    event = record_attempt_event(attempt, "TAB_HIDDEN")
    assert event is None
    assert AttemptEvent.objects.filter(attempt=attempt).count() == 0


def test_invalid_event_type_rejected():
    attempt, _s, _g = _setup_active_attempt()
    from rest_framework.exceptions import ValidationError

    with pytest.raises(ValidationError):
        record_attempt_event(attempt, "SOMETHING_BOGUS")


# ---------- Endpoint ----------


def test_student_can_post_event(api_client):
    attempt, student, _g = _setup_active_attempt()
    client = login_as(api_client, student)
    r = client.post(
        f"/api/v1/attempts/{attempt.id}/event/",
        {"event_type": "TAB_HIDDEN"},
        format="json",
    )
    assert r.status_code == 201


def test_student_event_endpoint_is_rate_limited(api_client):
    attempt, student, _g = _setup_active_attempt()
    client = login_as(api_client, student)

    responses = [
        client.post(
            f"/api/v1/attempts/{attempt.id}/event/",
            {"event_type": "TAB_HIDDEN"},
            format="json",
        )
        for _ in range(31)
    ]

    assert all(response.status_code == 201 for response in responses[:30])
    assert responses[30].status_code == 429


def test_other_student_cannot_post_event(api_client):
    attempt, _s, _g = _setup_active_attempt()
    stranger = StudentUserFactory(tenant=attempt.tenant)
    client = login_as(api_client, stranger)
    r = client.post(
        f"/api/v1/attempts/{attempt.id}/event/",
        {"event_type": "TAB_HIDDEN"},
        format="json",
    )
    # 404 because stranger's queryset doesn't include this attempt
    assert r.status_code in (403, 404)


def test_teacher_cannot_post_event(api_client):
    attempt, _s, _g = _setup_active_attempt()
    teacher = TeacherUserFactory(tenant=attempt.tenant)
    client = login_as(api_client, teacher)
    r = client.post(
        f"/api/v1/attempts/{attempt.id}/event/",
        {"event_type": "TAB_HIDDEN"},
        format="json",
    )
    assert r.status_code in (403, 404)


# ---------- Suspicion scoring ----------


def test_clean_attempt_has_zero_suspicion():
    attempt, _s, _g = _setup_active_attempt()
    result = compute_suspicion(attempt)
    assert result["score"] == 0
    assert result["level"] == "clean"


def test_single_tab_hidden_is_clean():
    attempt, _s, _g = _setup_active_attempt()
    record_attempt_event(attempt, "TAB_HIDDEN")
    result = compute_suspicion(attempt)
    assert result["score"] == 3  # 1 event × 3 weight
    assert result["level"] == "clean"  # under 20 threshold


def test_many_tab_hidden_escalates():
    attempt, _s, _g = _setup_active_attempt()
    for _ in range(8):
        record_attempt_event(attempt, "TAB_HIDDEN")
    # 8 × 3 = 24, but capped at 30 per type
    result = compute_suspicion(attempt)
    assert result["score"] == 24
    assert result["level"] == "minor"


def test_paste_events_escalate_fast():
    attempt, _s, _g = _setup_active_attempt()
    for _ in range(3):
        record_attempt_event(attempt, "PASTE_ATTEMPT")
    # 3 × 8 = 24
    result = compute_suspicion(attempt)
    assert result["score"] == 24
    assert result["level"] == "minor"


def test_score_capped_per_type():
    attempt, _s, _g = _setup_active_attempt()
    # RIGHT_CLICK weight=2, cap=10
    for _ in range(20):
        record_attempt_event(attempt, "RIGHT_CLICK")
    result = compute_suspicion(attempt)
    assert result["score"] == 10  # capped at 10 despite 20 events


def test_score_capped_at_ceiling():
    attempt, _s, _g = _setup_active_attempt()
    # Mix of events whose weighted sum would exceed 100
    for _ in range(20):
        record_attempt_event(attempt, "TAB_HIDDEN")  # capped at 30
        record_attempt_event(attempt, "PASTE_ATTEMPT")  # capped at 40
        record_attempt_event(attempt, "COPY_ATTEMPT")  # capped at 40
    result = compute_suspicion(attempt)
    assert result["score"] == 100  # ceiling


def test_breakdown_reports_per_type():
    attempt, _s, _g = _setup_active_attempt()
    record_attempt_event(attempt, "TAB_HIDDEN")
    record_attempt_event(attempt, "PASTE_ATTEMPT")

    result = compute_suspicion(attempt)
    types = {b["event_type"] for b in result["breakdown"]}
    assert "TAB_HIDDEN" in types
    assert "PASTE_ATTEMPT" in types


# ---------- Grading payload includes events ----------


def test_grading_payload_includes_events(api_client):
    attempt, _s, group = _setup_active_attempt()
    record_attempt_event(attempt, "TAB_HIDDEN")
    save_answer(attempt, attempt.question_order[0], text_answer="...")
    submit_attempt(attempt)

    teacher = TeacherUserFactory(tenant=group.tenant)
    # S-6: teacher must be in scope. Make them the assessment creator.
    make_teacher_in_scope_of(attempt, teacher)

    client = login_as(api_client, teacher)
    r = client.get(f"/api/v1/attempts/{attempt.id}/grading/")
    assert r.status_code == 200
    assert "events" in r.data
    assert "suspicion" in r.data
    assert r.data["suspicion"]["score"] >= 3
    assert len(r.data["events"]) == 1
    assert r.data["events"][0]["event_type"] == "TAB_HIDDEN"
    assert r.data["events"][0]["event_label"]  # Arabic label present
