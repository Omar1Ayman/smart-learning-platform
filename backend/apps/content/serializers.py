from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.academics.models import AcademicYear, Chapter, Course, Grade, Group, Lesson, Stage, Subject, Term
from apps.common.serializers import TenantScopedModelSerializer

from .models import Content
from .validators import FILE_CONTENT_TYPES, TEXT_CONTENT_TYPES, URL_CONTENT_TYPES, validate_uploaded_file


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
            "grade",
            "group",
            "subject",
            "course",
            "chapter",
            "lesson",
            "academic_year",
            "term",
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
        extra_kwargs = {
            "file": {"write_only": True}
        }  # never hand back a direct file path — see views.download

    def validate(self, attrs):
        # For a partial update (PATCH), a field absent from `attrs` means
        # "unchanged", not "empty" — fall back to the existing instance's
        # value so e.g. renaming a TEXT content's title doesn't spuriously
        # fail because text_body "looks empty" (it just wasn't resubmitted).
        def current(field, blank=""):
            if field in attrs:
                return attrs[field]
            if self.instance is not None:
                return getattr(self.instance, field, blank)
            return blank

        content_type = attrs.get("content_type") or getattr(self.instance, "content_type", None)
        uploaded_file = attrs.get("file")
        external_url = current("external_url")
        text_body = current("text_body")

        if content_type in FILE_CONTENT_TYPES:
            if not uploaded_file and not (self.instance and self.instance.file):
                raise serializers.ValidationError({"file": "هذا النوع من المحتوى يتطلب رفع ملف."})
            if external_url or text_body:
                raise serializers.ValidationError(
                    {"content_type": "لا يجب تحديد external_url أو text_body مع نوع محتوى يعتمد على ملف."}
                )
            if uploaded_file:
                try:
                    validate_uploaded_file(uploaded_file, content_type)
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
        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        # DRF's BooleanField treats "absent from multipart/form data" as
        # False (mimicking an unchecked HTML checkbox — see
        # rest_framework.fields.Field.get_value), which silently
        # overrides the model's own `default=True` for is_published on
        # every multipart upload (i.e. every file upload, since file
        # fields require multipart). Only respect an explicit value the
        # client actually sent; otherwise keep the intended default.
        if "is_published" not in self.initial_data:
            validated_data["is_published"] = True
        uploaded_file = validated_data.get("file")
        if uploaded_file:
            validated_data["original_filename"] = uploaded_file.name
        validated_data["created_by"] = request.user
        return super().create(validated_data)
