"""Wave M4 (Milestone 4, Batch 16) — question duplication."""

import pytest

from apps.questions.models import Question, QuestionOption

from .conftest import login_as
from .factories import (
    QuestionBankFactory,
    QuestionFactory,
    TeacherUserFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def _make_mcq(bank, tenant, **overrides):
    q = QuestionFactory(
        bank=bank,
        tenant=tenant,
        question_type=Question.QuestionType.MCQ,
        approved=True,
        **overrides,
    )
    QuestionOption.objects.create(tenant=tenant, question=q, text="A", is_correct=True, order=1)
    QuestionOption.objects.create(tenant=tenant, question=q, text="B", is_correct=False, order=2)
    return q


def test_owner_can_duplicate_question(api_client):
    bank = QuestionBankFactory()
    owner = UserFactory(tenant=bank.tenant, role="OWNER")
    source = _make_mcq(bank, bank.tenant, text="What is 2+2?")

    client = login_as(api_client, owner)
    r = client.post(f"/api/v1/questions/{source.id}/duplicate/")
    assert r.status_code == 201, r.data

    copy = Question.objects.get(id=r.data["id"])
    assert copy.id != source.id
    assert copy.text == "What is 2+2? (نسخة)"
    assert copy.review_status == Question.ReviewStatus.PENDING
    assert copy.created_by_id == owner.id
    assert copy.bank_id == source.bank_id
    assert copy.options.count() == 2


def test_duplicate_twice_creates_numbered_suffix(api_client):
    bank = QuestionBankFactory()
    owner = UserFactory(tenant=bank.tenant, role="OWNER")
    source = _make_mcq(bank, bank.tenant, text="Q?")

    client = login_as(api_client, owner)
    r1 = client.post(f"/api/v1/questions/{source.id}/duplicate/")
    assert r1.status_code == 201
    assert r1.data["text"] == "Q? (نسخة)"

    r2 = client.post(f"/api/v1/questions/{source.id}/duplicate/")
    assert r2.status_code == 201
    assert r2.data["text"] == "Q? (نسخة 2)"


def test_duplicate_resets_review_status_to_pending(api_client):
    """Even if the source is APPROVED, the copy starts PENDING — closes
    a potential 'approve by duplicating' bypass."""
    bank = QuestionBankFactory()
    owner = UserFactory(tenant=bank.tenant, role="OWNER")
    source = _make_mcq(bank, bank.tenant, text="Q?")
    assert source.review_status == Question.ReviewStatus.APPROVED

    client = login_as(api_client, owner)
    r = client.post(f"/api/v1/questions/{source.id}/duplicate/")
    copy = Question.objects.get(id=r.data["id"])
    assert copy.review_status == Question.ReviewStatus.PENDING
    assert copy.reviewed_by is None


def test_duplicate_copies_options_verbatim(api_client):
    bank = QuestionBankFactory()
    owner = UserFactory(tenant=bank.tenant, role="OWNER")
    source = _make_mcq(bank, bank.tenant, text="Q?")

    client = login_as(api_client, owner)
    r = client.post(f"/api/v1/questions/{source.id}/duplicate/")
    copy = Question.objects.get(id=r.data["id"])

    source_opts = sorted(source.options.values_list("text", "is_correct", "order"))
    copy_opts = sorted(copy.options.values_list("text", "is_correct", "order"))
    assert source_opts == copy_opts


def test_duplicate_transfers_ownership_to_actor(api_client):
    """A teacher who duplicates someone else's question owns the copy."""
    bank = QuestionBankFactory()
    teacher_a = TeacherUserFactory(tenant=bank.tenant)
    teacher_b = TeacherUserFactory(tenant=bank.tenant)
    source = _make_mcq(bank, bank.tenant, text="Q?", created_by=teacher_a)

    # teacher_b sees teacher_a's approved question (approved is visible).
    client = login_as(api_client, teacher_b)
    r = client.post(f"/api/v1/questions/{source.id}/duplicate/")
    assert r.status_code == 201
    copy = Question.objects.get(id=r.data["id"])
    assert copy.created_by_id == teacher_b.id


def test_student_cannot_duplicate_question(api_client):
    """STUDENT can't even fetch the question (blocked by IsStaffMember),
    so duplicate returns 404 (not in their queryset)."""
    bank = QuestionBankFactory()
    student = UserFactory(tenant=bank.tenant, role="STUDENT")
    source = _make_mcq(bank, bank.tenant, text="Q?")

    client = login_as(api_client, student)
    r = client.post(f"/api/v1/questions/{source.id}/duplicate/")
    assert r.status_code in (403, 404)


def test_duplicate_nonexistent_question_returns_404(api_client):
    bank = QuestionBankFactory()
    owner = UserFactory(tenant=bank.tenant, role="OWNER")
    client = login_as(api_client, owner)
    r = client.post("/api/v1/questions/00000000-0000-0000-0000-000000000000/duplicate/")
    assert r.status_code == 404
