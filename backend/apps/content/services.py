"""
spec #27's example, made literal: content scoped to (grade=First
Secondary, subject=Biology, term=Term 1) — with no group set at all —
must be visible to every eligible student in that grade, regardless of
which Group they're actually in. The rule this implements: a Content row
is visible to a student if, for *every one* of its scope fields that is
non-null, the student's own academic context matches it. An unset field
imposes no restriction at all.

H-1 FIX (Wave Zero): the enrollment lookup below used to filter by
`student=student` only, ignoring `status`. A student whose enrollment
was SUSPENDED, TRANSFERRED, GRADUATED, INACTIVE, or ARCHIVED would
still see every piece of content the school had ever published for
their historical grade — a real data-leak scenario if a school suspends
a student for non-payment or transfers them to another institution.
"""

from django.db.models import Q

from apps.academics.models import Chapter, Course, Lesson
from apps.people.models import Enrollment

from .models import Content


def visible_content_for_student(tenant, student):
    """Returns a Content queryset for exactly what this student is
    eligible to see, based on their *current, active* enrollment.

    A student with no active enrollment sees nothing — there is no
    academic context to match against. A student whose most recent
    enrollment is SUSPENDED/TRANSFERRED/etc. sees nothing either (H-1).
    """
    enrollment = (
        Enrollment.objects.for_tenant(tenant)
        .filter(student=student, status=Enrollment.Status.ACTIVE)  # H-1
        .select_related("group", "group__grade", "group__grade__stage", "academic_year")
        .order_by("-academic_year__start_date")
        .first()
    )
    if enrollment is None:
        return Content.objects.none()

    grade = enrollment.group.grade
    group = enrollment.group
    stage = grade.stage
    academic_year = enrollment.academic_year

    course_ids = list(
        Course.objects.filter(tenant=tenant, grade=grade).values_list("id", flat=True)
    )
    subject_ids = list(
        Course.objects.filter(tenant=tenant, grade=grade)
        .values_list("subject_id", flat=True)
        .distinct()
    )
    chapter_ids = list(
        Chapter.objects.filter(tenant=tenant, course_id__in=course_ids).values_list(
            "id", flat=True
        )
    )
    lesson_ids = list(
        Lesson.objects.filter(tenant=tenant, chapter_id__in=chapter_ids).values_list(
            "id", flat=True
        )
    )

    qs = Content.objects.for_tenant(tenant).filter(is_published=True)
    qs = qs.filter(Q(stage__isnull=True) | Q(stage=stage))
    qs = qs.filter(Q(grade__isnull=True) | Q(grade=grade))
    qs = qs.filter(Q(group__isnull=True) | Q(group=group))
    qs = qs.filter(Q(subject__isnull=True) | Q(subject_id__in=subject_ids))
    qs = qs.filter(Q(course__isnull=True) | Q(course_id__in=course_ids))
    qs = qs.filter(Q(chapter__isnull=True) | Q(chapter_id__in=chapter_ids))
    qs = qs.filter(Q(lesson__isnull=True) | Q(lesson_id__in=lesson_ids))
    qs = qs.filter(Q(academic_year__isnull=True) | Q(academic_year=academic_year))
    qs = qs.filter(Q(term__isnull=True) | Q(term__academic_year=academic_year))
    return qs