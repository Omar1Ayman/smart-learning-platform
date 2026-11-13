"""
Attendance tracking — Phase 2A.

Design decisions:

- A **session** is one class meeting: Group × Date × Time × Teacher.
  `course` and `lesson` are optional metadata ("what was taught") but
  NOT attendance filters — in Egyptian schools a group is a fixed
  cohort that attends all subjects together.

- Records are **pre-populated** as ABSENT at session open. This means:
  * every enrolled student always has exactly one record per session,
  * reports are trivial SUM/COUNT queries (no LEFT JOIN tricks),
  * the "auto-absent" concept is just "the default wasn't updated".

- QR rotation is HMAC-based (see services.py). Each token is valid for
  one window (30s) + a one-window grace for slow networks. Screenshots
  become useless almost immediately.

- `on_delete=RESTRICT` on `teacher`: deleting a teacher with session
  history is wrong — deactivate them instead. Preserves audit trail.
"""

from django.db import models

from apps.common.models import TenantScopedModel


class AttendanceSession(TenantScopedModel):
    class Status(models.TextChoices):
        SCHEDULED = "SCHEDULED", "مجدولة"
        OPEN = "OPEN", "مفتوحة"
        CLOSED = "CLOSED", "مغلقة"
        CANCELLED = "CANCELLED", "ملغاة"

    class Mode(models.TextChoices):
        AUTO_QR = "AUTO_QR", "QR تلقائي"
        MANUAL = "MANUAL", "يدوي"
        HYBRID = "HYBRID", "مختلط"

    group = models.ForeignKey(
        "academics.Group",
        on_delete=models.CASCADE,
        related_name="attendance_sessions",
    )
    course = models.ForeignKey(
        "academics.Course",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="attendance_sessions",
    )
    lesson = models.ForeignKey(
        "academics.Lesson",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="attendance_sessions",
    )
    teacher = models.ForeignKey(
        "accounts.User",
        on_delete=models.RESTRICT,
        related_name="attendance_sessions",
        limit_choices_to={"role": "TEACHER"},
    )

    date = models.DateField(db_index=True)
    start_time = models.TimeField()
    end_time = models.TimeField()

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.SCHEDULED,
        db_index=True,
    )
    mode = models.CharField(
        max_length=20,
        choices=Mode.choices,
        default=Mode.HYBRID,
    )

    # QR — only meaningful when mode is AUTO_QR / HYBRID. `qr_secret` is
    # NEVER exposed to clients; only derived short-lived tokens are.
    qr_secret = models.CharField(max_length=64, blank=True, default="")
    qr_window_seconds = models.PositiveSmallIntegerField(default=30)

    # Grace: a scan within this many minutes of the effective start time
    # still counts as PRESENT; after that it's LATE. "Effective start" is
    # max(session.start_time, session.opened_at) — fair when the teacher
    # opens the session late.
    late_threshold_minutes = models.PositiveSmallIntegerField(default=15)

    opened_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_attendance_sessions",
    )

    class Meta:
        db_table = "attendance_session"
        ordering = ["-date", "-start_time"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_time__gt=models.F("start_time")),
                name="attendance_session_end_after_start",
            ),
        ]
        indexes = [
            models.Index(
                fields=["tenant", "group", "-date"],
                name="attendance_group_date_idx",
            ),
            models.Index(
                fields=["tenant", "status"],
                name="attendance_status_idx",
            ),
            models.Index(
                fields=["tenant", "teacher", "-date"],
                name="attendance_teacher_date_idx",
            ),
        ]

    def __str__(self):
        return f"{self.group.name} — {self.date} {self.start_time}"


class AttendanceRecord(TenantScopedModel):
    class Status(models.TextChoices):
        PRESENT = "PRESENT", "حاضر"
        LATE = "LATE", "متأخر"
        ABSENT = "ABSENT", "غائب"
        EXCUSED = "EXCUSED", "بعذر"

    class Method(models.TextChoices):
        QR = "QR", "QR"
        MANUAL = "MANUAL", "يدوي"
        AUTO = "AUTO", "تلقائي"  # default state; never explicitly set

    session = models.ForeignKey(
        AttendanceSession,
        on_delete=models.CASCADE,
        related_name="records",
    )
    student = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="attendance_records",
        limit_choices_to={"role": "STUDENT"},
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ABSENT,
    )
    check_in_method = models.CharField(
        max_length=20,
        choices=Method.choices,
        default=Method.AUTO,
    )
    check_in_at = models.DateTimeField(null=True, blank=True)
    check_in_ip = models.GenericIPAddressField(null=True, blank=True)
    marked_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="marked_attendance_records",
    )
    notes = models.TextField(blank=True, default="")
    notified_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text=(
            "When an absence notification was sent to the parent. Null = "
            "not yet notified. Used to make batch notify idempotent."
        ),
    )

    class Meta:
        db_table = "attendance_record"
        ordering = ["session", "student"]
        constraints = [
            models.UniqueConstraint(
                fields=["session", "student"],
                name="uniq_attendance_record_per_session_student",
            ),
        ]
        indexes = [
            models.Index(
                fields=["tenant", "student", "-check_in_at"],
                name="attendance_student_idx",
            ),
        ]

    def __str__(self):
        return f"{self.student.email} — {self.status} @ {self.session_id}"


class GroupSchedule(TenantScopedModel):
    """Weekly schedule pattern for a group.

    One row per (group, weekday, start_time). Example:
      - Group "1ث-أ", Sunday, 09:00-10:00, teacher Ahmed

    AttendanceSession is NOT auto-created from these rows. Instead, the
    frontend calls /attendance/sessions/today/ to show "what sessions
    does this teacher have today?" and the teacher starts each with one
    click via /attendance/sessions/from-schedule/.

    Rationale: no stale sessions, no cron, no "did the teacher actually
    hold the session?" ambiguity.
    """

    class Weekday(models.IntegerChoices):
        SUNDAY = 0, "الأحد"
        MONDAY = 1, "الاثنين"
        TUESDAY = 2, "الثلاثاء"
        WEDNESDAY = 3, "الأربعاء"
        THURSDAY = 4, "الخميس"
        FRIDAY = 5, "الجمعة"
        SATURDAY = 6, "السبت"

    group = models.ForeignKey(
        "academics.Group",
        on_delete=models.CASCADE,
        related_name="schedules",
    )
    weekday = models.PositiveSmallIntegerField(choices=Weekday.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()
    teacher = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="schedules",
        limit_choices_to={"role": "TEACHER"},
    )
    is_active = models.BooleanField(default=True)
    notes = models.CharField(max_length=255, blank=True, default="")
    created_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        db_table = "attendance_group_schedule"
        ordering = ["group", "weekday", "start_time"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(end_time__gt=models.F("start_time")),
                name="group_schedule_end_after_start",
            ),
            models.UniqueConstraint(
                fields=["group", "weekday", "start_time"],
                condition=models.Q(is_active=True),
                name="uniq_active_schedule_per_group_weekday_start",
            ),
        ]
        indexes = [
            models.Index(
                fields=["tenant", "weekday", "is_active"],
                name="schedule_weekday_active_idx",
            ),
        ]

    def __str__(self):
        return (
            f"{self.group.name} · {self.get_weekday_display()} "
            f"{self.start_time:%H:%M}-{self.end_time:%H:%M}"
        )
