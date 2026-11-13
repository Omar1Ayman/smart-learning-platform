"""Wave 29 — remaining tenant policies wired end-to-end."""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.assessments.models import AssessmentQuestion, AssessmentTarget
from apps.content.models import Content
from apps.exam_engine.models import ExamAttempt
from apps.exam_engine.services import save_answer, start_attempt, submit_attempt

from .conftest import login_as
from .factories import (
    AssessmentFactory,
    EnrollmentFactory,
    GroupFactory,
    QuestionBankFactory,
    QuestionFactory,
    StudentUserFactory,
    TeacherUserFactory,
    TenantFactory,
    UserFactory,
)
from .file_fixtures import make_pdf

pytestmark = pytest.mark.django_db

# ============================================================================
# teachers_can_edit_others_content
# ============================================================================


def test_teacher_cannot_edit_others_content_by_default(api_client):
    tenant = TenantFactory()
    teacher_a = TeacherUserFactory(tenant=tenant)
    teacher_b = TeacherUserFactory(tenant=tenant)
    content = Content.objects.create(
        tenant=tenant, title="A's notes", content_type="TEXT", text_body="x",
        created_by=teacher_a,
    )

    client = login_as(api_client, teacher_b)
    r = client.patch(f"/api/v1/content/{content.id}/", {"title": "Hijack"}, format="json")
    assert r.status_code == 403


def test_teacher_can_edit_others_content_when_policy_allows(api_client):
    tenant = TenantFactory()
    s = tenant.get_settings()
    s["content_policy"]["teachers_can_edit_others_content"] = True
    tenant.settings = s
    tenant.save()

    teacher_a = TeacherUserFactory(tenant=tenant)
    teacher_b = TeacherUserFactory(tenant=tenant)
    content = Content.objects.create(
        tenant=tenant, title="A's notes", content_type="TEXT", text_body="x",
        created_by=teacher_a,
    )

    client = login_as(api_client, teacher_b)
    r = client.patch(f"/api/v1/content/{content.id}/", {"title": "Updated"}, format="json")
    assert r.status_code == 200, r.data
    content.refresh_from_db()
    assert content.title == "Updated"


# ============================================================================
# max_file_size_mb
# ============================================================================


def test_tenant_max_file_size_blocks_oversized_upload(api_client):
    """Tenant cap of 1MB must reject a 2MB PDF even though the PDF type
    normally allows 20MB."""
    tenant = TenantFactory()
    s = tenant.get_settings()
    s["content_policy"]["max_file_size_mb"] = 1
    tenant.settings = s
    tenant.save()

    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    # Real PDF header + 2MB padding — sniffs as PDF, exceeds 1MB.
    payload = b"%PDF-1.4\n" + b"\x00" * (2 * 1024 * 1024)
    f = SimpleUploadedFile("big.pdf", payload, content_type="application/pdf")

    r = client.post(
        "/api/v1/content/",
        {"title": "Big", "content_type": "PDF", "file": f},
        format="multipart",
    )
    assert r.status_code == 400
    detail = str(r.data)
    assert "ميجابايت" in detail or "حجم" in detail


def test_tenant_max_file_size_allows_small_upload(api_client):
    tenant = TenantFactory()
    s = tenant.get_settings()
    s["content_policy"]["max_file_size_mb"] = 5
    tenant.settings = s
    tenant.save()

    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    r = client.post(
        "/api/v1/content/",
        {"title": "Small", "content_type": "PDF", "file": make_pdf()},
        format="multipart",
    )
    assert r.status_code == 201, r.data


# ============================================================================
# show_correct_answers_after_submit
# ============================================================================


def _setup_submitted_attempt(tenant_policy_update=None):
    group = GroupFactory()
    tenant = group.tenant
    if tenant_policy_update:
        s = tenant.get_settings()
        s["exam_policy"].update(tenant_policy_update)
        tenant.settings = s
        tenant.save()

    student = StudentUserFactory(tenant=tenant)
    EnrollmentFactory(
        tenant=tenant, student=student, group=group, academic_year=group.academic_year
    )
    assessment = AssessmentFactory(tenant=tenant, status="PUBLISHED")
    AssessmentTarget.objects.create(
        tenant=tenant, assessment=assessment, target_type="GRADE", grade=group.grade
    )
    bank = QuestionBankFactory(tenant=tenant)
    q = QuestionFactory(
        bank=bank, tenant=tenant, question_type="MCQ", approved=True,
        created_by=TeacherUserFactory(tenant=tenant),
    )
    correct = q.options.create(tenant=tenant, text="A", is_correct=True, order=1)
    q.options.create(tenant=tenant, text="B", is_correct=False, order=2)
    AssessmentQuestion.objects.create(
        tenant=tenant, assessment=assessment, question=q, order=1
    )

    attempt = start_attempt(assessment, student, tenant)
    save_answer(attempt, q.id, chosen_option_id=correct.id)
    submit_attempt(attempt)
    return attempt, student


def test_result_hides_correctness_when_policy_off(api_client):
    attempt, student = _setup_submitted_attempt(
        {"show_correct_answers_after_submit": False}
    )

    client = login_as(api_client, student)
    r = client.get(f"/api/v1/attempts/{attempt.id}/result/")
    assert r.status_code == 200

    # Score is visible (that's the whole point of a result page),
    # but per-answer correctness is hidden.
    for ans in r.data["answers"]:
        assert ans["is_correct"] is None
    assert r.data["tenant_policies"]["show_correct_answers_after_submit"] is False


def test_result_shows_correctness_when_policy_on(api_client):
    attempt, student = _setup_submitted_attempt(
        {"show_correct_answers_after_submit": True}
    )

    client = login_as(api_client, student)
    r = client.get(f"/api/v1/attempts/{attempt.id}/result/")
    assert r.status_code == 200

    # At least one answer has a non-None correctness value.
    assert any(a["is_correct"] is not None for a in r.data["answers"])
    assert r.data["tenant_policies"]["show_correct_answers_after_submit"] is True


# ============================================================================
# auto_submit_after_tab_switches — server-side
# ============================================================================


def test_auto_submit_triggers_after_threshold(api_client):
    group = GroupFactory()
    tenant = group.tenant
    s = tenant.get_settings()
    s["exam_policy"]["auto_submit_after_tab_switches"] = 2
    tenant.settings = s
    tenant.save()

    student = StudentUserFactory(tenant=tenant)
    EnrollmentFactory(
        tenant=tenant, student=student, group=group, academic_year=group.academic_year
    )
    assessment = AssessmentFactory(tenant=tenant, status="PUBLISHED")
    AssessmentTarget.objects.create(
        tenant=tenant, assessment=assessment, target_type="GRADE", grade=group.grade
    )
    bank = QuestionBankFactory(tenant=tenant)
    q = QuestionFactory(
        bank=bank, tenant=tenant, approved=True,
        created_by=TeacherUserFactory(tenant=tenant),
    )
    AssessmentQuestion.objects.create(
        tenant=tenant, assessment=assessment, question=q, order=1
    )
    attempt = start_attempt(assessment, student, tenant)

    client = login_as(api_client, student)
    # First event — no auto-submit yet
    r1 = client.post(
        f"/api/v1/attempts/{attempt.id}/event/",
        {"event_type": "TAB_HIDDEN"}, format="json",
    )
    assert r1.status_code == 201
    attempt.refresh_from_db()
    assert attempt.status == ExamAttempt.Status.IN_PROGRESS

    # Second event — threshold hit → auto-submit
    r2 = client.post(
        f"/api/v1/attempts/{attempt.id}/event/",
        {"event_type": "TAB_HIDDEN"}, format="json",
    )
    assert r2.status_code == 200
    assert r2.data.get("detail") == "auto_submitted"

    attempt.refresh_from_db()
    assert attempt.status in (ExamAttempt.Status.SUBMITTED, ExamAttempt.Status.GRADED)