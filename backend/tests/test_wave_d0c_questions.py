"""Wave D0c-1 — questions stats, filters, search, sort."""

import pytest

from apps.questions.models import Question

from .conftest import login_as
from .factories import (
    QuestionBankFactory,
    QuestionFactory,
    TeacherUserFactory,
    TenantFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def _setup_mixed_questions():
    bank = QuestionBankFactory()
    tenant = bank.tenant
    owner = UserFactory(tenant=tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=tenant)

    # Pending, approved, rejected (all from teacher)
    pending = QuestionFactory(
        bank=bank, tenant=tenant, created_by=teacher,
        review_status=Question.ReviewStatus.PENDING, text="Pending Q1",
    )
    approved = QuestionFactory(
        bank=bank, tenant=tenant, created_by=teacher,
        review_status=Question.ReviewStatus.APPROVED, text="Approved Q1",
        question_type=Question.QuestionType.MCQ,
    )
    rejected = QuestionFactory(
        bank=bank, tenant=tenant, created_by=teacher,
        review_status=Question.ReviewStatus.REJECTED, text="Rejected Q1",
    )
    return {
        "bank": bank, "tenant": tenant, "owner": owner, "teacher": teacher,
        "pending": pending, "approved": approved, "rejected": rejected,
    }


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


def test_stats_returns_counts(api_client):
    ctx = _setup_mixed_questions()
    client = login_as(api_client, ctx["owner"])
    r = client.get("/api/v1/questions/stats/")
    assert r.status_code == 200
    assert r.data["total"] == 3
    assert r.data["pending"] == 1
    assert r.data["approved"] == 1
    assert r.data["rejected"] == 1


def test_stats_reflects_teacher_scope(api_client):
    """A teacher sees own + approved. The pending on someone else's
    draft is not visible → the counter must match that."""
    ctx = _setup_mixed_questions()

    # Another teacher's pending question — visible to OWNER, invisible to teacher
    other_teacher = TeacherUserFactory(tenant=ctx["tenant"])
    QuestionFactory(
        bank=ctx["bank"], tenant=ctx["tenant"], created_by=other_teacher,
        review_status=Question.ReviewStatus.PENDING, text="Someone else's pending",
    )

    client = login_as(api_client, ctx["teacher"])
    r = client.get("/api/v1/questions/stats/")
    assert r.status_code == 200
    # Teacher's own pending (1) + approved (1, shared) + rejected (1, own)
    assert r.data["pending"] == 1
    assert r.data["approved"] == 1
    assert r.data["rejected"] == 1
    assert r.data["total"] == 3  # not 4


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------


def test_review_status_in_filter(api_client):
    ctx = _setup_mixed_questions()
    client = login_as(api_client, ctx["owner"])
    r = client.get("/api/v1/questions/?review_status__in=PENDING,REJECTED")
    assert r.status_code == 200
    ids = {row["id"] for row in r.data["results"]}
    assert str(ctx["pending"].id) in ids
    assert str(ctx["rejected"].id) in ids
    assert str(ctx["approved"].id) not in ids


def test_question_type_filter(api_client):
    ctx = _setup_mixed_questions()
    client = login_as(api_client, ctx["owner"])
    r = client.get("/api/v1/questions/?question_type=MCQ")
    assert r.status_code == 200
    ids = {row["id"] for row in r.data["results"]}
    assert str(ctx["approved"].id) in ids


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------


def test_search_finds_by_text(api_client):
    ctx = _setup_mixed_questions()
    client = login_as(api_client, ctx["owner"])
    r = client.get("/api/v1/questions/?search=Approved")
    assert r.status_code == 200
    ids = {row["id"] for row in r.data["results"]}
    assert str(ctx["approved"].id) in ids
    assert str(ctx["pending"].id) not in ids


# ---------------------------------------------------------------------------
# Ordering
# ---------------------------------------------------------------------------


def test_ordering_by_points(api_client):
    bank = QuestionBankFactory()
    tenant = bank.tenant
    owner = UserFactory(tenant=tenant, role="OWNER")
    q_high = QuestionFactory(bank=bank, tenant=tenant, points="10.00", text="High")
    q_low = QuestionFactory(bank=bank, tenant=tenant, points="1.00", text="Low")

    client = login_as(api_client, owner)
    r = client.get("/api/v1/questions/?ordering=points")
    ids = [row["id"] for row in r.data["results"]]
    assert ids.index(str(q_low.id)) < ids.index(str(q_high.id))


# ---------------------------------------------------------------------------
# Standard delete guards still work
# ---------------------------------------------------------------------------


def test_delete_question_with_no_links_succeeds(api_client):
    ctx = _setup_mixed_questions()
    client = login_as(api_client, ctx["owner"])
    r = client.delete(f"/api/v1/questions/{ctx['pending'].id}/")
    assert r.status_code == 204
    assert not Question.objects.filter(id=ctx["pending"].id).exists()