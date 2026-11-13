"""Wave Zero — C-4 + C-5: exam attempt edge cases.

C-4: An expired attempt used to transition to EXPIRED with no grading,
losing the student's partial credit. Fixed: on expiry the attempt is
auto-graded (submit_attempt(expired=True)) so the student's saved
answers are scored.

C-5: Two concurrent start_attempt calls used to race on
`uniq_attempt_number_per_student_assessment`, surfacing as a raw 500.
Fixed: the create is wrapped in a savepoint; on IntegrityError the
winner (existing IN_PROGRESS attempt) is returned.

Fix history (test C-5):
  - v1 tried to simulate the race by creating the row AND raising
    IntegrityError inside start_attempt's own savepoint — but that
    rolled back the "winner" too, so the except-block's recovery query
    found nothing.
  - v2 pre-created the winner outside, but monkeypatched the FIRST
    for_tenant call unconditionally — which turned out to be the
    Enrollment lookup inside `is_student_targeted()`, not the
    ExamAttempt existing-check. That made the student look
    unenrolled, raising "أنت غير مستهدف" before we ever reached the
    race.
  - v3 (this version) filters the mock by `self.model is ExamAttempt`
    so the enrollment lookup passes through normally, and ONLY the
    first ExamAttempt.for_tenant (the existing-check) is blanked.
"""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.assessments.models import AssessmentQuestion, AssessmentTarget
from apps.common.models import TenantScopedManager
from apps.exam_engine.models import ExamAttempt
from apps.exam_engine.services import save_answer, start_attempt
from apps.people.models import Enrollment
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


def _setup_attempt():
    """One MCQ question, one enrolled student, a published assessment."""
    group = GroupFactory()
    student = StudentUserFactory(tenant=group.tenant)
    EnrollmentFactory(
        tenant=group.tenant,
        student=student,
        group=group,
        academic_year=group.academic_year,
    )
    assessment = AssessmentFactory(
        tenant=group.tenant, status="PUBLISHED", duration_minutes=30
    )
    AssessmentTarget.objects.create(
        tenant=group.tenant,
        assessment=assessment,
        target_type="GRADE",
        grade=group.grade,
    )
    bank = QuestionBankFactory(tenant=group.tenant)
    q = QuestionFactory(
        bank=bank,
        tenant=group.tenant,
        question_type=Question.QuestionType.MCQ,
        points="2.00",
        approved=True,
        created_by=TeacherUserFactory(tenant=group.tenant),
    )
    correct = q.options.create(tenant=group.tenant, text="A", is_correct=True, order=1)
    q.options.create(tenant=group.tenant, text="B", is_correct=False, order=2)
    AssessmentQuestion.objects.create(
        tenant=group.tenant, assessment=assessment, question=q, order=1
    )
    attempt = start_attempt(assessment, student, group.tenant)
    return attempt, student, correct, assessment


# ---- C-4: expired attempt grading ----


def test_expired_attempt_is_graded_on_save_answer():
    """C-4: before the fix, save_answer on an expired attempt simply set
    status=EXPIRED without grading. The student saw the exam disappear
    and lost partial credit forever."""
    attempt, _student, correct, _assessment = _setup_attempt()

    # Save one correct answer while still in progress.
    save_answer(attempt, attempt.question_order[0], chosen_option_id=correct.id)

    # Backdate expires_at to simulate the timer having passed
    # (started_at is auto_now_add, so we must use .update()).
    ExamAttempt.objects.filter(pk=attempt.pk).update(
        started_at=timezone.now() - timedelta(hours=2),
        expires_at=timezone.now() - timedelta(hours=1),
    )
    attempt.refresh_from_db()
    assert attempt.is_expired() is True

    # Try to save another answer — should trigger auto-grade + raise.
    with pytest.raises(ValidationError):
        save_answer(attempt, attempt.question_order[0], chosen_option_id=correct.id)

    attempt.refresh_from_db()
    # Must be graded (or submitted-pending-essays), NOT just EXPIRED.
    assert attempt.status in (
        ExamAttempt.Status.SUBMITTED,
        ExamAttempt.Status.GRADED,
    )
    assert attempt.score is not None
    assert Decimal(attempt.score) == Decimal("2.00")


# ---- C-5: concurrent start_attempt ----


def test_start_attempt_returns_winner_on_create_race(monkeypatch):
    """C-5: two parallel start_attempt calls both pass the existing-check
    before either creates. The loser's create() collides on
    `uniq_attempt_number_per_student_assessment`; the fix's except block
    re-queries for IN_PROGRESS and returns the winner instead of raising.

    F-17 FIX (Milestone 0, Batch 2): the previous version was written for
    the ORIGINAL fix, which computed `next_number = used + 1` and therefore
    produced a collision whenever the winner already existed. The code was
    later changed (post-review fix) to compute `next_number = MAX + 1` to
    handle VOIDED attempts — which means `used + 1 == 0 + 1 == 1` while
    `MAX + 1 == 1 + 1 == 2`, so the old test's assumption no longer held.

    The current version simulates the race correctly: it patches BOTH
    ExamAttempt.for_tenant calls that matter — the existing-check (call #1)
    AND the MAX query (call #3) — so the code computes next_number = 1
    while the winner already occupies attempt_number = 1. The CREATE then
    hits a real IntegrityError, and the except-block recovery returns the
    winner.

    Call sequence inside start_attempt (verified against apps/exam_engine/
    services.py):
      #1  existing = ExamAttempt.for_tenant(...).filter(status=IN_PROGRESS)
      #2  used = ExamAttempt.for_tenant(...).filter(status__in=consumed)
      #3  last_number = ExamAttempt.for_tenant(...).aggregate(Max(...))
      #4  winner = ExamAttempt.for_tenant(...)      ← only in except-block
    """
    group = GroupFactory()
    student = StudentUserFactory(tenant=group.tenant)
    EnrollmentFactory(
        tenant=group.tenant,
        student=student,
        group=group,
        academic_year=group.academic_year,
    )
    assessment = AssessmentFactory(
        tenant=group.tenant, status="PUBLISHED", duration_minutes=30
    )
    AssessmentTarget.objects.create(
        tenant=group.tenant,
        assessment=assessment,
        target_type="GRADE",
        grade=group.grade,
    )
    bank = QuestionBankFactory(tenant=group.tenant)
    q = QuestionFactory(
        bank=bank,
        tenant=group.tenant,
        question_type=Question.QuestionType.MCQ,
        points="2.00",
        approved=True,
        created_by=TeacherUserFactory(tenant=group.tenant),
    )
    q.options.create(tenant=group.tenant, text="A", is_correct=True, order=1)
    q.options.create(tenant=group.tenant, text="B", is_correct=False, order=2)
    AssessmentQuestion.objects.create(
        tenant=group.tenant, assessment=assessment, question=q, order=1
    )

    # 1. Pre-create the "winner" — attempt_number=1, IN_PROGRESS.
    winner = ExamAttempt.objects.create(
        tenant=group.tenant,
        assessment=assessment,
        student=student,
        attempt_number=1,
        question_order=[],
        option_order={},
        max_score=Decimal("0"),
        expires_at=None,
        status=ExamAttempt.Status.IN_PROGRESS,
    )

    # 2. Simulate the race: patch the first TWO ExamAttempt.for_tenant
    #    calls that start_attempt makes BEFORE the create():
    #      #1 existing-check  → return none (simulate "no attempt exists yet")
    #      #3 MAX query       → return none (simulate "MAX = 0")
    #    Note: call #2 (used-count) must pass through — it needs to see
    #    the real winner and return 0 (winner is IN_PROGRESS, not consumed).
    #    Enrollment.for_tenant() calls (inside is_student_targeted) must
    #    pass through as well — the student is genuinely enrolled.
    original_for_tenant = TenantScopedManager.for_tenant
    attempt_calls = {"n": 0}

    def selective_for_tenant(self, tenant):
        qs = original_for_tenant(self, tenant)
        if self.model is ExamAttempt:
            attempt_calls["n"] += 1
            # Blank calls #1 (existing-check) and #3 (MAX query).
            if attempt_calls["n"] in (1, 3):
                return qs.none()
        return qs

    monkeypatch.setattr(TenantScopedManager, "for_tenant", selective_for_tenant)

    # 3. Run start_attempt. Expected flow:
    #    - is_student_targeted → Enrollment.for_tenant (passthrough) → OK
    #    - ExamAttempt.for_tenant #1 (existing-check) → blanked → passes
    #    - ExamAttempt.for_tenant #2 (used-count) → real → 0
    #    - ExamAttempt.for_tenant #3 (MAX query) → blanked → last_number=0
    #      → next_number=1
    #    - create(attempt_number=1) → IntegrityError (winner has #1)
    #    - ExamAttempt.for_tenant #4 (recovery) → finds winner → returns it
    result = start_attempt(assessment, student, group.tenant)

    assert result.id == winner.id
    assert result.status == ExamAttempt.Status.IN_PROGRESS
    assert result.student_id == student.id

    # Exactly 4 ExamAttempt.for_tenant calls (existing-check, used-count,
    # MAX, recovery). If a future refactor added/removed one, this catches
    # the mock-mismatch early.
    assert attempt_calls["n"] == 4

    # Sanity: the create attempt must NOT have succeeded — a second row
    # would mean the race simulation didn't fire.
    assert (
        ExamAttempt.objects.filter(assessment=assessment, student=student).count() == 1
    )