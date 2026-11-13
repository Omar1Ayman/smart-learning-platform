"""
Phase 9 — Exam engine (spec #36-45).

Two models, deliberately in a separate app from `assessments`:

- `assessments` = *authoring* (staff-only: build an exam, target students,
  publish). Permissions: IsStaffMember/IsStaffForWriteActions.
- `exam_engine` = *taking* (student-facing, highest-security surface).
  Permissions: a student may only touch their own attempt.

Mixing them into one app would blur the permission boundary in exactly
the place where a mistake (a student reaching an authoring endpoint, or
a staff member mutating a student's answer) is most costly. Phase 10's
anti-cheat events will land here too — they're attempts, not assessment
metadata.

Key data-integrity decisions:

1. `question_order` / `option_order` are snapshotted at start (JSON on
   the attempt) — randomizing per-request would mean a student who
   refreshes sees a different question order mid-attempt, which is
   disorienting and confusing to audit. Snapshot once, serve from the
   snapshot.

2. `max_score` is snapshotted at start from the sum of question points
   (with `points_override` honored per-link). If a question is
   retroactively edited, already-submitted attempts stay scored against
   the exam they actually took — not the current state of the exam.

3. `RESTRICT` on `attempt → assessment` and `answer → question`: a
   published exam with attempts cannot be silently deleted. Same
   principle as `Question.bank` (Phase 7) — archive, don't delete.

4. `passing_score` is interpreted as a **percentage** (0-100). Computed
   in `compute_is_passed()`. Documented here so it's a one-line change
   if a future spec reinterprets it as a raw score.
"""

from django.db import models
from django.utils import timezone

from apps.common.models import TenantScopedModel


class ExamAttempt(TenantScopedModel):
    class Status(models.TextChoices):
        IN_PROGRESS = "IN_PROGRESS", "In progress"
        SUBMITTED = "SUBMITTED", "Submitted (awaiting grading)"
        GRADED = "GRADED", "Graded"
        EXPIRED = "EXPIRED", "Expired without submit"
        VOIDED = "VOIDED", "Voided by staff"

    assessment = models.ForeignKey(
        "assessments.Assessment",
        on_delete=models.RESTRICT,
        related_name="attempts",
    )
    student = models.ForeignKey(
        "accounts.User",
        on_delete=models.RESTRICT,
        related_name="exam_attempts",
        limit_choices_to={"role": "STUDENT"},
    )
    attempt_number = models.PositiveSmallIntegerField(default=1)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.IN_PROGRESS, db_index=True
    )

    started_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    graded_at = models.DateTimeField(null=True, blank=True)

    # Snapshotted at start — see module docstring, points 1-2.
    question_order = models.JSONField(default=list, blank=True)  # [question_id, ...]
    option_order = models.JSONField(default=dict, blank=True)  # {question_id: [option_id, ...]}
    max_score = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    score = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    is_passed = models.BooleanField(null=True, blank=True)

    class Meta:
        db_table = "exam_attempt"
        ordering = ["-started_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["student", "assessment", "attempt_number"],
                name="uniq_attempt_number_per_student_assessment",
            ),
            models.CheckConstraint(
                condition=models.Q(expires_at__isnull=True)
                | models.Q(expires_at__gt=models.F("started_at")),
                name="attempt_expiry_after_start",
            ),
            models.CheckConstraint(
                condition=models.Q(score__isnull=True) | models.Q(score__gte=0),
                name="attempt_score_non_negative",
            ),
            models.CheckConstraint(
                condition=models.Q(score__isnull=True) | models.Q(score__lte=models.F("max_score")),
                name="attempt_score_le_max",
            ),
        ]
        indexes = [
            models.Index(fields=["tenant", "student", "status"], name="attempt_student_status_idx"),
            models.Index(fields=["tenant", "assessment", "status"], name="attempt_assessment_status_idx"),
        ]

    def __str__(self):
        return f"{self.student.email} — {self.assessment.title} #{self.attempt_number}"

    @property
    def percentage(self):
        """Percentage score, 0-100. Returns 0 when nothing has been
        graded yet (or the exam has no points — degenerate but possible)."""
        if not self.max_score or self.max_score == 0:
            return 0.0
        return float(self.score or 0) / float(self.max_score) * 100.0

    def is_expired(self, now=None):
        """True if the timer has elapsed — used by the submit service to
        auto-expire a stale IN_PROGRESS attempt instead of grading it."""
        if self.expires_at is None:
            return False
        return (now or timezone.now()) >= self.expires_at

    def compute_is_passed(self):
        """Spec #36's 'pass' threshold. `passing_score` on the assessment
        is interpreted as a percentage (0-100) — see module docstring
        point 4. Returns None if there's no threshold set, which means
        'completed, not pass/fail'."""
        passing = self.assessment.passing_score
        if passing is None or self.score is None:
            return None
        return self.percentage >= float(passing)


class AttemptAnswer(TenantScopedModel):
    attempt = models.ForeignKey(ExamAttempt, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(
        "questions.Question",
        on_delete=models.RESTRICT,
        related_name="attempt_answers",
    )
    chosen_option = models.ForeignKey(
        "questions.QuestionOption",
        on_delete=models.RESTRICT,
        null=True,
        blank=True,
        related_name="attempt_answers",
    )
    text_answer = models.TextField(blank=True, default="")

    # Both nullable until grading runs (automatic for MCQ/TF/SHORT_ANSWER,
    # manual for ESSAY). A null is_correct that stays null means "awaiting
    # manual grading" — deliberately distinct from "graded as wrong".
    is_correct = models.BooleanField(null=True, blank=True)
    awarded_points = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    graded_at = models.DateTimeField(null=True, blank=True)
    graded_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="graded_answers",
    )

    class Meta:
        db_table = "exam_attempt_answer"
        ordering = ["attempt", "question"]
        constraints = [
            models.UniqueConstraint(
                fields=["attempt", "question"], name="uniq_answer_per_attempt_question"
            ),
            models.CheckConstraint(
                condition=models.Q(awarded_points__isnull=True) | models.Q(awarded_points__gte=0),
                name="answer_awarded_points_non_negative",
            ),
        ]

    def __str__(self):
        return f"{self.attempt} — Q{self.question_id}"
    
    
class AttemptEvent(TenantScopedModel):
    """Suspicious activity during an exam attempt.

    We log only *objective*, browser-observable signals. No keystroke
    logging, no screenshots, no camera — those would be invasive and
    legally risky for a K-12 platform. The teacher reviews events and
    decides; nothing here auto-fails an attempt.
    """

    class EventType(models.TextChoices):
        TAB_HIDDEN = "TAB_HIDDEN", "Tab hidden"
        COPY_ATTEMPT = "COPY_ATTEMPT", "Copy attempt"
        PASTE_ATTEMPT = "PASTE_ATTEMPT", "Paste attempt"
        RIGHT_CLICK = "RIGHT_CLICK", "Right click"
        FULLSCREEN_EXIT = "FULLSCREEN_EXIT", "Fullscreen exit"
        DEVTOOLS_OPEN = "DEVTOOLS_OPEN", "DevTools opened"

    attempt = models.ForeignKey(
        "exam_engine.ExamAttempt", on_delete=models.CASCADE, related_name="events"
    )
    event_type = models.CharField(max_length=30, choices=EventType.choices)
    metadata = models.JSONField(default=dict, blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "exam_attempt_event"
        ordering = ["-occurred_at"]
        indexes = [
            models.Index(fields=["tenant", "attempt", "-occurred_at"]),
        ]

    def __str__(self):
        return f"{self.attempt_id} — {self.event_type}"