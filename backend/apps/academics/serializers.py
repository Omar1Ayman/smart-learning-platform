"""
Every FK to another tenant-scoped model is deliberately re-scoped to
request.tenant in __init__ — this is the "Relationship permission" layer
from ARCHITECTURE.md #2, step 5.
"""

from rest_framework import serializers

from apps.common.serializers import TenantScopedModelSerializer

from .models import (
    AcademicYear,
    Chapter,
    Course,
    Grade,
    Group,
    Lesson,
    Stage,
    Subject,
    Term,
)


class AcademicYearSerializer(serializers.ModelSerializer):
    """Exposes the new `status` field (read-only) alongside legacy `is_active`.

    Why `status` is read-only:
      - The state machine only changes through `AcademicYear.activate()` /
        `.close()`, or through the dedicated `activate`/`close` actions
        on the ViewSet (added later).
      - Letting a client write `status` directly would bypass the
        transition rules (e.g., jump from DRAFT to ARCHIVED).

    Why `is_active` is still writable (for now):
      - The current frontend still sends it.
      - We interpret `is_active=True` on create as "activate this year"
        (which closes any currently-active year for this tenant).
      - Any other transition (`False`, or on update) is handled later by
        dedicated actions. Until then, ignore it on update to avoid
        silent state corruption.
    """

    status_display = serializers.CharField(
        source="get_status_display", read_only=True
    )

    class Meta:
        model = AcademicYear
        fields = [
            "id",
            "name",
            "start_date",
            "end_date",
            "status",
            "status_display",
            "is_active",
            "activated_at",
            "closed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "status_display",
            "activated_at",
            "closed_at",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        """Guard against the DB constraint (one ACTIVE year per tenant).

        Without this, sending `is_active=true` while another year is
        already ACTIVE would surface as a raw 500 (IntegrityError). We
        surface it as a clean 400 with an Arabic message instead.
        """
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        wants_active = attrs.get("is_active") is True

        if wants_active and tenant is not None:
            qs = AcademicYear.objects.for_tenant(tenant).filter(status="ACTIVE")
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            other = qs.first()
            if other is not None:
                raise serializers.ValidationError(
                    {
                        "is_active": (
                            f"السنة '{other.name}' نشطة بالفعل. "
                            "أغلقها أولاً أو استخدم زر 'تفعيل' الذي يُغلقها تلقائياً."
                        )
                    }
                )

        return attrs

    def create(self, validated_data):
        """Create year in DRAFT, then activate if the client asked for it."""
        wants_active = validated_data.pop("is_active", False)

        validated_data["status"] = "DRAFT"
        validated_data["is_active"] = False
        instance = super().create(validated_data)

        if wants_active:
            instance.activate()
            instance.refresh_from_db()

        return instance

    def update(self, instance, validated_data):
        """On update, only allow is_active=True to activate a DRAFT year.

        Other transitions (`False`, or activating a non-DRAFT year) are
        intentionally ignored here — they belong to dedicated actions,
        not to a generic PATCH.
        """
        wants_active = validated_data.pop("is_active", None)

        instance = super().update(instance, validated_data)

        if wants_active is True and instance.status == "DRAFT":
            instance.activate()
            instance.refresh_from_db()

        return instance


class TermSerializer(TenantScopedModelSerializer):
    tenant_scoped_fields = {"academic_year": AcademicYear}

    class Meta:
        model = Term
        fields = [
            "id",
            "academic_year",
            "name",
            "start_date",
            "end_date",
            "order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class StageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stage
        fields = ["id", "name", "order", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class GradeSerializer(TenantScopedModelSerializer):
    tenant_scoped_fields = {"stage": Stage}

    class Meta:
        model = Grade
        fields = ["id", "stage", "name", "order", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class GroupSerializer(TenantScopedModelSerializer):
    tenant_scoped_fields = {"grade": Grade, "academic_year": AcademicYear}
    students_count = serializers.SerializerMethodField()
    teachers_count = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = ["id", "grade", "academic_year", "name", "capacity","students_count", "teachers_count", "created_at", "updated_at"]
        read_only_fields = ["id", "students_count", "teachers_count", "created_at", "updated_at"]

    def get_students_count(self, obj):
        # حساب عدد الطلاب النشطين في هذه المجموعة
        from apps.people.models import Enrollment
        return Enrollment.objects.filter(group=obj, status="ACTIVE").count()

    def get_teachers_count(self, obj):
        # حساب عدد المعلمين المسندين لهذه المجموعة
        from apps.people.models import TeacherAssignment
        return TeacherAssignment.objects.filter(groups=obj).count()
    def validate(self, attrs):
        # FIX (bug 12): changing academic_year on a group that already has
        # enrollments would leave every Enrollment.academic_year stale
        # (it's denormalized by design so the "one enrollment per student
        # per year" constraint can hold). Prevent the change instead of
        # cascading updates — a mid-year group move is not a real school
        # workflow; create a new group for the new year.
        if self.instance is not None and "academic_year" in attrs:
            new_year = attrs["academic_year"]
            if new_year.id != self.instance.academic_year_id:
                from apps.people.models import Enrollment

                tenant = self.context["request"].tenant
                if Enrollment.objects.for_tenant(tenant).filter(group=self.instance).exists():
                    raise serializers.ValidationError(
                        {
                            "academic_year": (
                                "لا يمكن تغيير السنة الدراسية لمجموعة لها تسجيلات. "
                                "أنشئ مجموعة جديدة للسنة الجديدة بدلًا من تعديل هذه."
                            )
                        }
                    )
        return attrs

class SubjectSerializer(serializers.ModelSerializer):
    courses_count = serializers.SerializerMethodField()
    class Meta:
        model = Subject
        fields = ["id", "name", "code", "courses_count", "created_at", "updated_at"]
        read_only_fields = ["id", "courses_count", "created_at", "updated_at"]
    def get_courses_count(self, obj):
        return obj.courses.count()

class CourseSerializer(TenantScopedModelSerializer):
    """Phase 1.4 — academic_year is required, term is optional.

    - Uniqueness is scoped by academic_year (always set).
    - term (if provided) must belong to the same year.
    """

    lessons_count = serializers.SerializerMethodField()
    teachers_count = serializers.SerializerMethodField()

    tenant_scoped_fields = {
        "subject": Subject,
        "grade": Grade,
        "academic_year": AcademicYear,
        "term": Term,
    }

    # ─── Phase 1.4: year required, term optional ───
    academic_year = serializers.PrimaryKeyRelatedField(
        queryset=AcademicYear.objects.none(),
        required=True,
        allow_null=False,
        error_messages={
            "required": "السنة الدراسية مطلوبة.",
            "null": "السنة الدراسية مطلوبة.",
            "does_not_exist": "السنة الدراسية غير موجودة.",
            "incorrect_type": "معرّف السنة الدراسية غير صالح.",
        },
    )
    term = serializers.PrimaryKeyRelatedField(
        queryset=Term.objects.none(),
        required=False,
        allow_null=True,
    )

    subject_name = serializers.CharField(source="subject.name", read_only=True)
    grade_name = serializers.CharField(source="grade.name", read_only=True)
    academic_year_name = serializers.CharField(
        source="academic_year.name", read_only=True
    )
    term_name = serializers.CharField(
        source="term.name", read_only=True, allow_null=True
    )
    stage = serializers.CharField(
        source="grade.stage_id", read_only=True
    )
    stage_name = serializers.CharField(
        source="grade.stage.name", read_only=True
    )

    class Meta:
        model = Course
        fields = [
            "id",
            "subject",
            "subject_name",
            "grade",
            "grade_name",
            "stage",           
            "stage_name",      
            "academic_year",
            "academic_year_name",
            "term",
            "term_name",
            "name",
            "description",
            "is_active",
            "lessons_count",
            "teachers_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "subject_name",
            "grade_name",
             "stage",
            "stage_name",
            "academic_year_name",
            "term_name",
            "created_at",
            "updated_at",
        ]
        validators = []

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # term is explicitly the only optional field.
        if "term" in self.fields:
            self.fields["term"].required = False
            self.fields["term"].allow_null = True

    def validate(self, attrs):
        academic_year = attrs.get("academic_year") or getattr(
            self.instance, "academic_year", None
        )
        term = attrs.get("term") or getattr(self.instance, "term", None)

        # Defensive: field has required=True, but keep for clarity.
        if academic_year is None:
            raise serializers.ValidationError(
                {"academic_year": "السنة الدراسية مطلوبة."}
            )

        # term (if provided) must belong to the same year.
        if term is not None and term.academic_year_id != academic_year.id:
            raise serializers.ValidationError(
                {"term": "الترم المختار لا ينتمي للسنة الدراسية المحددة."}
            )

        # Uniqueness: name per (tenant, grade, subject, year, term).
        name = attrs.get("name") or getattr(self.instance, "name", None)
        grade = attrs.get("grade") or getattr(self.instance, "grade", None)
        subject = attrs.get("subject") or getattr(self.instance, "subject", None)

        if name and grade and subject:
            qs = Course.objects.for_tenant(
                self.context["request"].tenant
            ).filter(
                grade=grade,
                subject=subject,
                name=name,
                academic_year=academic_year,
            )
            if term is None:
                qs = qs.filter(term__isnull=True)
            else:
                qs = qs.filter(term=term)

            if self.instance is not None:
                qs = qs.exclude(id=self.instance.id)

            if qs.exists():
                if term is None:
                    msg = (
                        f"توجد مادة دراسية بنفس الاسم لنفس الصف والمادة "
                        f"في نفس السنة ({academic_year.name})."
                    )
                else:
                    msg = (
                        f"توجد مادة دراسية بنفس الاسم لنفس الصف والمادة "
                        f"في نفس السنة ({academic_year.name}) "
                        f"والترم ({term.name})."
                    )
                raise serializers.ValidationError({"name": msg})

        # Wave 33 — WARNING: grade has no groups yet.
        if grade and not Group.objects.for_tenant(
            self.context["request"].tenant
        ).filter(grade=grade).exists():
            self.add_warning(
                "grade",
                f"الصف '{grade.name}' ليس فيه مجموعات بعد — "
                f"المادة موجودة لكن لا طلاب يمكنهم دراستها.",
            )

        return attrs

    def get_lessons_count(self, obj):
        from .models import Lesson
        return Lesson.objects.filter(chapter__course=obj).count()

    def get_teachers_count(self, obj):
        from apps.people.models import TeacherAssignment
        return TeacherAssignment.objects.filter(course=obj).count()
class ChapterSerializer(TenantScopedModelSerializer):
    tenant_scoped_fields = {"course": Course}

    class Meta:
        model = Chapter
        fields = ["id", "course", "name", "order", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class LessonSerializer(TenantScopedModelSerializer):
    tenant_scoped_fields = {"chapter": Chapter}

    class Meta:
        model = Lesson
        fields = ["id", "chapter", "name", "order", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
        
        
        
# ============================================================================
# Phase 1.10-1.12 — Rollover Wizard serializers
# ============================================================================


class PrepareNextYearSerializer(serializers.Serializer):
    """Input for POST /academic-years/<id>/prepare-next/."""

    name = serializers.CharField(max_length=50)
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    copy_terms = serializers.BooleanField(default=True)
    copy_groups = serializers.BooleanField(default=True)
    copy_courses = serializers.BooleanField(default=True)

    def validate(self, attrs):
        if attrs["end_date"] <= attrs["start_date"]:
            raise serializers.ValidationError(
                {"end_date": "تاريخ النهاية يجب أن يكون بعد تاريخ البداية."}
            )
        return attrs


class PromotionItemInputSerializer(serializers.Serializer):
    """One row in the promote-students batch."""

    enrollment = serializers.UUIDField()
    action = serializers.ChoiceField(
        choices=["PROMOTE", "REPEAT", "GRADUATE", "TRANSFER"]
    )
    target_group = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs):
        action = attrs["action"]
        target_group = attrs.get("target_group")

        if action in ("PROMOTE", "REPEAT") and not target_group:
            raise serializers.ValidationError(
                {"target_group": f"مطلوب للإجراء {action}."}
            )
        if action in ("GRADUATE", "TRANSFER") and target_group:
            raise serializers.ValidationError(
                {"target_group": f"لا يُحدَّد للإجراء {action}."}
            )
        return attrs


class PromoteStudentsSerializer(serializers.Serializer):
    """Input for POST /academic-years/<id>/promote-students/."""

    target_year = serializers.UUIDField()
    items = PromotionItemInputSerializer(many=True)

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError("items لا يجب أن تكون فارغة.")
        seen = set()
        for item in items:
            if item["enrollment"] in seen:
                raise serializers.ValidationError(
                    "لا يمكن تكرار نفس الـ enrollment في دفعة واحدة."
                )
            seen.add(item["enrollment"])
        return items