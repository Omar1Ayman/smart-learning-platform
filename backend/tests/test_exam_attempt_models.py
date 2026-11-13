"""Wave 9A — model-level guarantees for ExamAttempt and AttemptAnswer.

No view/serializer here — this wave is the data layer only. Views and
endpoints land in Wave 9C. The point of this file is to prove the
constraints (attempt numbering, score bounds, expiry sanity, one-answer-
per-question) actually hold even via raw ORM writes, not just via the
API. Same principle as Phase 7's QuestionOption partial-unique test.
"""

from datetime import timedelta

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.assessments.models import AssessmentQuestion
from apps.exam_engine.models import AttemptAnswer, ExamAttempt

from .factories import (
    AssessmentFactory,
    QuestionBankFactory,
    QuestionFactory,
    StudentUserFactory,
    TeacherUserFactory,
)

pytestmark = pytest.mark.django_db


def _make_attempt(assessment, student, **overrides):
    return ExamAttempt.objects.create(
        tenant=assessment.tenant,
        assessment=assessment,
        student=student,
        **overrides,
    )


def _link_question(assessment, student_author):
    bank = QuestionBankFactory(tenant=assessment.tenant)
    question = QuestionFactory(
        bank=bank, tenant=assessment.tenant, approved=True, created_by=student_author
    )
    AssessmentQuestion.objects.create(
        tenant=assessment.tenant, assessment=assessment, question=question, order=1
    )
    return question


# ---------- Attempt numbering ----------


def test_can_have_multiple_attempts_with_different_numbers():
    assessment = AssessmentFactory()
    student = StudentUserFactory(tenant=assessment.tenant)
    _make_attempt(assessment, student, attempt_number=1)
    _make_attempt(assessment, student, attempt_number=2)
    _make_attempt(assessment, student, attempt_number=3)
    assert ExamAttempt.objects.filter(student=student, assessment=assessment).count() == 3


def test_cannot_duplicate_attempt_number_for_same_student_assessment():
    assessment = AssessmentFactory()
    student = StudentUserFactory(tenant=assessment.tenant)
    _make_attempt(assessment, student, attempt_number=1)
    with pytest.raises(IntegrityError), transaction.atomic():
        _make_attempt(assessment, student, attempt_number=1)


def test_same_attempt_number_is_fine_across_different_students():
    assessment = AssessmentFactory()
    student_a = StudentUserFactory(tenant=assessment.tenant)
    student_b = StudentUserFactory(tenant=assessment.tenant)
    _make_attempt(assessment, student_a, attempt_number=1)
    _make_attempt(assessment, student_b, attempt_number=1)
    assert ExamAttempt.objects.count() == 2


# ---------- Score constraints ----------


def test_score_cannot_exceed_max_score():
    assessment = AssessmentFactory()
    student = StudentUserFactory(tenant=assessment.tenant)
    with pytest.raises(IntegrityError), transaction.atomic():
        _make_attempt(assessment, student, max_score=10, score=20)


def test_score_cannot_be_negative():
    assessment = AssessmentFactory()
    student = StudentUserFactory(tenant=assessment.tenant)
    with pytest.raises(IntegrityError), transaction.atomic():
        _make_attempt(assessment, student, max_score=10, score=-1)


def test_score_null_is_allowed_until_graded():
    assessment = AssessmentFactory()
    student = StudentUserFactory(tenant=assessment.tenant)
    attempt = _make_attempt(assessment, student, max_score=10, score=None)
    assert attempt.score is None


# ---------- Expiry constraints ----------


def test_expires_at_must_be_after_started_at():
    assessment = AssessmentFactory()
    student = StudentUserFactory(tenant=assessment.tenant)
    now = timezone.now()
    with pytest.raises(IntegrityError), transaction.atomic():
        _make_attempt(assessment, student, expires_at=now - timedelta(minutes=5))


def test_expires_at_null_is_allowed_for_self_paced():
    assessment = AssessmentFactory()
    student = StudentUserFactory(tenant=assessment.tenant)
    attempt = _make_attempt(assessment, student, expires_at=None)
    assert attempt.is_expired() is False


# ---------- Answers: uniqueness ----------


def test_cannot_have_two_answers_for_same_question_in_same_attempt():
    assessment = AssessmentFactory()
    student = StudentUserFactory(tenant=assessment.tenant)
    teacher = TeacherUserFactory(tenant=assessment.tenant)
    question = _link_question(assessment, teacher)
    attempt = _make_attempt(assessment, student)
    AttemptAnswer.objects.create(tenant=assessment.tenant, attempt=attempt, question=question)
    with pytest.raises(IntegrityError), transaction.atomic():
        AttemptAnswer.objects.create(tenant=assessment.tenant, attempt=attempt, question=question)


# ---------- Answers: awarded points sanity ----------


def test_awarded_points_cannot_be_negative():
    assessment = AssessmentFactory()
    student = StudentUserFactory(tenant=assessment.tenant)
    teacher = TeacherUserFactory(tenant=assessment.tenant)
    question = _link_question(assessment, teacher)
    attempt = _make_attempt(assessment, student)
    with pytest.raises(IntegrityError), transaction.atomic():
        AttemptAnswer.objects.create(
            tenant=assessment.tenant,
            attempt=attempt,
            question=question,
            awarded_points=-1,
        )


# ---------- is_expired logic ----------


def test_is_expired_is_true_once_timer_passes():
    assessment = AssessmentFactory()
    student = StudentUserFactory(tenant=assessment.tenant)
    attempt = _make_attempt(assessment, student)
    # Backdate started_at so expires_at (also auto_now_add) is in the past.
    # Uses a direct SQL update because started_at is auto_now_add.
    ExamAttempt.objects.filter(pk=attempt.pk).update(
        started_at=timezone.now() - timedelta(hours=2),
        expires_at=timezone.now() - timedelta(hours=1),
    )
    attempt.refresh_from_db()
    assert attempt.is_expired() is True


# ---------- RETAIN / RESTRICT: cannot delete history ----------


def test_cannot_delete_question_with_answers():
    assessment = AssessmentFactory()
    student = StudentUserFactory(tenant=assessment.tenant)
    teacher = TeacherUserFactory(tenant=assessment.tenant)
    question = _link_question(assessment, teacher)
    attempt = _make_attempt(assessment, student)
    AttemptAnswer.objects.create(tenant=assessment.tenant, attempt=attempt, question=question)

    from django.db.models.deletion import RestrictedError

    with pytest.raises(RestrictedError):
        question.delete()
