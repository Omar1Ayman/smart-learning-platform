"""
TenantScopedRelationsMixin: the "Relationship permission" layer from
ARCHITECTURE.md #2, step 5, factored out so every app that needs it
(academics, people, and whatever comes next) shares one implementation
instead of copy-pasting the __init__ override.
"""

from rest_framework import serializers

from .warnings import WarningSerializerMixin

class TenantScopedRelationsMixin:
    """Mix into any serializers.ModelSerializer. `tenant_scoped_fields`
    maps a field name to either:
      - a TenantScopedModel subclass (uses Model.objects.for_tenant(tenant)), or
      - a callable tenant -> QuerySet (for anything needing extra
        filtering, e.g. User.objects.for_tenant(tenant).filter(role=...))

    A foreign tenant's id is never a valid choice for the field at all —
    it fails the same way a made-up id would (a plain validation error),
    never confirming whether the id exists in another tenant.
    """

    tenant_scoped_fields: dict = {}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        for field_name, resolver in self.tenant_scoped_fields.items():
            if field_name not in self.fields:
                continue
            is_model = hasattr(resolver, "objects")
            if tenant is None:
                queryset = resolver.objects.none() if is_model else resolver(None)
            else:
                queryset = resolver.objects.for_tenant(tenant) if is_model else resolver(tenant)
            self.fields[field_name].queryset = queryset




class TenantScopedModelSerializer(
    WarningSerializerMixin, TenantScopedRelationsMixin, serializers.ModelSerializer
):
    pass