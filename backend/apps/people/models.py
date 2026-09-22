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

from apps.academics.models import AcademicYear, Course, Group
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
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
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
    # Denormalized from group.academic_year, set once at creation and
    # never client-writable (see EnrollmentSerializer) — kept as its own
    # column purely so "one enrollment per student per year" can be a
    # real DB constraint; Django can't express a uniqueness constraint
    # across a related model's field.
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name="enrollments")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    enrolled_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "people_enrollment"
        constraints = [
            models.UniqueConstraint(
                fields=["student", "academic_year"], name="uniq_enrollment_per_student_per_year"
            ),
        ]
        ordering = ["-academic_year", "group"]

    def __str__(self):
        return f"{self.student.email} — {self.group.name} ({self.academic_year.name})"
