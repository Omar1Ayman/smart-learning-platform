"""Wave 13 — verify audit logging fires for the actions we added."""

import pytest

from apps.audit.models import AuditLog
from apps.content.models import Content

from .conftest import login_as
from .factories import (
    AssessmentFactory,
    QuestionBankFactory,
    TeacherUserFactory,
    TenantFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def test_login_is_audited(api_client):
    user = UserFactory()
    login_as(api_client, user)
    assert AuditLog.objects.filter(action="user.logged_in").exists()


def test_user_create_is_audited(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)
    client.post(
        "/api/v1/users/",
        {
            "email": "newteacher@example.test",
            "role": "TEACHER",
        },
        format="json",
    )
    assert AuditLog.objects.filter(action="user.created").exists()


def test_content_create_is_audited(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)
    client.post(
        "/api/v1/content/",
        {"title": "Notes", "content_type": "TEXT", "text_body": "..."},
        format="json",
    )
    assert AuditLog.objects.filter(action="content.created").exists()


def test_content_delete_is_audited(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    content = Content.objects.create(
        tenant=tenant, title="To delete", content_type="TEXT", text_body="..."
    )
    client = login_as(api_client, owner)
    client.delete(f"/api/v1/content/{content.id}/")
    assert AuditLog.objects.filter(action="content.deleted").exists()


def test_question_create_is_audited(api_client):
    bank = QuestionBankFactory()
    teacher = TeacherUserFactory(tenant=bank.tenant)
    client = login_as(api_client, teacher)
    client.post(
        "/api/v1/questions/",
        {
            "bank": str(bank.id),
            "text": "Q?",
            "question_type": "ESSAY",
        },
        format="json",
    )
    assert AuditLog.objects.filter(action="question.created").exists()


def test_assessment_create_is_audited(api_client):
    owner = UserFactory(role="OWNER")
    client = login_as(api_client, owner)
    client.post(
        "/api/v1/assessments/",
        {"title": "Audited exam", "assessment_type": "QUIZ"},
        format="json",
    )
    assert AuditLog.objects.filter(action="assessment.created").exists()