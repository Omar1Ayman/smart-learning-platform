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


class UserSerializer(serializers.ModelSerializer):
    """Read serializer for listing/retrieving tenant members — never
    exposes the password hash or any Django auth internals (SECURITY.md
    §1, 'Sensitive data exposure')."""

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "role", "is_active", "created_at"]
        read_only_fields = fields


class UserCreateSerializer(serializers.ModelSerializer):
    """OWNER/ADMIN-only (enforced by the view's permission_classes, same
    IsAdminForWriteActions used everywhere else). Creates a TEACHER,
    STUDENT, or ADMIN account inside the caller's own tenant — never
    OWNER (there is exactly one OWNER per tenant, set at signup) and
    never cross-tenant (tenant is taken from request.tenant, not from
    the request body, same rule as every other create path)."""

    password = serializers.CharField(write_only=True, min_length=10)

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "role", "password", "is_active"]
        read_only_fields = ["id"]

    def validate_email(self, value):
        value = value.lower()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("هذا البريد الإلكتروني مستخدم بالفعل.")
        return value

    def validate_role(self, value):
        if value not in (User.Role.ADMIN, User.Role.TEACHER, User.Role.STUDENT):
            raise serializers.ValidationError("الدور يجب أن يكون ADMIN أو TEACHER أو STUDENT.")
        return value

    def create(self, validated_data):
        request = self.context["request"]
        return User.objects.create_user(tenant=request.tenant, **validated_data)
