
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("academics", "0004_fix_course_year_only_constraint"),
        ("tenants", "0003_tenant_settings_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AttendanceSession",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("date", models.DateField(db_index=True)),
                ("start_time", models.TimeField()),
                ("end_time", models.TimeField()),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("SCHEDULED", "مجدولة"),
                            ("OPEN", "مفتوحة"),
                            ("CLOSED", "مغلقة"),
                            ("CANCELLED", "ملغاة"),
                        ],
                        db_index=True,
                        default="SCHEDULED",
                        max_length=20,
                    ),
                ),
                (
                    "mode",
                    models.CharField(
                        choices=[
                            ("AUTO_QR", "QR تلقائي"),
                            ("MANUAL", "يدوي"),
                            ("HYBRID", "مختلط"),
                        ],
                        default="HYBRID",
                        max_length=20,
                    ),
                ),
                ("qr_secret", models.CharField(blank=True, default="", max_length=64)),
                ("qr_window_seconds", models.PositiveSmallIntegerField(default=30)),
                ("late_threshold_minutes", models.PositiveSmallIntegerField(default=15)),
                ("opened_at", models.DateTimeField(blank=True, null=True)),
                ("closed_at", models.DateTimeField(blank=True, null=True)),
                ("notes", models.TextField(blank=True, default="")),
                (
                    "course",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="attendance_sessions",
                        to="academics.course",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_attendance_sessions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "group",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="attendance_sessions",
                        to="academics.group",
                    ),
                ),
                (
                    "lesson",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="attendance_sessions",
                        to="academics.lesson",
                    ),
                ),
                (
                    "teacher",
                    models.ForeignKey(
                        limit_choices_to={"role": "TEACHER"},
                        on_delete=django.db.models.deletion.RESTRICT,
                        related_name="attendance_sessions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(class)ss",
                        to="tenants.tenant",
                    ),
                ),
            ],
            options={
                "db_table": "attendance_session",
                "ordering": ["-date", "-start_time"],
            },
        ),
        migrations.CreateModel(
            name="AttendanceRecord",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("PRESENT", "حاضر"),
                            ("LATE", "متأخر"),
                            ("ABSENT", "غائب"),
                            ("EXCUSED", "بعذر"),
                        ],
                        default="ABSENT",
                        max_length=20,
                    ),
                ),
                (
                    "check_in_method",
                    models.CharField(
                        choices=[
                            ("QR", "QR"),
                            ("MANUAL", "يدوي"),
                            ("AUTO", "تلقائي"),
                        ],
                        default="AUTO",
                        max_length=20,
                    ),
                ),
                ("check_in_at", models.DateTimeField(blank=True, null=True)),
                ("check_in_ip", models.GenericIPAddressField(blank=True, null=True)),
                ("notes", models.TextField(blank=True, default="")),
                (
                    "marked_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="marked_attendance_records",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "session",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="records",
                        to="attendance.attendancesession",
                    ),
                ),
                (
                    "student",
                    models.ForeignKey(
                        limit_choices_to={"role": "STUDENT"},
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="attendance_records",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "tenant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="%(class)ss",
                        to="tenants.tenant",
                    ),
                ),
            ],
            options={
                "db_table": "attendance_record",
                "ordering": ["session", "student"],
            },
        ),
        migrations.AddConstraint(
            model_name="attendancesession",
            constraint=models.CheckConstraint(
                condition=models.Q(("end_time__gt", models.F("start_time"))),
                name="attendance_session_end_after_start",
            ),
        ),
        migrations.AddIndex(
            model_name="attendancesession",
            index=models.Index(
                fields=["tenant", "group", "-date"],
                name="attendance_group_date_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="attendancesession",
            index=models.Index(
                fields=["tenant", "status"], name="attendance_status_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="attendancesession",
            index=models.Index(
                fields=["tenant", "teacher", "-date"],
                name="attendance_teacher_date_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="attendancerecord",
            constraint=models.UniqueConstraint(
                fields=("session", "student"),
                name="uniq_attendance_record_per_session_student",
            ),
        ),
        migrations.AddIndex(
            model_name="attendancerecord",
            index=models.Index(
                fields=["tenant", "student", "-check_in_at"],
                name="attendance_student_idx",
            ),
        ),
    ]