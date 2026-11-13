from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.academics.models import (
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
from apps.common.serializers import TenantScopedModelSerializer

from .models import Content
from .validators import (
    FILE_CONTENT_TYPES,
    TEXT_CONTENT_TYPES,
    URL_CONTENT_TYPES,
    validate_uploaded_file,
)


class ContentSerializer(TenantScopedModelSerializer):
    tenant_scoped_fields = {
        "stage": Stage,
        "grade": Grade,
        "group": Group,
        "subject": Subject,
        "course": Course,
        "chapter": Chapter,
        "lesson": Lesson,
        "academic_year": AcademicYear,
        "term": Term,
    }

    stage_name = serializers.CharField(source="stage.name", read_only=True, allow_null=True)
    grade_name = serializers.CharField(source="grade.name", read_only=True, allow_null=True)
    subject_name = serializers.CharField(source="subject.name", read_only=True, allow_null=True)
    course_name = serializers.CharField(source="course.name", read_only=True, allow_null=True)
    chapter_name = serializers.CharField(source="chapter.name", read_only=True, allow_null=True)
    lesson_name = serializers.CharField(source="lesson.name", read_only=True, allow_null=True)
    academic_year_name = serializers.CharField(
        source="academic_year.name", read_only=True, allow_null=True
    )
    term_name = serializers.CharField(source="term.name", read_only=True, allow_null=True)

    class Meta:
        model = Content
        fields = [
            "id",
            "title",
            "content_type",
            "description",
            "file",
            "original_filename",
            "external_url",
            "text_body",
            "is_published",
            "is_public",
            "scan_status",
            "stage",
            "stage_name",
            "grade",
            "grade_name",
            "group",
            "subject",
            "subject_name",
            "course",
            "course_name",
            "chapter",
            "chapter_name",
            "lesson",
            "lesson_name",
            "academic_year",
            "academic_year_name",
            "term",
            "term_name",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "original_filename",
            "scan_status",
            "created_by",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {"file": {"write_only": True}}

    def validate(self, attrs):
        def current(field, blank=""):
            if field in attrs:
                return attrs[field]
            if self.instance is not None:
                return getattr(self.instance, field, blank)
            return blank

        # -------------------------------------------------------------------
        # Scope consistency (NEW — closes a real data-integrity hole).
        #
        # Each scope field is independent and optional, but if the caller
        # sets MORE THAN ONE that have a natural relationship, they must
        # agree. Otherwise a row can end up with e.g. academic_year=2024
        # but term belonging to 2025, or a chapter from a different course
        # than the row's own course — the visibility service would produce
        # contradictory results.
        # -------------------------------------------------------------------
        academic_year = current("academic_year", None)
        term = current("term", None)
        course = current("course", None)
        chapter = current("chapter", None)
        lesson = current("lesson", None)
        grade = current("grade", None)

        if term and academic_year and term.academic_year_id != academic_year.id:
            raise serializers.ValidationError(
                {"term": "الترم المختار لا ينتمي للسنة الدراسية المحددة."}
            )

        if chapter and course and chapter.course_id != course.id:
            raise serializers.ValidationError(
                {"chapter": "الفصل المختار لا ينتمي للمادة الدراسية المحددة."}
            )

        if lesson and chapter and lesson.chapter_id != chapter.id:
            raise serializers.ValidationError({"lesson": "الدرس المختار لا ينتمي للفصل المحدد."})

        if course and grade and course.grade_id != grade.id:
            raise serializers.ValidationError({"grade": "الصف المحدد لا يطابق صف المادة الدراسية."})

        # -------------------------------------------------------------------
        # Content-type vs payload consistency (unchanged).
        # -------------------------------------------------------------------
        content_type = attrs.get("content_type") or getattr(self.instance, "content_type", None)
        uploaded_file = attrs.get("file")
        external_url = current("external_url")
        text_body = current("text_body")

        if content_type in FILE_CONTENT_TYPES:
            if not uploaded_file and not (self.instance and self.instance.file):
                raise serializers.ValidationError({"file": "هذا النوع من المحتوى يتطلب رفع ملف."})
            if external_url or text_body:
                raise serializers.ValidationError(
                    {
                        "content_type": "لا يجب تحديد external_url أو text_body مع نوع محتوى يعتمد على ملف."
                    }
                )
            if uploaded_file:
                policy = self.context["request"].tenant.get_policy("content_policy")
                max_mb = policy.get("max_file_size_mb")
                try:
                    validate_uploaded_file(uploaded_file, content_type, max_size_override_mb=max_mb)
                except DjangoValidationError as exc:
                    raise serializers.ValidationError({"file": list(exc.messages)})
        elif content_type in URL_CONTENT_TYPES:
            if not external_url:
                raise serializers.ValidationError(
                    {"external_url": "هذا النوع من المحتوى يتطلب رابطًا خارجيًا."}
                )
            if uploaded_file or text_body:
                raise serializers.ValidationError(
                    {"content_type": "لا يجب رفع ملف أو تحديد text_body مع رابط خارجي."}
                )
        elif content_type in TEXT_CONTENT_TYPES:
            if not text_body:
                raise serializers.ValidationError({"text_body": "هذا النوع من المحتوى يتطلب نصًا."})
            if uploaded_file or external_url:
                raise serializers.ValidationError(
                    {"content_type": "لا يجب رفع ملف أو تحديد external_url مع محتوى نصي."}
                )

        # WARNING: content attached to a lesson the creator doesn't teach.
        request = self.context.get("request")
        if request and request.user.role == "TEACHER":
            lesson_val = current("lesson", None)
            if lesson_val is not None:
                from apps.people.models import TeacherAssignment

                teaches_course = (
                    TeacherAssignment.objects.for_tenant(request.tenant)
                    .filter(
                        teacher=request.user,
                        course=lesson_val.chapter.course,
                    )
                    .exists()
                )
                if not teaches_course:
                    self.add_warning(
                        "lesson",
                        f"أنت لا تُدرِّس المادة '{lesson_val.chapter.course.name}' — "
                        f"هذا المحتوى لن يظهر للطلاب.",
                    )

        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        if "is_published" not in self.initial_data:
            validated_data["is_published"] = True
        uploaded_file = validated_data.get("file")
        if uploaded_file:
            validated_data["original_filename"] = uploaded_file.name
        validated_data["created_by"] = request.user
        return super().create(validated_data)
