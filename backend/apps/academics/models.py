"""
Academic structure: AcademicYear -> Term, and Stage -> Grade -> Group,
plus Subject as an independent entity. Course/Chapter/Lesson build on top
of these next — deliberately not added yet so this slice stays reviewable
and testable on its own, per spec #86 (Understand -> Design -> Implement ->
Test -> Review -> Document, one slice at a time, not all of it unreviewed
at once).
"""

from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

from apps.common.models import TenantScopedModel


class AcademicYear(TenantScopedModel):
    """السنة الدراسية — حاوية كل شيء في النظام.

    State Machine:
        DRAFT    → سنة جديدة تُعدّ، لا عمليات تعليمية
        ACTIVE   → السنة النشطة، كل شيء يعمل
        CLOSING  → قيد الإغلاق، لا تسجيلات جديدة
        ARCHIVED → قراءة فقط، محفوظة للأبد

    قاعدة: لا يمكن وجود أكثر من سنة ACTIVE واحدة في نفس المؤسسة.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "إعداد"
        ACTIVE = "ACTIVE", "قيد التشغيل"
        CLOSING = "CLOSING", "قيد الإغلاق"
        ARCHIVED = "ARCHIVED", "مؤرشفة"

    name = models.CharField(max_length=50)  # e.g. "2026/2027"
    start_date = models.DateField()
    end_date = models.DateField()
    rollover_source = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="rollover_targets",
    )
    rollover_options = models.JSONField(default=dict, blank=True)
    rollover_copied = models.JSONField(default=dict, blank=True)

    # --- State Machine ---
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    activated_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    # --- حقل قديم — deprecated ---
    # يبقى للتوافق مع الكود القديم. سيُزال بعد اكتمال الترحيل.
    is_active = models.BooleanField(default=False)

    class Meta:
        db_table = "academics_year"
        ordering = ["-start_date"]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "name"],
                name="uniq_academic_year_name_per_tenant",
            ),
            models.CheckConstraint(
                condition=models.Q(end_date__gt=models.F("start_date")),
                name="academic_year_end_after_start",
            ),
            # قاعدة "سنة ACTIVE واحدة فقط لكل tenant"
            #
            # هذا قيد جزئي (partial unique) — يطبق فقط على الصفوف حيث
            # status='ACTIVE'. في PostgreSQL يتحول إلى:
            #   CREATE UNIQUE INDEX ... WHERE status = 'ACTIVE';
            #
            # الأثر: أي محاولة لتفعيل سنة ثانية (سواء بالكود أو SQL أو
            # Django Admin) سترفض بـ IntegrityError.
            models.UniqueConstraint(
                fields=["tenant"],
                condition=models.Q(status="ACTIVE"),
                name="only_one_active_year_per_tenant",
            ),
            models.UniqueConstraint(
                fields=["rollover_source"],
                condition=models.Q(rollover_source__isnull=False),
                name="uniq_academic_rollover_source",
            ),
        ]

    def __str__(self):
        return self.name

    # ------------------------------------------------------------------
    # State machine methods
    # ------------------------------------------------------------------

    def activate(self):
        """تفعيل السنة — يُغلق السنة النشطة الحالية تلقائياً."""
        if self.status != self.Status.DRAFT:
            raise ValidationError(
                f"لا يمكن تفعيل سنة بحالة {self.get_status_display()}. يجب أن تكون في حالة DRAFT."
            )

        with transaction.atomic():
            # أغلق السنة النشطة الحالية (إن وُجدت)
            AcademicYear.objects.for_tenant(self.tenant).filter(status=self.Status.ACTIVE).exclude(
                pk=self.pk
            ).update(status=self.Status.CLOSING)

            # فعّل هذه السنة
            self.status = self.Status.ACTIVE
            self.is_active = True  # للتوافق القديم
            self.activated_at = timezone.now()
            self.save(update_fields=["status", "is_active", "activated_at", "updated_at"])

    def close(self, *, archive: bool = True, by_user=None):
        """إغلاق السنة.

        Args:
            archive: True = ARCHIVED (قراءة فقط), False = CLOSING
            by_user: المستخدم الذي قام بالإغلاق
        """
        if self.status not in (self.Status.ACTIVE, self.Status.CLOSING):
            raise ValidationError(f"لا يمكن إغلاق سنة بحالة {self.get_status_display()}.")

        with transaction.atomic():
            self.status = self.Status.ARCHIVED if archive else self.Status.CLOSING
            self.closed_at = timezone.now()
            self.closed_by = by_user
            self.is_active = False
            self.save(
                update_fields=[
                    "status",
                    "closed_at",
                    "closed_by",
                    "is_active",
                    "updated_at",
                ]
            )

    def is_writable(self) -> bool:
        """هل يمكن التعديل على هذه السنة؟"""
        return self.status != self.Status.ARCHIVED


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
            models.UniqueConstraint(
                fields=["academic_year", "name"], name="uniq_term_name_per_year"
            ),
            models.CheckConstraint(
                condition=models.Q(end_date__gt=models.F("start_date")),
                name="term_end_after_start",
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

    # ------------------------------------------------------------------
    # Traversal — "where does a student go after this grade?"
    # ------------------------------------------------------------------

    def next_grade(self):
        """الصف التالي المنطقي — يعبر تلقائياً بين المراحل.

        المنطق:
          1. إن وُجد صف بنفس المرحلة بـ order أعلى → هذا هو التالي.
          2. إن لم يوجد → أول صف (بـ order الأدنى) في المرحلة التالية.
          3. إن لم يوجد → None (= السنة النهائية، يعني تخرّج).

        مثال (بيانات الـ seed):
          الثالث الإعدادي → الأول الثانوي (يعبر من إعدادي إلى ثانوي)
          الأول الثانوي  → الثاني الثانوي
          الثالث الثانوي → None (تخرّج)
        """
        # 1. داخل نفس المرحلة
        same_stage = (
            Grade.objects.for_tenant(self.tenant)
            .filter(stage=self.stage, order__gt=self.order)
            .order_by("order")
            .first()
        )
        if same_stage is not None:
            return same_stage

        # 2. أول صف في المرحلة التالية
        next_stage = (
            Stage.objects.for_tenant(self.tenant)
            .filter(order__gt=self.stage.order)
            .order_by("order")
            .first()
        )
        if next_stage is None:
            return None

        return (
            Grade.objects.for_tenant(self.tenant).filter(stage=next_stage).order_by("order").first()
        )

    def is_final(self) -> bool:
        """هل هذا آخر صف في المؤسسة؟ (يعني طلابه سيتخرّجون)"""
        return self.next_grade() is None

    def is_first(self) -> bool:
        """هل هذا أول صف في المؤسسة؟ (يعني طلابه جدد تماماً)"""
        # أول صف في أول مرحلة بـ order
        first_stage = Stage.objects.for_tenant(self.tenant).order_by("order").first()
        if first_stage is None:
            return False
        first_grade = (
            Grade.objects.for_tenant(self.tenant)
            .filter(stage=first_stage)
            .order_by("order")
            .first()
        )
        return first_grade is not None and first_grade.pk == self.pk


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
                fields=["grade", "academic_year", "name"],
                name="uniq_group_name_per_grade_year",
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
    """A course is "Biology for First Secondary in 2026/27".

    Phase 1.4 — السنة الدراسية إجبارية:
      * كل Course ينتمي لسنة واحدة بالضبط. لا كورسات "عامة".
      * term يبقى اختيارياً (لنقل الطلاب بين الترمات).
      * PROTECT على الحذف: لا يمكن حذف سنة لها كورسات.

    Constraints:
      1. (grade, subject, name, year) unique when term is null
      2. (grade, subject, name, year, term) unique when term is not null
      3. term requires academic_year (defensive; always true now)
    """

    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name="courses")
    grade = models.ForeignKey(Grade, on_delete=models.CASCADE, related_name="courses")

    # ─── Phase 1.4 — السنة إجبارية ───
    academic_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.PROTECT,
        related_name="courses",
    )
    term = models.ForeignKey(
        Term,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="courses",
    )

    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "academics_course"
        ordering = ["grade", "subject", "name"]
        constraints = [
            # 1. Year-only course (term is null)
            models.UniqueConstraint(
                fields=["grade", "subject", "name", "academic_year"],
                condition=models.Q(term__isnull=True),
                name="uniq_year_course_per_grade_subject_name_year",
            ),
            # 2. Term-specific course
            models.UniqueConstraint(
                fields=["grade", "subject", "name", "academic_year", "term"],
                condition=models.Q(term__isnull=False),
                name="uniq_term_course_per_grade_subject_name_year_term",
            ),
            # 3. Term requires year (defensive)
            models.CheckConstraint(
                condition=models.Q(term__isnull=True) | models.Q(academic_year__isnull=False),
                name="course_term_requires_academic_year",
            ),
        ]

    def __str__(self):
        if not self.academic_year_id:
            return f"{self.name} ({self.grade.name})"
        suffix = f" ({self.academic_year.name}"
        if self.term_id:
            suffix += f" · {self.term.name}"
        suffix += ")"
        return f"{self.name} ({self.grade.name}){suffix}"

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.term_id and self.academic_year_id:
            if self.term.academic_year_id != self.academic_year_id:
                raise ValidationError({"term": "الترم المختار لا ينتمي للسنة الدراسية المحددة."})


class Chapter(TenantScopedModel):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="chapters")
    name = models.CharField(max_length=150)
    order = models.PositiveSmallIntegerField(default=1)

    class Meta:
        db_table = "academics_chapter"
        ordering = ["course", "order"]
        constraints = [
            models.UniqueConstraint(
                fields=["course", "order"], name="uniq_chapter_order_per_course"
            ),
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
            models.UniqueConstraint(
                fields=["chapter", "order"], name="uniq_lesson_order_per_chapter"
            ),
        ]

    def __str__(self):
        return f"{self.chapter.name} — {self.name}"
