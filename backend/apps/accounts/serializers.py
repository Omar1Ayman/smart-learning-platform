from rest_framework import serializers

from .models import User


class MeTenantSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    slug = serializers.CharField()


class MeSerializer(serializers.ModelSerializer):
    tenant = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "role", "tenant"]
        read_only_fields = fields

    def get_tenant(self, obj):
        if not obj.tenant_id:
            return None
        return {"id": str(obj.tenant.id), "name": obj.tenant.name, "slug": obj.tenant.slug}
