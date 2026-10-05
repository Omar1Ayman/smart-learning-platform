import pytest
from django.db import IntegrityError, transaction

from apps.questions.models import Question, QuestionBank, QuestionOption

from .conftest import login_as
from .factories import QuestionBankFactory, QuestionFactory, TeacherUserFactory, UserFactory

pytestmark = pytest.mark.django_db


def test_mcq_requires_at_least_two_options(api_client):
    bank = QuestionBankFactory()
    teacher = TeacherUserFactory(tenant=bank.tenant)
    client = login_as(api_client, teacher)

    resp = client.post(
        "/api/v1/questions/",
        {
            "bank": str(bank.id),
            "text": "Only one option?",
            "question_type": "MCQ",
            "options": [{"text": "Only", "is_correct": True, "order": 1}],
        },
        format="json",
    )
    assert resp.status_code == 400


def test_mcq_requires_exactly_one_correct_option(api_client):
    bank = QuestionBankFactory()
    teacher = TeacherUserFactory(tenant=bank.tenant)
    client = login_as(api_client, teacher)

    resp = client.post(
        "/api/v1/questions/",
        {
            "bank": str(bank.id),
            "text": "Two correct?",
            "question_type": "MCQ",
            "options": [
                {"text": "A", "is_correct": True, "order": 1},
                {"text": "B", "is_correct": True, "order": 2},
            ],
        },
        format="json",
    )
    assert resp.status_code == 400


def test_true_false_question_with_two_options_succeeds(api_client):
    bank = QuestionBankFactory()
    teacher = TeacherUserFactory(tenant=bank.tenant)
    client = login_as(api_client, teacher)

    resp = client.post(
        "/api/v1/questions/",
        {
            "bank": str(bank.id),
            "text": "The sky is blue.",
            "question_type": "TRUE_FALSE",
            "options": [
                {"text": "True", "is_correct": True, "order": 1},
                {"text": "False", "is_correct": False, "order": 2},
            ],
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data


def test_short_answer_requires_accepted_answers(api_client):
    bank = QuestionBankFactory()
    teacher = TeacherUserFactory(tenant=bank.tenant)
    client = login_as(api_client, teacher)

    resp = client.post(
        "/api/v1/questions/",
        {"bank": str(bank.id), "text": "Capital of Egypt?", "question_type": "SHORT_ANSWER"},
        format="json",
    )
    assert resp.status_code == 400

    resp = client.post(
        "/api/v1/questions/",
        {
            "bank": str(bank.id),
            "text": "Capital of Egypt?",
            "question_type": "SHORT_ANSWER",
            "accepted_answers": ["Cairo", "القاهرة"],
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data


def test_essay_question_needs_neither_options_nor_accepted_answers(api_client):
    bank = QuestionBankFactory()
    teacher = TeacherUserFactory(tenant=bank.tenant)
    client = login_as(api_client, teacher)

    resp = client.post(
        "/api/v1/questions/",
        {"bank": str(bank.id), "text": "Discuss photosynthesis.", "question_type": "ESSAY"},
        format="json",
    )
    assert resp.status_code == 201, resp.data


def test_db_constraint_blocks_two_correct_options_even_bypassing_the_serializer():
    """The serializer check is the friendly error message; the database
    constraint (uniq_single_correct_option_per_question) is the real
    guarantee — prove it holds even via direct ORM writes."""
    question = QuestionFactory(question_type=Question.QuestionType.MCQ)
    QuestionOption.objects.create(
        tenant=question.tenant, question=question, text="A", is_correct=True, order=1
    )
    with pytest.raises(IntegrityError), transaction.atomic():
        QuestionOption.objects.create(
            tenant=question.tenant, question=question, text="B", is_correct=True, order=2
        )


def test_updating_question_text_without_resubmitting_options_does_not_fail_validation(api_client):
    """The exact bug class Content's is_published fix guarded against
    (PROJECT_MEMORY.md Phase 6) — a partial update that doesn't touch
    `options` must not be validated as if options were being wiped out."""
    bank = QuestionBankFactory()
    teacher = TeacherUserFactory(tenant=bank.tenant)
    question = QuestionFactory(
        bank=bank, tenant=bank.tenant, created_by=teacher, question_type=Question.QuestionType.MCQ
    )
    from apps.questions.models import QuestionOption as QO

    QO.objects.create(tenant=bank.tenant, question=question, text="A", is_correct=False, order=1)
    QO.objects.create(tenant=bank.tenant, question=question, text="B", is_correct=True, order=2)

    client = login_as(api_client, teacher)
    resp = client.patch(f"/api/v1/questions/{question.id}/", {"topic": "Algebra"}, format="json")
    assert resp.status_code == 200, resp.data
    assert question.options.count() == 2  # untouched


def test_teacher_cannot_edit_another_teachers_pending_question(api_client):
    """A pending question outside a Teacher's visibility (see
    test_question_visibility.py) isn't just uneditable — it's not even
    visible to fetch by ID, so this is 404 (not in their queryset at
    all), the same "you can't even see this exists" pattern Enrollment
    uses in Phase 5 — not 403 (which would confirm the id is valid)."""
    bank = QuestionBankFactory()
    teacher_a = TeacherUserFactory(tenant=bank.tenant)
    teacher_b = TeacherUserFactory(tenant=bank.tenant)
    question = QuestionFactory(bank=bank, tenant=bank.tenant, created_by=teacher_a)

    client = login_as(api_client, teacher_b)
    resp = client.patch(f"/api/v1/questions/{question.id}/", {"topic": "Hijacked"}, format="json")
    assert resp.status_code == 404


def test_teacher_cannot_edit_another_teachers_approved_question(api_client):
    """Once approved, the question *is* visible to every teacher (so they
    can use it while building assessments later) — this is where
    IsCreatorOrAdmin's object-level check is the thing doing the work,
    and 403 is the right response: they can see it, just not touch it."""
    bank = QuestionBankFactory()
    teacher_a = TeacherUserFactory(tenant=bank.tenant)
    teacher_b = TeacherUserFactory(tenant=bank.tenant)
    question = QuestionFactory(bank=bank, tenant=bank.tenant, created_by=teacher_a, approved=True)

    client = login_as(api_client, teacher_b)
    resp = client.patch(f"/api/v1/questions/{question.id}/", {"topic": "Hijacked"}, format="json")
    assert resp.status_code == 403


def test_question_bank_with_questions_cannot_be_deleted(api_client):
    bank = QuestionBankFactory()
    owner = UserFactory(tenant=bank.tenant, role="OWNER")
    QuestionFactory(bank=bank, tenant=bank.tenant)

    client = login_as(api_client, owner)
    resp = client.delete(f"/api/v1/question-banks/{bank.id}/")
    assert resp.status_code == 400
    assert QuestionBank.objects.filter(id=bank.id).exists()
