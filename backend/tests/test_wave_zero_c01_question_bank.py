"""Wave Zero — C-1: QuestionBank creation used to 500.

Before fix: QuestionBankViewSet.perform_create accessed
`serializer.instance.question_type`, an attribute that exists on Question,
not QuestionBank. Every create returned HTTP 500.

After fix: perform_create logs `question_bank.created` with `name`
metadata, and create returns 201.
"""
import pytest
from apps.audit.models import AuditLog
from apps.questions.models import QuestionBank
from .conftest import login_as
from .factories import TenantFactory, UserFactory

pytestmark = pytest.mark.django_db


def test_owner_can_create_question_bank(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    resp = client.post(
        "/api/v1/question-banks/",
        {"name": "Bank A"},
        format="json",
    )

    assert resp.status_code == 201, resp.data
    assert QuestionBank.objects.filter(name="Bank A", tenant=tenant).exists()


def test_question_bank_create_writes_correct_audit_action(api_client):
    """The audit action must be `question_bank.created` (not the old
    broken `question.created`, which fired before the AttributeError)."""
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    client.post(
        "/api/v1/question-banks/",
        {"name": "Audited Bank"},
        format="json",
    )

    assert AuditLog.objects.filter(
        action="question_bank.created", tenant=tenant
    ).exists()