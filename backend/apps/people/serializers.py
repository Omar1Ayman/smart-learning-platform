from rest_framework import serializers

from apps.academics.models import AcademicYear, Course, Group
from apps.accounts.models import User
from apps.common.serializers import TenantScopedModelSerializer

from .models import Enrollment, TeacherAssignment


def _teachers_for_tenant(tenant):
    return User.objects.for_tenant(tenant).filter(role=User.Role.TEACHER)


def _students_for_tenant(tenant):
    return User.objects.for_tenant(tenant).filter(role=User.Role.STUDENT)


class TeacherAssignmentSerializer(TenantScopedModelSerializer):
    tenant_scoped_fields = {
        "teacher": _teachers_for_tenant,
        "course": Course,
        "groups": lambda tenant: Group.objects.for_tenant(tenant),
    }

    class Meta:
        model = TeacherAssignment
        fields = ["id", "teacher", "course", "groups", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        course = attrs.get("course") or getattr(self.instance, "course", None)
        groups = attrs.get("groups")
        if course and groups:
            mismatched = [g for g in groups if g.grade_id != course.grade_id]
            if mismatched:
                raise serializers.ValidationError(
                    {"groups": "كل مجموعة يجب أن تنتمي لنفس صف الكورس (Course.grade)."}
                )
        return attrs


class EnrollmentSerializer(TenantScopedModelSerializer):
    tenant_scoped_fields = {"student": _students_for_tenant, "group": Group}
    academic_year = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Enrollment
        fields = ["id", "student", "group", "academic_year", "status", "enrolled_at"]
        read_only_fields = ["id", "academic_year", "enrolled_at"]

    def validate(self, attrs):
        # DB-level UniqueConstraint (uniq_enrollment_per_student_per_year)
        # is the real guarantee; this check exists purely to turn a
        # violation into a clean 400 instead of an unhandled
        # IntegrityError bubbling up as a 500.
        student = attrs.get("student") or getattr(self.instance, "student", None)
        group = attrs.get("group") or getattr(self.instance, "group", None)
        if student and group:
            academic_year = group.academic_year
            qs = Enrollment.objects.filter(student=student, academic_year=academic_year)
            if self.instance:
                qs = qs.exclude(id=self.instance.id)
            if qs.exists():
                raise serializers.ValidationError(
                    {"student": "هذا الطالب لديه بالفعل enrollment في نفس السنة الدراسية."}
                )
        return attrs

    def create(self, validated_data):
        # academic_year is derived from the chosen group, never accepted
        # from the client — see the model's docstring for why this
        # denormalized column exists at all.
        validated_data["academic_year"] = validated_data["group"].academic_year
        return super().create(validated_data)


class PromotionItemSerializer(serializers.Serializer):
    ACTIONS = ["PROMOTE", "REPEAT", "TRANSFER", "GRADUATE"]

    enrollment = serializers.PrimaryKeyRelatedField(queryset=Enrollment.objects.none())
    action = serializers.ChoiceField(choices=ACTIONS)
    target_group = serializers.PrimaryKeyRelatedField(
        queryset=Group.objects.none(), required=False, allow_null=True
    )

    def to_internal_value(self, data):
        # NOTE: this is declared as `items = PromotionItemSerializer(many=True)`
        # on the parent below, which means (unlike every other serializer
        # in this codebase) this instance is constructed once at class-body
        # time, before any request exists — an __init__ override can't see
        # self.context yet. to_internal_value() runs per-item, per-request,
        # *after* DRF has bound this child to its parent, so self.context
        # (resolved via the parent chain) is correctly available here.
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        if tenant is not None:
            self.fields["enrollment"].queryset = Enrollment.objects.for_tenant(tenant)
            self.fields["target_group"].queryset = Group.objects.for_tenant(tenant)
        return super().to_internal_value(data)

    def validate(self, attrs):
        action = attrs["action"]
        target_group = attrs.get("target_group")
        if action == "GRADUATE":
            if target_group:
                raise serializers.ValidationError({"target_group": "لا يُحدَّد صف/مجموعة عند التخرج."})
        elif not target_group:
            raise serializers.ValidationError({"target_group": "مطلوب لكل الإجراءات ما عدا التخرج."})
        return attrs


class PromotionRequestSerializer(serializers.Serializer):
    target_academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.none())
    dry_run = serializers.BooleanField(default=False)
    items = PromotionItemSerializer(many=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        if tenant is not None:
            self.fields["target_academic_year"].queryset = AcademicYear.objects.for_tenant(tenant)

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError("items لا يجب أن تكون فارغة.")
        seen = set()
        for item in items:
            enrollment_id = item["enrollment"].id
            if enrollment_id in seen:
                raise serializers.ValidationError("لا يمكن تكرار نفس الـ enrollment في دفعة واحدة.")
            seen.add(enrollment_id)
        return items

    def validate(self, attrs):
        target_year = attrs["target_academic_year"]
        errors = []
        any_error = False
        for item in attrs["items"]:
            target_group = item.get("target_group")
            item_errors = {}
            if target_group and target_group.academic_year_id != target_year.id:
                item_errors["target_group"] = "target_group يجب أن ينتمي لنفس target_academic_year."
            if item["action"] != "GRADUATE":
                student = item["enrollment"].student
                if Enrollment.objects.filter(student=student, academic_year=target_year).exists():
                    item_errors["enrollment"] = (
                        f"الطالب {student.email} لديه enrollment بالفعل في السنة المستهدفة."
                    )
            if item_errors:
                any_error = True
            errors.append(item_errors)
        if any_error:
            raise serializers.ValidationError({"items": errors})
        return attrs
