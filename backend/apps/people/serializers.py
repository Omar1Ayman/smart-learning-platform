from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from apps.academics.models import AcademicYear, Course, Group, Term
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

    # الحقول المحسوبة
    teacher_email = serializers.EmailField(source="teacher.email", read_only=True)
    teacher_name = serializers.SerializerMethodField()          # ← جديد
    course_name = serializers.CharField(source="course.name", read_only=True)
    group_names = serializers.SerializerMethodField()

    class Meta:
        model = TeacherAssignment
        fields = [
            "id",
            "teacher",
            "teacher_email",
            "teacher_name",                                     
            "course",
            "course_name",
            "groups",
            "group_names",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "teacher_email",
            "teacher_name",                                     
            "course_name",
            "group_names",
            "created_at",
            "updated_at",
        ]

    def get_teacher_name(self, obj) -> str:                     # ← جديد
        full = f"{obj.teacher.first_name} {obj.teacher.last_name}".strip()
        return full or obj.teacher.email

    def get_group_names(self, obj):
        return list(obj.groups.values_list("name", flat=True))

    def validate(self, attrs):
        teacher = attrs.get("teacher") or getattr(self.instance, "teacher", None)
        course = attrs.get("course") or getattr(self.instance, "course", None)

        if "groups" in attrs:
            effective_groups = attrs["groups"]
        elif self.instance is not None and "course" in attrs:
            effective_groups = list(self.instance.groups.all())
        else:
            effective_groups = None

        if teacher and teacher.role != User.Role.TEACHER:
            raise serializers.ValidationError(
                {"teacher": "يمكن إسناد المعلمين فقط (role=TEACHER)."}
            )

        # 👇 التحقق الصارم من الصف والسنة 👇
        if course and effective_groups:
            # 1. التحقق من الصف
            mismatched_grade = [g for g in effective_groups if g.grade_id != course.grade_id]
            if mismatched_grade:
                raise serializers.ValidationError(
                    {"groups": "كل مجموعة يجب أن تنتمي لنفس صف الكورس (Course.grade)."}
                )
            
            # 2. التحقق من السنة الدراسية (هذا ما كان مفقوداً!)
            mismatched_year = [g for g in effective_groups if g.academic_year_id != course.academic_year_id]
            if mismatched_year:
                raise serializers.ValidationError(
                    {"groups": "خطأ منطقي: لا يمكن ربط مادة دراسية بمجموعة تنتمي لسنة دراسية مختلفة!"}
                )

        if course and not course.chapters.exists():
            self.add_warning(
                "course",
                f"المادة '{course.name}' ليس فيها فصول بعد — لن يكون هناك محتوى يُدرَّس.",
            )

        return attrs
class EnrollmentSerializer(TenantScopedModelSerializer):
    tenant_scoped_fields = {"student": _students_for_tenant, "group": Group}
    academic_year = serializers.PrimaryKeyRelatedField(read_only=True)
    term = serializers.PrimaryKeyRelatedField(
        queryset=Term.objects.none(), required=False, allow_null=True
    )

    student_email = serializers.EmailField(source="student.email", read_only=True)
    student_name = serializers.SerializerMethodField()
    group_name = serializers.CharField(source="group.name", read_only=True)
    academic_year_name = serializers.CharField(source="academic_year.name", read_only=True)
    term_name = serializers.CharField(source="term.name", read_only=True, allow_null=True)

    class Meta:
        model = Enrollment
        fields = [
            "id",
            "student",
            "student_email",
            "student_name",
            "group",
            "group_name",
            "academic_year",
            "academic_year_name",
            "term",
            "term_name",
            "status",
            "enrolled_at",
        ]
        read_only_fields = [
            "id",
            "student_email",
            "student_name",
            "group_name",
            "academic_year",
            "academic_year_name",
            "term_name",
            "enrolled_at",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        if tenant is not None:
            self.fields["term"].queryset = Term.objects.for_tenant(tenant)

    def get_student_name(self, obj):
        full = f"{obj.student.first_name} {obj.student.last_name}".strip()
        return full or obj.student.email

    def validate(self, attrs):
        student = attrs.get("student") or getattr(self.instance, "student", None)
        group = attrs.get("group") or getattr(self.instance, "group", None)
        term = attrs.get("term") if "term" in attrs else getattr(self.instance, "term", None)

        if student and group:
            academic_year = group.academic_year

            if student.role != User.Role.STUDENT:
                raise serializers.ValidationError(
                    {"student": "يمكن تسجيل الطلاب فقط (role=STUDENT)."}
                )

            if term is not None and term.academic_year_id != academic_year.id:
                raise serializers.ValidationError(
                    {"term": "الترم المختار لا ينتمي لسنة المجموعة الدراسية."}
                )

            # Duplicate check.
            qs = Enrollment.objects.filter(student=student, academic_year=academic_year)
            if term is None:
                qs = qs.filter(term__isnull=True)
            else:
                qs = qs.filter(term=term)
            if self.instance:
                qs = qs.exclude(id=self.instance.id)
            if qs.exists():
                msg = (
                    "هذا الطالب لديه بالفعل enrollment في نفس السنة الدراسية."
                    if term is None
                    else "هذا الطالب لديه بالفعل enrollment في نفس السنة والترم."
                )
                raise serializers.ValidationError({"student": msg})

            # WARNING: group has no teacher.
            if not TeacherAssignment.objects.for_tenant(
                self.context["request"].tenant
            ).filter(groups=group).exists():
                self.add_warning(
                    "group",
                    f"المجموعة '{group.name}' ليس لها معلم معيّن — الطالب لن يستفيد "
                    f"من المنصة حتى يتم إسناد معلم.",
                )

        return attrs

    def create(self, validated_data):
        validated_data["academic_year"] = validated_data["group"].academic_year
        return super().create(validated_data)

    def update(self, instance, validated_data):
        # L-1 fix (Wave Zero follow-up): the previous version only set
        # `academic_year` in create(). A PATCH that changed `group` (to a
        # group in a different year) left academic_year pointing at the
        # OLD year — producing a contradictory row where
        # enrollment.group.academic_year != enrollment.academic_year.
        # Re-derive it whenever group changes.
        if "group" in validated_data:
            validated_data["academic_year"] = validated_data["group"].academic_year
        return super().update(instance, validated_data)


class PromotionItemSerializer(serializers.Serializer):
    ACTIONS = ["PROMOTE", "REPEAT", "TRANSFER", "GRADUATE"]

    enrollment = serializers.PrimaryKeyRelatedField(queryset=Enrollment.objects.none())
    action = serializers.ChoiceField(choices=ACTIONS)
    target_group = serializers.PrimaryKeyRelatedField(
        queryset=Group.objects.none(), required=False, allow_null=True
    )

    def to_internal_value(self, data):
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
                raise serializers.ValidationError(
                    {"target_group": "لا يُحدَّد صف/مجموعة عند التخرج."}
                )
        elif not target_group:
            raise serializers.ValidationError(
                {"target_group": "مطلوب لكل الإجراءات ما عدا التخرج."}
            )
        return attrs


class PromotionRequestSerializer(serializers.Serializer):
    target_academic_year = serializers.PrimaryKeyRelatedField(
        queryset=AcademicYear.objects.none()
    )
    dry_run = serializers.BooleanField(default=False)
    items = PromotionItemSerializer(many=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        if tenant is not None:
            self.fields["target_academic_year"].queryset = AcademicYear.objects.for_tenant(
                tenant
            )

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError("items لا يجب أن تكون فارغة.")
        seen = set()
        for item in items:
            enrollment_id = item["enrollment"].id
            if enrollment_id in seen:
                raise serializers.ValidationError(
                    "لا يمكن تكرار نفس الـ enrollment في دفعة واحدة."
                )
            seen.add(enrollment_id)
        return items

    def validate(self, attrs):
        target_year = attrs["target_academic_year"]
        tenant = self.context["request"].tenant          
        errors = []
        any_error = False
        for item in attrs["items"]:
            target_group = item.get("target_group")
            item_errors = {}

            if target_group and target_group.academic_year_id != target_year.id:
                item_errors["target_group"] = (
                    "target_group يجب أن ينتمي لنفس target_academic_year."
                )

            current = item["enrollment"]
            if current.status != Enrollment.Status.ACTIVE:
                item_errors["enrollment"] = (
                    f"لا يمكن ترقية تسجيل حالته الحالية "
                    f"{current.get_status_display()} — يجب أن يكون نشطًا أولًا."
                )

            if item["action"] != "GRADUATE":
                student = current.student
                # ⬇️ التعديل هنا: استخدم for_tenant
                if Enrollment.objects.for_tenant(tenant).filter(
                    student=student, academic_year=target_year
                ).exists():
                    item_errors["enrollment"] = (
                        f"الطالب {student.email} لديه enrollment بالفعل في السنة المستهدفة."
                    )

            if item_errors:
                any_error = True
            errors.append(item_errors)
        if any_error:
            raise serializers.ValidationError({"items": errors})
        return attrs
    

class TermTransitionSerializer(serializers.Serializer):
    """Input for POST /enrollments/<id>/transition-term/."""

    target_term = serializers.UUIDField()
    target_group = serializers.UUIDField()

    def validate(self, attrs):
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        if tenant is None:
            raise serializers.ValidationError("مطلوب سياق المؤسسة.")

        # Resolve entities (must exist in this tenant)
        term = Term.objects.for_tenant(tenant).filter(id=attrs["target_term"]).first()
        if term is None:
            raise serializers.ValidationError(
                {"target_term": "الترم الهدف غير موجود."}
            )

        group = Group.objects.for_tenant(tenant).filter(id=attrs["target_group"]).first()
        if group is None:
            raise serializers.ValidationError(
                {"target_group": "المجموعة الهدف غير موجودة."}
            )

        attrs["_term_obj"] = term
        attrs["_group_obj"] = group
        return attrs