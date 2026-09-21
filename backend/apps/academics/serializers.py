"""
Every FK to another tenant-scoped model is deliberately re-scoped to
request.tenant in __init__ — this is the "Relationship permission" layer
from ARCHITECTURE.md #2, step 5. A foreign tenant's id is not a valid
choice for the field at all, so it fails the same way a made-up id would
(a plain validation error), never confirming whether the id exists
elsewhere. `tenant` itself is never a field on any of these serializers —
it is set server-side only (apps/common/views.py TenantScopedViewSet).
"""

from rest_framework import serializers

from .models import AcademicYear, Grade, Group, Stage, Subject, Term


class _TenantScopedSerializer(serializers.ModelSerializer):
    """Base that rescopes any PrimaryKeyRelatedField named in
    `tenant_scoped_fields` to the requesting tenant."""

    tenant_scoped_fields: dict = {}  # field_name -> model class

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        for field_name, model in self.tenant_scoped_fields.items():
            if field_name in self.fields:
                if tenant is not None:
                    self.fields[field_name].queryset = model.objects.for_tenant(tenant)
                else:
                    self.fields[field_name].queryset = model.objects.none()


class AcademicYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicYear
        fields = ["id", "name", "start_date", "end_date", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class TermSerializer(_TenantScopedSerializer):
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


class GradeSerializer(_TenantScopedSerializer):
    tenant_scoped_fields = {"stage": Stage}

    class Meta:
        model = Grade
        fields = ["id", "stage", "name", "order", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class GroupSerializer(_TenantScopedSerializer):
    tenant_scoped_fields = {"grade": Grade, "academic_year": AcademicYear}

    class Meta:
        model = Group
        fields = ["id", "grade", "academic_year", "name", "capacity", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ["id", "name", "code", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
