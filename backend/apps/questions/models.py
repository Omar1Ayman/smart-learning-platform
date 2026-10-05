"""
Phase 7 — Question Bank + review workflow (spec #28/#29).

Three rules this module exists to enforce, in order of importance:

1. A Teacher can never approve their own question — or anyone's. Review
   state (`review_status`, `reviewed_by`, `reviewed_at`) is never a
   client-writable serializer field; it only changes through the
   `approve`/`reject` actions on QuestionViewSet, which are OWNER/ADMIN
   only. See apps/questions/views.py.
2. Correct answers (`QuestionOption.is_correct`, `Question.accepted_answers`,
   `Question.explanation`) are staff-only data. Students have no access to
   these endpoints at all, and `QuestionForStudentSerializer` (the shape
   Phase 8/9's exam engine must use) structurally contains none of them.
3. Nothing already referenced by history can vanish silently — `RESTRICT`
   on Question.bank means a bank with questions can't be deleted by
   accident, while a whole-Tenant delete (which cascades to both) still
   works. Phase 8/9 should use the same on_delete for anything that
   references a Question or QuestionOption.
"""

from django.db import models

from apps.common.models import TenantScopedModel


class QuestionBank(TenantScopedModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    subject = models.ForeignKey(
        "academics.Subject", null=True, blank=True, on_delete=models.SET_NULL, related_name="question_banks"
    )
    grade = models.ForeignKey(
        "academics.Grade", null=True, blank=True, on_delete=models.SET_NULL, related_name="question_banks"
    )
    is_archived = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="question_banks"
    )

    class Meta:
        db_table = "questions_bank"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["tenant", "name"], name="uniq_question_bank_name_per_tenant"),
        ]

    def __str__(self):
        return self.name


class Question(TenantScopedModel):
    class QuestionType(models.TextChoices):
        MCQ = "MCQ", "Multiple choice (one correct)"
        TRUE_FALSE = "TRUE_FALSE", "True / False"
        SHORT_ANSWER = "SHORT_ANSWER", "Short answer"
        ESSAY = "ESSAY", "Essay (manually graded)"

    class Difficulty(models.TextChoices):
        EASY = "EASY", "Easy"
        MEDIUM = "MEDIUM", "Medium"
        HARD = "HARD", "Hard"

    class ReviewStatus(models.TextChoices):
        PENDING = "PENDING", "Pending review"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    bank = models.ForeignKey(QuestionBank, on_delete=models.RESTRICT, related_name="questions")
    text = models.TextField()
    question_type = models.CharField(max_length=20, choices=QuestionType.choices)
    difficulty = models.CharField(max_length=10, choices=Difficulty.choices, default=Difficulty.MEDIUM)
    topic = models.CharField(max_length=255, blank=True, default="")
    points = models.DecimalField(max_digits=6, decimal_places=2, default=1)

    # Staff-only answer data — see module docstring, rule 2.
    accepted_answers = models.JSONField(default=list, blank=True)  # SHORT_ANSWER only
    explanation = models.TextField(blank=True, default="")

    # Review workflow — never client-writable, see module docstring, rule 1.
    review_status = models.CharField(
        max_length=10, choices=ReviewStatus.choices, default=ReviewStatus.PENDING, db_index=True
    )
    reviewed_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="reviewed_questions"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.TextField(blank=True, default="")

    is_archived = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="authored_questions"
    )

    class Meta:
        db_table = "questions_question"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(condition=models.Q(points__gt=0), name="question_points_positive"),
        ]
        indexes = [
            models.Index(fields=["tenant", "bank", "review_status"], name="question_bank_review_idx"),
            models.Index(fields=["tenant", "created_by"], name="question_author_idx"),
        ]

    def __str__(self):
        return self.text[:60]


class QuestionOption(TenantScopedModel):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="options")
    text = models.CharField(max_length=500)
    is_correct = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "questions_option"
        ordering = ["question", "order"]
        constraints = [
            models.UniqueConstraint(fields=["question", "order"], name="uniq_option_order_per_question"),
            # At most one correct option per question, enforced by the
            # database itself — so a bug can never make single-answer
            # scoring ambiguous. (At-least-one is checked in the
            # serializer; Postgres can't express it as a constraint.)
            # Drop this if a multi-select question type is ever added.
            models.UniqueConstraint(
                fields=["question"],
                condition=models.Q(is_correct=True),
                name="uniq_single_correct_option_per_question",
            ),
        ]

    def __str__(self):
        return self.text[:60]
