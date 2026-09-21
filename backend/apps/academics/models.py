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
