"""The single most security-critical test in Phase 9. `QuestionForStudentSerializer`
MUST structurally omit correct-answer fields — not by convention, not by a
view that "doesn't render them," but by never having the fields at all.

If any of these tests fails, a student can see the answer key in the
exam-taking UI. Do not weaken them; fix the serializer instead."""

import json

import pytest

from apps.exam_engine.serializers import QuestionForStudentSerializer
from apps.questions.models import Question

from .factories import QuestionBankFactory, QuestionFactory

pytestmark = pytest.mark.django_db


def _mcq_question_with_options():
    bank = QuestionBankFactory()
    question = QuestionFactory(
        bank=bank,
        tenant=bank.tenant,
        question_type=Question.QuestionType.MCQ,
        approved=True,
    )
    question.options.create(tenant=bank.tenant, text="Correct", is_correct=True, order=1)
    question.options.create(tenant=bank.tenant, text="Wrong", is_correct=False, order=2)
    return question


def test_serializer_fields_do_not_include_is_correct():
    q = _mcq_question_with_options()
    fields = QuestionForStudentSerializer(q).fields.keys()
    assert "is_correct" not in fields
    assert "accepted_answers" not in fields
    assert "explanation" not in fields
    assert "review_note" not in fields


def test_serialized_options_do_not_include_is_correct():
    q = _mcq_question_with_options()
    data = QuestionForStudentSerializer(q).data
    for option in data["options"]:
        assert "is_correct" not in option


def test_serialized_json_never_contains_is_correct_string():
    """Belt-and-braces: even if a nested field slipped through, the
    serialized JSON string must not contain "is_correct" anywhere."""
    q = _mcq_question_with_options()
    data = QuestionForStudentSerializer(q).data
    text = json.dumps(data, default=str)
    assert '"is_correct"' not in text
    assert '"accepted_answers"' not in text
    assert '"explanation"' not in text


def test_short_answer_question_hides_accepted_answers():
    bank = QuestionBankFactory()
    q = QuestionFactory(
        bank=bank,
        tenant=bank.tenant,
        question_type=Question.QuestionType.SHORT_ANSWER,
        accepted_answers=["Cairo", "القاهرة"],
    )
    data = QuestionForStudentSerializer(q).data
    assert "accepted_answers" not in data


def test_explanation_is_never_serialized():
    bank = QuestionBankFactory()
    q = QuestionFactory(
        bank=bank,
        tenant=bank.tenant,
        explanation="This is the internal rationale for the answer.",
    )
    data = QuestionForStudentSerializer(q).data
    assert "explanation" not in data
