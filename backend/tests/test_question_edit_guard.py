"""Wave 14 — question edit guards."""

import pytest
from apps.assessments.models import AssessmentQuestion
from apps.exam_engine.models import ExamAttempt
from apps.questions.models import Question

from .conftest import login_as
from .factories import (
    AssessmentFactory,
    QuestionBankFactory,
    QuestionFactory,
    StudentUserFactory,
    TeacherUserFactory,
)

pytestmark = pytest.mark.django_db


def _tf_payload(bank_id):
    return {
        "bank": str(bank_id),
        "text": "السؤال؟",
        "question_type": "TRUE_FALSE",
        "options": [
            {"text": "صح", "is_correct": True, "order": 1},
            {"text": "خطأ", "is_correct": False, "order": 2},
        ],
    }


def test_cannot_change_question_type_on_edit(api_client):
    bank = QuestionBankFactory()
    teacher = TeacherUserFactory(tenant=bank.tenant)
    question = QuestionFactory(bank=bank, tenant=bank.tenant, created_by=teacher)

    client = login_as(api_client, teacher)
    resp = client.patch(
        f"/api/v1/questions/{question.id}/",
        {"question_type": "MCQ"},
        format="json",
    )
    assert resp.status_code == 400


def test_true_false_options_are_locked(api_client):
    bank = QuestionBankFactory()
    teacher = TeacherUserFactory(tenant=bank.tenant)
    question = QuestionFactory(
        bank=bank,
        tenant=bank.tenant,
        created_by=teacher,
        question_type=Question.QuestionType.TRUE_FALSE,
    )
    question.options.create(tenant=bank.tenant, text="صح", is_correct=True, order=1)
    question.options.create(tenant=bank.tenant, text="خطأ", is_correct=False, order=2)

    client = login_as(api_client, teacher)
    resp = client.patch(
        f"/api/v1/questions/{question.id}/",
        {
            "options": [
                {"text": "Yes", "is_correct": True, "order": 1},
                {"text": "No", "is_correct": False, "order": 2},
            ]
        },
        format="json",
    )
    assert resp.status_code == 400


def test_editing_question_text_is_allowed(api_client):
    bank = QuestionBankFactory()
    teacher = TeacherUserFactory(tenant=bank.tenant)
    question = QuestionFactory(bank=bank, tenant=bank.tenant, created_by=teacher)

    client = login_as(api_client, teacher)
    resp = client.patch(
        f"/api/v1/questions/{question.id}/", {"text": "نص جديد"}, format="json"
    )
    assert resp.status_code == 200, resp.data
    question.refresh_from_db()
    assert question.text == "نص جديد"


def test_editing_approved_question_resets_review_status(api_client):
    bank = QuestionBankFactory()
    teacher = TeacherUserFactory(tenant=bank.tenant)
    question = QuestionFactory(bank=bank, tenant=bank.tenant, created_by=teacher, approved=True)

    client = login_as(api_client, teacher)
    resp = client.patch(
        f"/api/v1/questions/{question.id}/", {"text": "تعديل"}, format="json"
    )
    assert resp.status_code == 200
    question.refresh_from_db()
    assert question.review_status == Question.ReviewStatus.PENDING


def test_question_linked_to_published_exam_cannot_be_edited(api_client):
    bank = QuestionBankFactory()
    teacher = TeacherUserFactory(tenant=bank.tenant)
    question = QuestionFactory(bank=bank, tenant=bank.tenant, created_by=teacher, approved=True)
    assessment = AssessmentFactory(tenant=bank.tenant, status="PUBLISHED")
    AssessmentQuestion.objects.create(
        tenant=bank.tenant, assessment=assessment, question=question, order=1
    )

    client = login_as(api_client, teacher)
    resp = client.patch(
        f"/api/v1/questions/{question.id}/", {"text": "تعديل"}, format="json"
    )

    assert resp.status_code == 400
    question.refresh_from_db()
    assert question.text != "تعديل"


def test_question_with_attempt_history_cannot_be_edited(api_client):
    bank = QuestionBankFactory()
    teacher = TeacherUserFactory(tenant=bank.tenant)
    student = StudentUserFactory(tenant=bank.tenant)
    question = QuestionFactory(bank=bank, tenant=bank.tenant, created_by=teacher, approved=True)
    assessment = AssessmentFactory(tenant=bank.tenant, status="CLOSED")
    AssessmentQuestion.objects.create(
        tenant=bank.tenant, assessment=assessment, question=question, order=1
    )
    ExamAttempt.objects.create(
        tenant=bank.tenant,
        assessment=assessment,
        student=student,
        attempt_number=1,
        question_order=[str(question.id)],
        max_score=question.points,
    )

    client = login_as(api_client, teacher)
    resp = client.patch(
        f"/api/v1/questions/{question.id}/", {"text": "تعديل"}, format="json"
    )

    assert resp.status_code == 400
    question.refresh_from_db()
    assert question.text != "تعديل"