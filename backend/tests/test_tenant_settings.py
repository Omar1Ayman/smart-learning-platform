"""Wave 28 — tenant settings + policy enforcement."""

import pytest
from rest_framework.exceptions import ValidationError

from apps.assessments.models import AssessmentQuestion, AssessmentTarget
from apps.exam_engine.services import start_attempt, submit_attempt
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
    TenantFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


# ---------- Model defaults ----------

def test_new_tenant_has_default_settings():
    tenant = TenantFactory()
    s = tenant.get_settings()
    assert s["exam_policy"]["allow_retakes"] is True
    assert s["question_policy"]["require_review"] is True


def test_get_settings_merges_missing_defaults():
    """If a new key is added to defaults, existing tenants get it too."""
    tenant = TenantFactory(settings={"exam_policy": {"allow_retakes": False}})
    s = tenant.get_settings()
    assert s["exam_policy"]["allow_retakes"] is False
    # Other defaults still present:
    assert s["exam_policy"]["max_attempts_default"] == 2


# ---------- Endpoint permissions ----------

def test_owner_can_get_settings(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)
    r = client.get("/api/v1/tenant/settings/")
    assert r.status_code == 200
    assert "exam_policy" in r.data


def test_teacher_cannot_get_settings(api_client):
    tenant = TenantFactory()
    teacher = TeacherUserFactory(tenant=tenant)
    client = login_as(api_client, teacher)
    r = client.get("/api/v1/tenant/settings/")
    assert r.status_code == 403


def test_owner_can_patch_settings(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)
    r = client.patch(
        "/api/v1/tenant/settings/",
        {"exam_policy": {"allow_retakes": False}},
        format="json",
    )
    assert r.status_code == 200, r.data
    tenant.refresh_from_db()
    assert tenant.get_settings()["exam_policy"]["allow_retakes"] is False
    # Other settings preserved:
    assert tenant.get_settings()["exam_policy"]["max_attempts_default"] == 2


# ---------- Policy enforcement: allow_retakes ----------

def test_allow_retakes_false_blocks_second_attempt():
    group = GroupFactory()
    student = StudentUserFactory(tenant=group.tenant)
    EnrollmentFactory(
        tenant=group.tenant, student=student, group=group, academic_year=group.academic_year
    )
    assessment = AssessmentFactory(
        tenant=group.tenant, status="PUBLISHED", max_attempts=5
    )
    AssessmentTarget.objects.create(
        tenant=group.tenant, assessment=assessment, target_type="GRADE", grade=group.grade
    )
    bank = QuestionBankFactory(tenant=group.tenant)
    q = QuestionFactory(
        bank=bank, tenant=group.tenant, approved=True,
        created_by=TeacherUserFactory(tenant=group.tenant),
    )
    AssessmentQuestion.objects.create(
        tenant=group.tenant, assessment=assessment, question=q, order=1
    )

    # Disable retakes
    tenant = group.tenant
    s = tenant.get_settings()
    s["exam_policy"]["allow_retakes"] = False
    tenant.settings = s
    tenant.save()

    # First attempt
    a1 = start_attempt(assessment, student, tenant)
    submit_attempt(a1)

    # Second attempt should be refused
    with pytest.raises(ValidationError):
        start_attempt(assessment, student, tenant)


# ---------- Policy enforcement: question review ----------

def test_require_review_off_auto_approves_teacher_question(api_client):
    tenant = TenantFactory()
    s = tenant.get_settings()
    s["question_policy"]["require_review"] = False
    tenant.settings = s
    tenant.save()

    teacher = TeacherUserFactory(tenant=tenant)
    bank = QuestionBankFactory(tenant=tenant)

    client = login_as(api_client, teacher)
    r = client.post(
        "/api/v1/questions/",
        {
            "bank": str(bank.id),
            "text": "سؤال اختبار",
            "question_type": "ESSAY",
        },
        format="json",
    )
    assert r.status_code == 201, r.data
    q = Question.objects.get(id=r.data["id"])
    assert q.review_status == Question.ReviewStatus.APPROVED


def test_require_review_on_keeps_teacher_question_pending(api_client):
    tenant = TenantFactory()
    # Default: require_review = True
    teacher = TeacherUserFactory(tenant=tenant)
    bank = QuestionBankFactory(tenant=tenant)

    client = login_as(api_client, teacher)
    r = client.post(
        "/api/v1/questions/",
        {"bank": str(bank.id), "text": "سؤال", "question_type": "ESSAY"},
        format="json",
    )
    assert r.status_code == 201
    q = Question.objects.get(id=r.data["id"])
    assert q.review_status == Question.ReviewStatus.PENDING


def test_owner_question_auto_approved_when_policy_allows(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    bank = QuestionBankFactory(tenant=tenant)

    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/questions/",
        {"bank": str(bank.id), "text": "سؤال", "question_type": "ESSAY"},
        format="json",
    )
    assert r.status_code == 201
    q = Question.objects.get(id=r.data["id"])
    assert q.review_status == Question.ReviewStatus.APPROVED