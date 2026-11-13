"""Parent portal serializers — all read-only aggregations."""

from rest_framework import serializers

from .models import ParentChild, User


class ChildSummarySerializer(serializers.Serializer):
    """Compact row shape — the parent's "my children" list."""

    id = serializers.UUIDField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    email = serializers.EmailField()
    student_code = serializers.CharField(allow_null=True)
    relationship = serializers.CharField(source="_relationship")
    is_primary = serializers.BooleanField(source="_is_primary")

    group_name = serializers.CharField(allow_null=True)
    grade_name = serializers.CharField(allow_null=True)
    stage_name = serializers.CharField(allow_null=True)
    academic_year_name = serializers.CharField(allow_null=True)

    attendance_pct = serializers.FloatField(allow_null=True)
    avg_percentage = serializers.FloatField(allow_null=True)
    total_attempts = serializers.IntegerField()


class ChildDetailSerializer(serializers.Serializer):
    """Full child view — the parent's one-stop profile page."""

    id = serializers.UUIDField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    email = serializers.EmailField()
    student_code = serializers.CharField(allow_null=True)
    relationship = serializers.CharField(source="_relationship")
    is_primary = serializers.BooleanField(source="_is_primary")

    current_enrollment = serializers.DictField(allow_null=True)
    attendance = serializers.DictField()
    exams = serializers.DictField()
    recent_attendance = serializers.ListField()
    recent_attempts = serializers.ListField()


class ParentChildLinkSerializer(serializers.Serializer):
    """Input shape for creating a link — used by admin UI."""

    parent = serializers.UUIDField()
    student = serializers.UUIDField()
    relationship = serializers.ChoiceField(
        choices=ParentChild.Relationship.choices, default="GUARDIAN"
    )
    is_primary = serializers.BooleanField(default=False)

    def validate(self, attrs):
        request = self.context["request"]
        tenant = request.tenant

        parent = (
            User.objects.for_tenant(tenant)
            .filter(id=attrs["parent"], role=User.Role.PARENT)
            .first()
        )
        if parent is None:
            raise serializers.ValidationError(
                {"parent": "ولي الأمر غير موجود أو ليس له دور PARENT."}
            )

        student = (
            User.objects.for_tenant(tenant)
            .filter(id=attrs["student"], role=User.Role.STUDENT)
            .first()
        )
        if student is None:
            raise serializers.ValidationError({"student": "الطالب غير موجود."})

        if ParentChild.objects.filter(parent=parent, student=student).exists():
            raise serializers.ValidationError({"parent": "هذا الوالد مرتبط بهذا الطالب بالفعل."})

        if attrs.get("is_primary"):
            existing = ParentChild.objects.filter(student=student, is_primary=True).exists()
            if existing:
                raise serializers.ValidationError(
                    {"is_primary": ("يوجد ولي أمر أساسي لهذا الطالب بالفعل. أزل الصفة عنه أولًا.")}
                )

        attrs["parent_obj"] = parent
        attrs["student_obj"] = student
        return attrs
