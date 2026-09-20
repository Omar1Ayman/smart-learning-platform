from django.db import transaction
from rest_framework import serializers

from apps.accounts.models import User
from apps.accounts.tokens import TenantTokenObtainPairSerializer
from apps.audit.services import log_action

from .models import Tenant


class TenantSignupSerializer(serializers.Serializer):
    """Creates a Tenant + its OWNER user atomically (spec #89): a new
    customer can start using the platform with zero developer
    involvement. Nothing here lets the caller choose their own role or
    tenant — role is hardcoded to OWNER, tenant is always brand new."""

    tenant_name = serializers.CharField(max_length=255)
    owner_email = serializers.EmailField()
    owner_password = serializers.CharField(write_only=True, min_length=10)

    def validate_owner_email(self, value):
        value = value.lower()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("هذا البريد الإلكتروني مستخدم بالفعل.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        tenant = Tenant.objects.create(
            name=validated_data["tenant_name"],
            slug=Tenant.generate_unique_slug(validated_data["tenant_name"]),
        )
        owner = User.objects.create_user(
            email=validated_data["owner_email"],
            password=validated_data["owner_password"],
            tenant=tenant,
            role=User.Role.OWNER,
        )
        log_action(actor=owner, tenant=tenant, action="tenant.created", obj=tenant)
        return {"tenant": tenant, "user": owner}

    def to_representation(self, instance):
        tenant, user = instance["tenant"], instance["user"]
        token = TenantTokenObtainPairSerializer.get_token(user)
        return {
            "access": str(token.access_token),
            "refresh": str(token),
            "tenant": {"id": str(tenant.id), "name": tenant.name, "slug": tenant.slug},
            "user": {"id": str(user.id), "email": user.email, "role": user.role},
        }
