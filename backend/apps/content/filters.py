"""Wave D0b — filter for ContentViewSet.

Adds `content_type__in` so the frontend's "Files / Texts / Links" tabs
can filter server-side with one query. The alternative (client-side on
the loaded page) breaks silently once a school has more than ~100
content items — the tabs would show only items from page 1.
"""

import django_filters as df

from .models import Content


class ContentFilter(df.FilterSet):
    content_type__in = df.BaseInFilter(field_name="content_type", lookup_expr="in")
    is_published = df.BooleanFilter()

    class Meta:
        model = Content
        fields = {
            "content_type": ["exact"],
            "is_published": ["exact"],
            "stage": ["exact"],
            "grade": ["exact"],
            "group": ["exact"],
            "subject": ["exact"],
            "course": ["exact"],
            "chapter": ["exact"],
            "lesson": ["exact"],
            "academic_year": ["exact"],
            "term": ["exact"],
        }
