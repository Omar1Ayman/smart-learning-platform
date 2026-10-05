"""spec #29's real point isn't just the review states — it's that a
Student should never browse a question bank at all (nearly as bad as
seeing the answer key), and a Teacher shouldn't browse other teachers'
unreviewed drafts."""

import pytest

from .conftest import login_as
from .factories import QuestionBankFactory, QuestionFactory, TeacherUserFactory, TenantFactory, UserFactory

pytestmark = pytest.mark.django_db


def test_student_cannot_list_questions(api_client):
    bank = QuestionBankFactory()
    QuestionFactory(bank=bank, tenant=bank.tenant, approved=True)
    student = UserFactory(tenant=bank.tenant, role="STUDENT")

    client = login_as(api_client, student)
    resp = client.get("/api/v1/questions/")
    assert resp.status_code == 403


def test_student_cannot_list_question_banks(api_client):
    bank = QuestionBankFactory()
    student = UserFactory(tenant=bank.tenant, role="STUDENT")

    client = login_as(api_client, student)
    resp = client.get("/api/v1/question-banks/")
    assert resp.status_code == 403


def test_teacher_sees_own_pending_plus_others_approved_but_not_others_pending(api_client):
    bank = QuestionBankFactory()
    teacher_a = TeacherUserFactory(tenant=bank.tenant)
    teacher_b = TeacherUserFactory(tenant=bank.tenant)

    own_pending = QuestionFactory(bank=bank, tenant=bank.tenant, created_by=teacher_a)
    others_approved = QuestionFactory(bank=bank, tenant=bank.tenant, created_by=teacher_b, approved=True)
    others_pending = QuestionFactory(bank=bank, tenant=bank.tenant, created_by=teacher_b)

    client = login_as(api_client, teacher_a)
    resp = client.get("/api/v1/questions/")
    ids = {row["id"] for row in resp.data["results"]}
    assert str(own_pending.id) in ids
    assert str(others_approved.id) in ids
    assert str(others_pending.id) not in ids


def test_owner_sees_every_question_regardless_of_status(api_client):
    bank = QuestionBankFactory()
    owner = UserFactory(tenant=bank.tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=bank.tenant)
    pending = QuestionFactory(bank=bank, tenant=bank.tenant, created_by=teacher)
    rejected = QuestionFactory(bank=bank, tenant=bank.tenant, created_by=teacher)
    rejected.review_status = "REJECTED"
    rejected.save(update_fields=["review_status"])

    client = login_as(api_client, owner)
    resp = client.get("/api/v1/questions/")
    ids = {row["id"] for row in resp.data["results"]}
    assert str(pending.id) in ids
    assert str(rejected.id) in ids


def test_admin_cannot_read_another_tenants_question(api_client):
    tenant_a = TenantFactory()
    admin_a = UserFactory(tenant=tenant_a, role="OWNER")
    other_question = QuestionFactory()  # its own independent tenant

    client = login_as(api_client, admin_a)
    resp = client.get(f"/api/v1/questions/{other_question.id}/")
    assert resp.status_code in (403, 404)
