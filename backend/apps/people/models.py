"""
Phase 5 — People & Relationships. Two models that finally make the
academic structure built in Phase 4 mean something for actual people:

- TeacherAssignment: who teaches what (spec #22). Deliberately keyed on
  Course (which already encodes Subject + Grade) rather than a pile of
  independently-nullable Stage/Grade/Group/Subject/Course fields — a
  looser shape would be more "flexible" on paper but would make "what can
  this teacher actually see" much harder to compute correctly, and spec
  #22's own example (Teacher -> Subject -> Grade -> Groups) is exactly
  what Course + an optional Group narrowing already models.

- Enrollment: a student's placement in one Group for one AcademicYear,
  never overwritten across years (spec #23) — Promotion (see
  apps/people/views.py) always creates a new row for a new year rather
  than mutating an old one.
"""

from django.db import models

from apps.academics.models import AcademicYear, Course, Group, Term
from apps.common.models import TenantScopedModel


class TeacherAssignment(TenantScopedModel):
    teacher = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="teaching_assignments",
        limit_choices_to={"role": "TEACHER"},
    )
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="teacher_assignments")
    # Empty = the whole grade under this course (every current and future
    # Group there); non-empty = narrowed to specific groups. This is what
    # lets "Teacher Ahmed -> Biology -> First Secondary -> Group A + B"
    # (spec #12's own example) be expressed directly.
    groups = models.ManyToManyField(Group, blank=True, related_name="teacher_assignments")

    class Meta:
        db_table = "people_teacher_assignment"
        constraints = [
            models.UniqueConstraint(fields=["teacher", "course"], name="uniq_teacher_per_course"),
        ]
        ordering = ["teacher", "course"]

    def __str__(self):
        return f"{self.teacher.email} — {self.course.name}"



class Enrollment(TenantScopedModel):
    """A student's placement in one Group for one AcademicYear (or one
    Term within it), never overwritten across years (spec #23).

    Wave 31 — `term` is OPTIONAL:
    - NULL = enrolled for the whole year (default, ~90% of cases).
    - Set  = enrolled only for that term, allowing mid-year group
             transfers (student was in group A term 1, group B term 2).

    The two partial unique constraints together reproduce "one enrollment
    per student per year" when term is null, and "one enrollment per
    student per year-term" when term is set. This is the PG-version-safe
    equivalent of `nulls_distinct=False` (which would require PG 15+).
    """

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        COMPLETED = "COMPLETED", "Completed"
        FAILED = "FAILED", "Failed"
        INACTIVE = "INACTIVE", "Inactive"
        SUSPENDED = "SUSPENDED", "Suspended"
        TRANSFERRED = "TRANSFERRED", "Transferred"
        GRADUATED = "GRADUATED", "Graduated"
        ARCHIVED = "ARCHIVED", "Archived"

    student = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="enrollments",
        limit_choices_to={"role": "STUDENT"},
    )
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="enrollments")
    academic_year = models.ForeignKey(
        AcademicYear, on_delete=models.CASCADE, related_name="enrollments"
    )
    # Wave 31 — optional term scoping for mid-year transfers.
    term = models.ForeignKey(
        Term,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="enrollments",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    enrolled_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "people_enrollment"
        constraints = [
            # One enrollment per student per year when term is null.
            models.UniqueConstraint(
                fields=["student", "academic_year"],
                condition=models.Q(term__isnull=True),
                name="uniq_enrollment_per_student_year_no_term",
            ),
            # One enrollment per student per (year, term) when term is set.
            models.UniqueConstraint(
                fields=["student", "academic_year", "term"],
                condition=models.Q(term__isnull=False),
                name="uniq_enrollment_per_student_year_term",
            ),
        ]
        ordering = ["-academic_year", "group"]

    def __str__(self):
        suffix = f" · {self.term.name}" if self.term_id else ""
        return f"{self.student.email} — {self.group.name} ({self.academic_year.name}{suffix})"

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.term_id and self.term.academic_year_id != self.academic_year_id:
            raise ValidationError(
                {"term": "الترم المختار لا ينتمي للسنة الدراسية المحددة."}
            )