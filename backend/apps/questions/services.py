"""Question duplication service.

Mirrors the pattern already used by Assessment and Course duplication:
a full copy is created, name gets "(نسخة)" suffix (numbered if needed),
ownership transfers to the actor, and review state resets to PENDING.

Unlike Assessment/Course, Question has no unique constraint on `text`,
so the suffix is a UX affordance — two identical-text questions are
legal at the DB level, but users expect a "(نسخة)" label to distinguish
them in the bank view.
"""

from django.db import transaction

from apps.accounts.models import User
from apps.common.utils import unique_copy_name

from .models import Question, QuestionOption


def duplicate_question(question: Question, actor: User) -> Question:
    """Create a full copy of `question` as a new PENDING question owned
    by `actor`. Options are copied verbatim (text, is_correct, order).

    Policy decisions:
      - `created_by` → actor (the duplicator owns the copy — matches
        Assessment/Course behavior).
      - `review_status` → PENDING always, regardless of source state.
        A duplicate is a NEW question; the original's approval does not
        carry over. This closes a potential bypass: a teacher who can't
        approve their own question could duplicate an approved one and
        inherit its approval.
      - `reviewed_by` / `reviewed_at` / `review_note` → cleared.
      - `accepted_answers`, `explanation`, `difficulty`, `topic`, `points`
        → copied as-is (they're content, not workflow state).
      - `is_archived` → reset to False (the copy should be active).
    """
    new_text = unique_copy_name(
        question.text,
        lambda name: (
            Question.objects.for_tenant(question.tenant)
            .filter(bank=question.bank, text=name)
            .exists()
        ),
    )

    with transaction.atomic():
        copy = Question.objects.create(
            tenant=question.tenant,
            bank=question.bank,
            text=new_text,
            question_type=question.question_type,
            difficulty=question.difficulty,
            topic=question.topic,
            points=question.points,
            accepted_answers=question.accepted_answers or [],
            explanation=question.explanation,
            created_by=actor,
            review_status=Question.ReviewStatus.PENDING,
            reviewed_by=None,
            reviewed_at=None,
            review_note="",
            is_archived=False,
        )
        for opt in question.options.all().order_by("order"):
            QuestionOption.objects.create(
                tenant=question.tenant,
                question=copy,
                text=opt.text,
                is_correct=opt.is_correct,
                order=opt.order,
            )
    return copy
