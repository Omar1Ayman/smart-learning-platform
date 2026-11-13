"""Wave D0c-1 — filter for QuestionViewSet.

Adds `review_status__in` and `question_type__in` so the tabs (status)
and the type filter can narrow the queryset server-side. Without this,
filtering by "pending" on a page of 20 shows only the pending items on
that page — not the true pending count across the whole bank.
"""

import django_filters as df

from .models import Question


class QuestionFilter(df.FilterSet):
    review_status__in = df.BaseInFilter(field_name="review_status", lookup_expr="in")
    question_type__in = df.BaseInFilter(field_name="question_type", lookup_expr="in")

    class Meta:
        model = Question
        fields = {
            "bank": ["exact"],
            "question_type": ["exact"],
            "difficulty": ["exact"],
            "review_status": ["exact"],
            "is_archived": ["exact"],
        }
