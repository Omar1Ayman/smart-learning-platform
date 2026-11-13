"""
Phase 8 — Assessment Builder (spec #30-35).

Assessment is deliberately independent of both Course and QuestionBank
(spec #33's own words): it *pulls* questions from banks via
AssessmentQuestion, and it targets students by its own rules, not by
"whoever is enrolled in this course." A Course-scoped exam is just one
possible targeting choice (target the Course's Grade), not the only shape.

AssessmentTarget is intentionally **OR-across-rows**, the opposite of
Content's AND-across-one-row flexible scope (apps/content/models.py) —
spec #33 lists Tenant/Stage/Grade/Group/Multiple-Groups/Specific-Students
as alternative targeting *modes* you pick between, not independent filters
that must all match simultaneously. "Multiple Groups" is just multiple
GROUP-type rows; "Specific Students" is multiple STUDENT-type rows. See
apps/assessments/services.py for how a student's eligibility is resolved
against this (any one matching row is enough).
"""

from django.db import models

from apps.common.models import TenantScopedModel


class Assessment(TenantScopedModel):
    class AssessmentType(models.TextChoices):
        QUIZ = "QUIZ", "Quiz"
        PRACTICE = "PRACTICE", "Practice"
        MONTHLY_EXAM = "MONTHLY_EXAM", "Monthly Exam"
        MIDTERM = "MIDTERM", "Midterm"
        HALF_YEAR_EXAM = "HALF_YEAR_EXAM", "Half-Year Exam"
        FINAL = "FINAL", "Final"
        END_OF_TERM = "END_OF_TERM", "End of Term"
        END_OF_YEAR = "END_OF_YEAR", "End of Year"
        MOCK_EXAM = "MOCK_EXAM", "Mock Exam"
        ASSIGNMENT = "ASSIGNMENT", "Assignment"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"
        CLOSED = "CLOSED", "Closed"
        ARCHIVED = "ARCHIVED", "Archived"

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    assessment_type = models.CharField(max_length=30, choices=AssessmentType.choices)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True
    )

    # Scheduling — spec #32. Optional at the model level (a DRAFT being
    # built step-by-step by the wizard won't have these yet).
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    max_attempts = models.PositiveSmallIntegerField(default=1)
    passing_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    # ---- Entry window policy (Phase A of the exam-window feature) ----
    # Both are OPTIONAL. If both null/zero, an exam whose only schedule
    # is starts_at/ends_at behaves exactly as before: the student can
    # start any time in that window, and their session ends at whichever
    # comes first — duration_minutes from start, or ends_at.
    late_entry_minutes = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text=(
            "Grace period after the effective opens_at during which a "
            "student may still start. Null = no restriction (student can "
            "start any time before closes_at). Set to 30 to enforce a "
            "30-minute late-entry window."
        ),
    )
    entry_cutoff_minutes = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        default=0,
        help_text=(
            "A student must start with at least this many minutes still "
            "remaining until the effective closes_at. 0 = can start any "
            "time before closes_at. Set to 10 to require 10 minutes of "
            "buffer before exam close."
        ),
    )
    # Randomization *settings* (spec #35) — the actual shuffling happens
    # when Phase 9 serves an attempt to a student, not here.
    randomize_question_order = models.BooleanField(default=False)
    randomize_option_order = models.BooleanField(default=False)
    question_count = models.PositiveIntegerField(null=True, blank=True)

    created_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_assessments",
    )

    class Meta:
        db_table = "assessments_assessment"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ends_at__isnull=True)
                | models.Q(starts_at__isnull=True)
                | models.Q(ends_at__gt=models.F("starts_at")),
                name="assessment_end_after_start",
            ),
        ]

    def __str__(self):
        return self.title


class AssessmentQuestion(TenantScopedModel):
    """Only APPROVED questions may be linked — enforced in the serializer,
    re-checked at publish time in case approval was revoked after linking."""

    assessment = models.ForeignKey(
        Assessment, on_delete=models.CASCADE, related_name="assessment_questions"
    )
    question = models.ForeignKey(
        "questions.Question", on_delete=models.RESTRICT, related_name="assessment_links"
    )
    order = models.PositiveSmallIntegerField(default=0)
    points_override = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)

    class Meta:
        db_table = "assessments_question"
        ordering = ["assessment", "order"]
        constraints = [
            models.UniqueConstraint(
                fields=["assessment", "question"], name="uniq_question_per_assessment"
            ),
            models.UniqueConstraint(
                fields=["assessment", "order"], name="uniq_order_per_assessment"
            ),
        ]

    def __str__(self):
        return f"{self.assessment.title} — Q{self.order}"


class AssessmentTarget(TenantScopedModel):
    class TargetType(models.TextChoices):
        TENANT = "TENANT", "Entire tenant"
        STAGE = "STAGE", "Stage"
        GRADE = "GRADE", "Grade"
        GROUP = "GROUP", "Group"
        STUDENT = "STUDENT", "Specific student"

    assessment = models.ForeignKey(Assessment, on_delete=models.CASCADE, related_name="targets")
    target_type = models.CharField(max_length=10, choices=TargetType.choices)
    stage = models.ForeignKey(
        "academics.Stage",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="assessment_targets",
    )
    grade = models.ForeignKey(
        "academics.Grade",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="assessment_targets",
    )
    group = models.ForeignKey(
        "academics.Group",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="assessment_targets",
    )
    student = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="assessment_targets",
    )
    # Per-target window override — enables staggered groups (grade A
    # opens 11:00, grade B opens 12:00) and per-student extra time
    # (Ahmed gets until 12:15). If null, fall back to the parent
    # Assessment's starts_at / ends_at.
    opens_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Override: when THIS target's window opens. Null = use assessment.starts_at.",
    )
    closes_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Override: when THIS target's window closes. Null = use assessment.ends_at.",
    )

    class Meta:
        db_table = "assessments_target"
        constraints = [
            # Exactly the field matching target_type must be set.
            models.CheckConstraint(
                condition=(
                    models.Q(
                        target_type="TENANT",
                        stage__isnull=True,
                        grade__isnull=True,
                        group__isnull=True,
                        student__isnull=True,
                    )
                    | models.Q(
                        target_type="STAGE",
                        stage__isnull=False,
                        grade__isnull=True,
                        group__isnull=True,
                        student__isnull=True,
                    )
                    | models.Q(
                        target_type="GRADE",
                        stage__isnull=True,
                        grade__isnull=False,
                        group__isnull=True,
                        student__isnull=True,
                    )
                    | models.Q(
                        target_type="GROUP",
                        stage__isnull=True,
                        grade__isnull=True,
                        group__isnull=False,
                        student__isnull=True,
                    )
                    | models.Q(
                        target_type="STUDENT",
                        stage__isnull=True,
                        grade__isnull=True,
                        group__isnull=True,
                        student__isnull=False,
                    )
                ),
                name="assessment_target_matches_type",
            ),
        ]

    def __str__(self):
        return f"{self.assessment.title} -> {self.target_type}"
