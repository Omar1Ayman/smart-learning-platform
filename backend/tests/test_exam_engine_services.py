"""Wave 9B — services-level guarantees: eligibility, randomization
snapshotting, timer computation, auto-grading."""

from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.assessments.models import AssessmentQuestion, AssessmentTarget
from apps.exam_engine.models import ExamAttempt
from apps.exam_engine.services import save_answer, start_attempt, submit_attempt
from apps.questions.models import Question

from .factories import (
    AssessmentFactory,
    EnrollmentFactory,
    GroupFactory,
    QuestionBankFactory,
    QuestionFactory,
    StudentUserFactory,
    TeacherUserFactory,
)

pytestmark = pytest.mark.django_db


def _enrolled_student_targeted_by_grade():
    group = GroupFactory()
    student = StudentUserFactory(tenant=group.tenant)
    EnrollmentFactory(
        tenant=group.tenant, student=student, group=group, academic_year=group.academic_year
    )
    assessment = AssessmentFactory(tenant=group.tenant, status="PUBLISHED")
    AssessmentTarget.objects.create(
        tenant=group.tenant, assessment=assessment, target_type="GRADE", grade=group.grade
    )
    return student, group, assessment


def _link(assessment, question_type=Question.QuestionType.MCQ, with_options=True, points="2.00"):
    bank = QuestionBankFactory(tenant=assessment.tenant)
    q = QuestionFactory(
        bank=bank,
        tenant=assessment.tenant,
        question_type=question_type,
        points=points,
        approved=True,
        created_by=TeacherUserFactory(tenant=assessment.tenant),
    )
    if with_options and question_type == Question.QuestionType.MCQ:
        q.options.create(tenant=assessment.tenant, text="A", is_correct=True, order=1)
        q.options.create(tenant=assessment.tenant, text="B", is_correct=False, order=2)
    elif question_type == Question.QuestionType.TRUE_FALSE:
        q.options.create(tenant=assessment.tenant, text="صح", is_correct=True, order=1)
        q.options.create(tenant=assessment.tenant, text="خطأ", is_correct=False, order=2)
    elif question_type == Question.QuestionType.SHORT_ANSWER:
        q.accepted_answers = ["Cairo", "القاهرة"]
        q.save(update_fields=["accepted_answers"])
    AssessmentQuestion.objects.create(
        tenant=assessment.tenant, assessment=assessment, question=q, order=1
    )
    return q


# ---------- start_attempt ----------


def test_start_attempt_rejects_unpublished():
    student, _, assessment = _enrolled_student_targeted_by_grade()
    assessment.status = "DRAFT"
    assessment.save(update_fields=["status"])
    _link(assessment)
    with pytest.raises(ValidationError):
        start_attempt(assessment, student, assessment.tenant)


def test_start_attempt_rejects_untargeted_student():
    student, group, assessment = _enrolled_student_targeted_by_grade()
    # Move the target to a different grade — the student is no longer eligible.
    other_group = GroupFactory(tenant=group.tenant)
    assessment.targets.all().delete()
    AssessmentTarget.objects.create(
        tenant=group.tenant, assessment=assessment, target_type="GRADE", grade=other_group.grade
    )
    _link(assessment)
    with pytest.raises(ValidationError):
        start_attempt(assessment, student, assessment.tenant)


def test_start_attempt_rejects_before_starts_at():
    student, _, assessment = _enrolled_student_targeted_by_grade()
    assessment.starts_at = timezone.now() + timezone.timedelta(hours=1)
    assessment.save(update_fields=["starts_at"])
    _link(assessment)
    with pytest.raises(ValidationError):
        start_attempt(assessment, student, assessment.tenant)


def test_start_attempt_rejects_after_ends_at():
    student, _, assessment = _enrolled_student_targeted_by_grade()
    assessment.ends_at = timezone.now() - timezone.timedelta(minutes=1)
    assessment.save(update_fields=["ends_at"])
    _link(assessment)
    with pytest.raises(ValidationError):
        start_attempt(assessment, student, assessment.tenant)


def test_start_attempt_rejects_when_max_attempts_exhausted():
    student, _, assessment = _enrolled_student_targeted_by_grade()
    assessment.max_attempts = 1
    assessment.save(update_fields=["max_attempts"])
    _link(assessment)

    first = start_attempt(assessment, student, assessment.tenant)
    submit_attempt(first)  # close it so used-count is enforced

    with pytest.raises(ValidationError):
        start_attempt(assessment, student, assessment.tenant)


def test_start_attempt_snapshots_question_order_and_max_score():
    student, _, assessment = _enrolled_student_targeted_by_grade()
    _link(assessment, points="5.00")
    attempt = start_attempt(assessment, student, assessment.tenant)
    assert len(attempt.question_order) == 1
    assert Decimal(attempt.max_score) == Decimal("5.00")


def test_start_attempt_returns_existing_in_progress_attempt():
    student, _, assessment = _enrolled_student_targeted_by_grade()
    _link(assessment)
    a1 = start_attempt(assessment, student, assessment.tenant)
    a2 = start_attempt(assessment, student, assessment.tenant)
    assert a1.id == a2.id  # resumed, not a new attempt


def test_start_attempt_sets_expiry_from_duration():
    student, _, assessment = _enrolled_student_targeted_by_grade()
    assessment.duration_minutes = 30
    assessment.save(update_fields=["duration_minutes"])
    _link(assessment)
    attempt = start_attempt(assessment, student, assessment.tenant)
    assert attempt.expires_at is not None
    remaining = (attempt.expires_at - timezone.now()).total_seconds()
    assert 1700 < remaining < 1810  # ~30 min, with a little slack


# ---------- save_answer ----------


def test_save_answer_persists_chosen_option():
    student, _, assessment = _enrolled_student_targeted_by_grade()
    q = _link(assessment)
    attempt = start_attempt(assessment, student, assessment.tenant)
    correct_option = q.options.get(is_correct=True)
    save_answer(attempt, q.id, chosen_option_id=correct_option.id)
    answer = attempt.answers.get(question=q)
    assert answer.chosen_option_id == correct_option.id


def test_save_answer_rejects_question_not_in_attempt():
    student, _, assessment = _enrolled_student_targeted_by_grade()
    _link(assessment)
    attempt = start_attempt(assessment, student, assessment.tenant)
    bank = QuestionBankFactory(tenant=assessment.tenant)
    foreign_q = QuestionFactory(bank=bank, tenant=assessment.tenant, approved=True)
    with pytest.raises(ValidationError):
        save_answer(attempt, foreign_q.id, chosen_option_id=None, text_answer="x")


def test_save_answer_rejects_option_from_another_question():
    student, _, assessment = _enrolled_student_targeted_by_grade()
    q1 = _link(assessment)
    bank = QuestionBankFactory(tenant=assessment.tenant)
    q2 = QuestionFactory(bank=bank, tenant=assessment.tenant, approved=True)
    other_opt = q2.options.create(tenant=assessment.tenant, text="x", is_correct=False, order=1)
    attempt = start_attempt(assessment, student, assessment.tenant)
    with pytest.raises(ValidationError):
        save_answer(attempt, q1.id, chosen_option_id=other_opt.id)


# ---------- submit_attempt ----------


def test_submit_grades_mcq_correctly():
    student, _, assessment = _enrolled_student_targeted_by_grade()
    q = _link(assessment, points="2.00")
    attempt = start_attempt(assessment, student, assessment.tenant)
    save_answer(attempt, q.id, chosen_option_id=q.options.get(is_correct=True).id)
    submit_attempt(attempt)
    attempt.refresh_from_db()
    assert attempt.status == ExamAttempt.Status.GRADED
    assert Decimal(attempt.score) == Decimal("2.00")


def test_submit_grades_mcq_wrong_as_zero():
    student, _, assessment = _enrolled_student_targeted_by_grade()
    q = _link(assessment, points="2.00")
    attempt = start_attempt(assessment, student, assessment.tenant)
    save_answer(attempt, q.id, chosen_option_id=q.options.get(is_correct=False).id)
    submit_attempt(attempt)
    attempt.refresh_from_db()
    assert Decimal(attempt.score) == Decimal("0")


def test_submit_grades_short_answer_case_insensitive():
    student, _, assessment = _enrolled_student_targeted_by_grade()
    q = _link(assessment, question_type=Question.QuestionType.SHORT_ANSWER)
    attempt = start_attempt(assessment, student, assessment.tenant)
    save_answer(attempt, q.id, text_answer="  CAIRO  ")
    submit_attempt(attempt)
    attempt.refresh_from_db()
    answer = attempt.answers.get(question=q)
    assert answer.is_correct is True


def test_submit_leaves_essay_pending():
    student, _, assessment = _enrolled_student_targeted_by_grade()
    q = _link(assessment, question_type=Question.QuestionType.ESSAY)
    attempt = start_attempt(assessment, student, assessment.tenant)
    save_answer(attempt, q.id, text_answer="A long essay...")
    submit_attempt(attempt)
    attempt.refresh_from_db()
    answer = attempt.answers.get(question=q)
    assert answer.is_correct is None
    assert attempt.status == ExamAttempt.Status.SUBMITTED


def test_submit_rejects_double_submit():
    student, _, assessment = _enrolled_student_targeted_by_grade()
    _link(assessment)
    attempt = start_attempt(assessment, student, assessment.tenant)
    submit_attempt(attempt)
    with pytest.raises(ValidationError):
        submit_attempt(attempt)


def test_submit_sets_is_passed_when_passing_score_met():
    student, _, assessment = _enrolled_student_targeted_by_grade()
    assessment.passing_score = Decimal("50.00")  # 50%
    assessment.save(update_fields=["passing_score"])
    q = _link(assessment, points="2.00")
    attempt = start_attempt(assessment, student, assessment.tenant)
    save_answer(attempt, q.id, chosen_option_id=q.options.get(is_correct=True).id)
    submit_attempt(attempt)
    attempt.refresh_from_db()
    assert attempt.is_passed is True
