"""
Academic structure: AcademicYear -> Term, and Stage -> Grade -> Group,
plus Subject as an independent entity. Course/Chapter/Lesson build on top
of these next (see PROJECT_MEMORY.md #5) — deliberately not added yet so
this slice stays reviewable and testable on its own, per spec #86
(Understand -> Design -> Implement -> Test -> Review -> Document, one
slice at a time, not all of it unreviewed at once).
"""

from django.db import models

from apps.common.models import TenantScopedModel


class AcademicYear(TenantScopedModel):
    name = models.CharField(max_length=50)  # e.g. "2026/2027"
    start_date = models.DateField()
    end_date = models.DateField()
    is_active = models.BooleanField(default=False)

    class Meta:
        db_table = "academics_year"
        ordering = ["-start_date"]
        constraints = [
            models.UniqueConstraint(fields=["tenant", "name"], name="uniq_academic_year_name_per_tenant"),
            models.CheckConstraint(
                condition=models.Q(end_date__gt=models.F("start_date")), name="academic_year_end_after_start"
            ),
        ]

    def __str__(self):
        return self.name


class Term(TenantScopedModel):
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name="terms")
    name = models.CharField(max_length=50)  # e.g. "Term 1"
    start_date = models.DateField()
    end_date = models.DateField()
    order = models.PositiveSmallIntegerField(default=1)

    class Meta:
        db_table = "academics_term"
        ordering = ["academic_year", "order"]
        constraints = [
            models.UniqueConstraint(fields=["academic_year", "name"], name="uniq_term_name_per_year"),
            models.CheckConstraint(
                condition=models.Q(end_date__gt=models.F("start_date")), name="term_end_after_start"
            ),
        ]

    def __str__(self):
        return f"{self.academic_year.name} — {self.name}"


class Stage(TenantScopedModel):
    name = models.CharField(max_length=100)  # e.g. "Secondary"
    order = models.PositiveSmallIntegerField(default=1)

    class Meta:
        db_table = "academics_stage"
        ordering = ["order", "name"]
        constraints = [
            models.UniqueConstraint(fields=["tenant", "name"], name="uniq_stage_name_per_tenant"),
        ]

    def __str__(self):
        return self.name


class Grade(TenantScopedModel):
    stage = models.ForeignKey(Stage, on_delete=models.CASCADE, related_name="grades")
    name = models.CharField(max_length=100)  # e.g. "First Secondary"
    order = models.PositiveSmallIntegerField(default=1)

    class Meta:
        db_table = "academics_grade"
        ordering = ["stage", "order"]
        constraints = [
            models.UniqueConstraint(fields=["stage", "name"], name="uniq_grade_name_per_stage"),
        ]

    def __str__(self):
        return f"{self.stage.name} — {self.name}"


class Group(TenantScopedModel):
    grade = models.ForeignKey(Grade, on_delete=models.CASCADE, related_name="groups")
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name="groups")
    name = models.CharField(max_length=100)  # e.g. "Group A"
    capacity = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        db_table = "academics_group"
        ordering = ["grade", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["grade", "academic_year", "name"], name="uniq_group_name_per_grade_year"
            ),
        ]

    def __str__(self):
        return f"{self.grade.name} — {self.name} ({self.academic_year.name})"


class Subject(TenantScopedModel):
    name = models.CharField(max_length=100)  # e.g. "Biology"
    code = models.CharField(max_length=20, blank=True, default="")

    class Meta:
        db_table = "academics_subject"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["tenant", "name"], name="uniq_subject_name_per_tenant"),
        ]

    def __str__(self):
        return self.name


class Course(TenantScopedModel):
    """A course is "Biology for First Secondary" — conceptual, reusable
    across academic years. *Who teaches it* is deliberately not a field
    here: spec #22 is explicit that Course -> Teacher must not be the only
    modeling path (one teacher can teach many groups; more than one
    teacher can share a subject). That's TeacherAssignment's job
    (Phase 5) — Course only knows its Subject and Grade."""

    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name="courses")
    grade = models.ForeignKey(Grade, on_delete=models.CASCADE, related_name="courses")
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "academics_course"
        ordering = ["grade", "subject", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["grade", "subject", "name"], name="uniq_course_name_per_grade_subject"
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.grade.name})"


class Chapter(TenantScopedModel):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="chapters")
    name = models.CharField(max_length=150)
    order = models.PositiveSmallIntegerField(default=1)

    class Meta:
        db_table = "academics_chapter"
        ordering = ["course", "order"]
        constraints = [
            models.UniqueConstraint(fields=["course", "order"], name="uniq_chapter_order_per_course"),
        ]

    def __str__(self):
        return f"{self.course.name} — {self.name}"


class Lesson(TenantScopedModel):
    chapter = models.ForeignKey(Chapter, on_delete=models.CASCADE, related_name="lessons")
    name = models.CharField(max_length=150)
    order = models.PositiveSmallIntegerField(default=1)
    # Deliberately no content/body fields here — attaching PDFs, videos,
    # text, etc. at a flexible scope (spec #26/27) is Content's job
    # (Phase 6), not Lesson's. A Lesson is a slot Content attaches to.

    class Meta:
        db_table = "academics_lesson"
        ordering = ["chapter", "order"]
        constraints = [
            models.UniqueConstraint(fields=["chapter", "order"], name="uniq_lesson_order_per_chapter"),
        ]

    def __str__(self):
        return f"{self.chapter.name} — {self.name}"
