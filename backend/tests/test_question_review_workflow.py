"""spec #29: Teacher creates -> PENDING -> Admin reviews -> APPROVED/
REJECTED, and a Teacher can never approve their own question. This
codebase applies that rule to everyone, not just Teachers — see
PROJECT_MEMORY.md's Phase 7 notes for why."""

import pytest
from rest_framework.test import APIClient

from apps.questions.models import Question

from .conftest import login_as
from .factories import QuestionBankFactory, QuestionFactory, TeacherUserFactory, UserFactory

pytestmark = pytest.mark.django_db


def _mcq_payload(bank):
    return {
        "bank": str(bank.id),
        "text": "What is 2 + 2?",
        "question_type": "MCQ",
        "points": "2.00",
        "options": [
            {"text": "3", "is_correct": False, "order": 1},
            {"text": "4", "is_correct": True, "order": 2},
        ],
    }


def test_teacher_created_question_starts_pending(api_client):
    bank = QuestionBankFactory()
    teacher = TeacherUserFactory(tenant=bank.tenant)
    client = login_as(api_client, teacher)

    resp = client.post("/api/v1/questions/", _mcq_payload(bank), format="json")
    assert resp.status_code == 201, resp.data
    assert resp.data["review_status"] == "PENDING"
    question = Question.objects.get(id=resp.data["id"])
    assert question.created_by_id == teacher.id


def test_teacher_cannot_approve_own_question(api_client):
    bank = QuestionBankFactory()
    teacher = TeacherUserFactory(tenant=bank.tenant)
    QuestionFactory(bank=bank, tenant=bank.tenant, created_by=teacher)

    # Give the teacher admin-equivalent role temporarily? No — spec is
    # explicit a Teacher can't approve at all (see next test); this test
    # is specifically the ownership rule, exercised via an OWNER who
    # authored the question themselves.
    owner = UserFactory(tenant=bank.tenant, role="OWNER")
    owned_by_owner = QuestionFactory(bank=bank, tenant=bank.tenant, created_by=owner)
    client = login_as(api_client, owner)
    resp = client.post(f"/api/v1/questions/{owned_by_owner.id}/approve/")
    assert resp.status_code == 403
    owned_by_owner.refresh_from_db()
    assert owned_by_owner.review_status == Question.ReviewStatus.PENDING


def test_teacher_cannot_call_approve_endpoint_at_all(api_client):
    bank = QuestionBankFactory()
    teacher_a = TeacherUserFactory(tenant=bank.tenant)
    teacher_b = TeacherUserFactory(tenant=bank.tenant)
    question = QuestionFactory(bank=bank, tenant=bank.tenant, created_by=teacher_a)

    client = login_as(APIClient(), teacher_b)
    resp = client.post(f"/api/v1/questions/{question.id}/approve/")
    assert resp.status_code == 403


def test_admin_can_approve_a_teachers_question(api_client):
    bank = QuestionBankFactory()
    teacher = TeacherUserFactory(tenant=bank.tenant)
    admin = UserFactory(tenant=bank.tenant, role="OWNER")
    question = QuestionFactory(bank=bank, tenant=bank.tenant, created_by=teacher)

    client = login_as(api_client, admin)
    resp = client.post(f"/api/v1/questions/{question.id}/approve/")
    assert resp.status_code == 200, resp.data
    question.refresh_from_db()
    assert question.review_status == Question.ReviewStatus.APPROVED
    assert question.reviewed_by_id == admin.id
    assert question.reviewed_at is not None


def test_admin_can_reject_with_a_note(api_client):
    bank = QuestionBankFactory()
    teacher = TeacherUserFactory(tenant=bank.tenant)
    admin = UserFactory(tenant=bank.tenant, role="OWNER")
    question = QuestionFactory(bank=bank, tenant=bank.tenant, created_by=teacher)

    client = login_as(api_client, admin)
    resp = client.post(
        f"/api/v1/questions/{question.id}/reject/", {"review_note": "الصياغة غير واضحة"}, format="json"
    )
    assert resp.status_code == 200, resp.data
    question.refresh_from_db()
    assert question.review_status == Question.ReviewStatus.REJECTED
    assert question.review_note == "الصياغة غير واضحة"


def test_editing_an_approved_question_sends_it_back_to_pending(api_client):
    bank = QuestionBankFactory()
    teacher = TeacherUserFactory(tenant=bank.tenant)
    question = QuestionFactory(bank=bank, tenant=bank.tenant, created_by=teacher, approved=True)
    assert question.review_status == Question.ReviewStatus.APPROVED

    client = login_as(api_client, teacher)
    resp = client.patch(f"/api/v1/questions/{question.id}/", {"text": "Updated wording?"}, format="json")
    assert resp.status_code == 200, resp.data
    question.refresh_from_db()
    assert question.review_status == Question.ReviewStatus.PENDING
    assert question.reviewed_by_id is None
