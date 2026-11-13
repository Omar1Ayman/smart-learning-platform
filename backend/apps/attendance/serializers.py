from rest_framework import serializers

from apps.academics.models import Course, Group, Lesson
from apps.accounts.models import User
from apps.common.serializers import TenantScopedModelSerializer

from .models import (
    AttendanceRecord,
    AttendanceSession,
    GroupSchedule,
)


class AttendanceSessionSerializer(TenantScopedModelSerializer):
    """Read+write shape for staff. `qr_secret` is never in this list."""

    tenant_scoped_fields = {
        "group": Group,
        "course": Course,
        "lesson": Lesson,
        "teacher": lambda tenant: User.objects.for_tenant(tenant).filter(role=User.Role.TEACHER),
    }

    group_name = serializers.CharField(source="group.name", read_only=True)
    course_name = serializers.CharField(source="course.name", read_only=True, allow_null=True)
    lesson_name = serializers.CharField(source="lesson.name", read_only=True, allow_null=True)
    teacher_email = serializers.EmailField(source="teacher.email", read_only=True)
    total_students = serializers.SerializerMethodField()
    present_count = serializers.SerializerMethodField()
    late_count = serializers.SerializerMethodField()
    absent_count = serializers.SerializerMethodField()

    class Meta:
        model = AttendanceSession
        fields = [
            "id",
            "group",
            "group_name",
            "course",
            "course_name",
            "lesson",
            "lesson_name",
            "teacher",
            "teacher_email",
            "date",
            "start_time",
            "end_time",
            "status",
            "mode",
            "late_threshold_minutes",
            "opened_at",
            "closed_at",
            "notes",
            "created_by",
            "created_at",
            "updated_at",
            "total_students",
            "present_count",
            "late_count",
            "absent_count",
        ]
        read_only_fields = [
            "id",
            "status",
            "opened_at",
            "closed_at",
            "created_by",
            "created_at",
            "updated_at",
            "group_name",
            "course_name",
            "lesson_name",
            "teacher_email",
            "total_students",
            "present_count",
            "late_count",
            "absent_count",
        ]

    def _counts(self, obj):
        # Single aggregate query; caches per-instance.
        if hasattr(obj, "_attendance_counts"):
            return obj._attendance_counts
        from django.db.models import Count, Q

        agg = obj.records.aggregate(
            total=Count("id"),
            present=Count("id", filter=Q(status="PRESENT")),
            late=Count("id", filter=Q(status="LATE")),
            absent=Count("id", filter=Q(status="ABSENT")),
        )
        obj._attendance_counts = agg
        return agg

    def get_total_students(self, obj):
        return self._counts(obj)["total"] or 0

    def get_present_count(self, obj):
        return self._counts(obj)["present"] or 0

    def get_late_count(self, obj):
        return self._counts(obj)["late"] or 0

    def get_absent_count(self, obj):
        return self._counts(obj)["absent"] or 0

    def validate(self, attrs):
        # Lesson (if set) must belong to the session's course (if set).
        course = attrs.get("course") or getattr(self.instance, "course", None)
        lesson = attrs.get("lesson") or getattr(self.instance, "lesson", None)
        if lesson and course and lesson.chapter.course_id != course.id:
            raise serializers.ValidationError({"lesson": "الدرس لا ينتمي للمادة الدراسية المحددة."})
        return attrs

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class AttendanceRecordSerializer(serializers.ModelSerializer):
    student_email = serializers.EmailField(source="student.email", read_only=True)
    student_name = serializers.SerializerMethodField()

    class Meta:
        model = AttendanceRecord
        fields = [
            "id",
            "session",
            "student",
            "student_email",
            "student_name",
            "status",
            "check_in_method",
            "check_in_at",
            "marked_by",
            "notes",
        ]
        read_only_fields = fields

    def get_student_name(self, obj):
        full = f"{obj.student.first_name} {obj.student.last_name}".strip()
        return full or obj.student.email


class StudentAttendanceRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttendanceRecord
        fields = ["id", "session", "status", "check_in_method", "check_in_at"]
        read_only_fields = fields


class MarkQRInputSerializer(serializers.Serializer):
    session = serializers.UUIDField()
    token = serializers.CharField(max_length=32)


class ManualMarkInputSerializer(serializers.Serializer):
    student = serializers.UUIDField()
    status = serializers.ChoiceField(choices=AttendanceRecord.Status.choices)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class BulkMarkInputSerializer(serializers.Serializer):
    """Set the same status for many students at once."""

    students = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False, max_length=500
    )
    status = serializers.ChoiceField(choices=AttendanceRecord.Status.choices)


# ============================================================================
# Wave M0 (Milestone 0, Batch 3) — GroupSchedule + Today's sessions
# ============================================================================


class GroupScheduleSerializer(TenantScopedModelSerializer):
    """CRUD serializer for weekly group schedules.

    F-06 FIX: previously GroupSchedule had no API surface at all — admins
    could only create schedules through Django admin. This serializer
    makes the whole "Today's Sessions" dashboard widget (F-01) possible.

    `weekday` uses the model's convention (0=Sunday, 6=Saturday) — NOT
    Python's Mon=0. The serializer exposes a `weekday_label` for the UI
    so the frontend never has to duplicate the mapping.
    """

    tenant_scoped_fields = {
        "group": Group,
        "teacher": lambda tenant: User.objects.for_tenant(tenant).filter(role=User.Role.TEACHER),
    }

    group_name = serializers.CharField(source="group.name", read_only=True)
    teacher_email = serializers.EmailField(source="teacher.email", read_only=True, allow_null=True)
    weekday_label = serializers.CharField(source="get_weekday_display", read_only=True)

    class Meta:
        model = GroupSchedule
        fields = [
            "id",
            "group",
            "group_name",
            "weekday",
            "weekday_label",
            "start_time",
            "end_time",
            "teacher",
            "teacher_email",
            "is_active",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "group_name",
            "teacher_email",
            "weekday_label",
        ]

    def validate(self, attrs):
        """F-06 — validate: end_time > start_time (mirrors the DB CHECK),
        and the (group, weekday, start_time) uniqueness is honored by the
        partial unique constraint. We surface a clean 400 here so the UI
        shows a friendly Arabic message instead of a raw 500.
        """
        start = attrs.get("start_time") or getattr(self.instance, "start_time", None)
        end = attrs.get("end_time") or getattr(self.instance, "end_time", None)
        if start and end and end <= start:
            raise serializers.ValidationError(
                {"end_time": "وقت النهاية يجب أن يكون بعد وقت البداية."}
            )

        # Uniqueness pre-check (mirrors DB constraint, but friendlier).
        group = attrs.get("group") or getattr(self.instance, "group", None)
        weekday = (
            attrs["weekday"] if "weekday" in attrs else getattr(self.instance, "weekday", None)
        )
        is_active = (
            attrs["is_active"]
            if "is_active" in attrs
            else getattr(self.instance, "is_active", True)
        )
        if group and weekday is not None and start and is_active:
            qs = GroupSchedule.objects.for_tenant(self.context["request"].tenant).filter(
                group=group, weekday=weekday, start_time=start, is_active=True
            )
            if self.instance is not None:
                qs = qs.exclude(id=self.instance.id)
            if qs.exists():
                raise serializers.ValidationError(
                    {
                        "start_time": (
                            "توجد حصة مفعّلة بالفعل لهذه المجموعة في نفس اليوم بنفس وقت البدء."
                        )
                    }
                )
        return attrs


class TodaySessionSerializer(serializers.Serializer):
    """Read-only shape returned by GET /attendance/sessions/today/.

    Batch 20 (Milestone 5): added `starts_in_minutes`, `ready_to_start`,
    `state` so the frontend can gate the "start" button properly.

    States:
      - ready:    within ±grace window (-10 / +30 min of start_time)
      - upcoming: more than 30 min before start_time
      - late:     more than 10 min after start_time
      - no_schedule_time: should never happen (start_time is required)
    """

    schedule_id = serializers.UUIDField()
    group_id = serializers.UUIDField()
    group_name = serializers.CharField()
    start_time = serializers.CharField()
    end_time = serializers.CharField()
    teacher_email = serializers.EmailField(allow_null=True)
    session_id = serializers.UUIDField(allow_null=True)
    session_status = serializers.CharField(allow_null=True)
    can_start = serializers.BooleanField()
    # Batch 20:
    starts_in_minutes = serializers.IntegerField()
    ready_to_start = serializers.BooleanField()
    state = serializers.CharField()


class NotifyParentsInputSerializer(serializers.Serializer):
    """Input for POST /attendance/sessions/<id>/notify-parents/.

    `force=True` re-sends to parents who were already notified (via
    `skip_already_notified=False` on the service). Default `False`
    respects the idempotency guarantee from `notified_at`.
    """

    force = serializers.BooleanField(default=False)
