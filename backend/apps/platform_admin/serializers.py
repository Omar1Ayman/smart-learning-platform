from decimal import Decimal

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from apps.accounts.models import User
from apps.audit.serializers import AuditLogSerializer
from apps.billing.constants import FEATURES, LIMITS
from apps.billing.models import Plan, Subscription
from apps.tenants.models import DemoRequest, Tenant


class PlatformUserSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source="tenant.name", read_only=True)
    tenant_slug = serializers.CharField(source="tenant.slug", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "tenant_id",
            "tenant_name",
            "tenant_slug",
            "date_joined",
            "last_login",
        ]
        read_only_fields = fields


class PlatformUserStatusSerializer(serializers.Serializer):
    is_active = serializers.BooleanField()


class PlatformAuditLogSerializer(AuditLogSerializer):
    tenant_name = serializers.CharField(source="tenant.name", read_only=True, allow_null=True)
    tenant_slug = serializers.CharField(source="tenant.slug", read_only=True, allow_null=True)

    class Meta(AuditLogSerializer.Meta):
        fields = [*AuditLogSerializer.Meta.fields, "tenant_name", "tenant_slug"]
        read_only_fields = fields


class TenantAdminListSerializer(serializers.ModelSerializer):
    """Row shape for the /platform/tenants table."""

    user_count = serializers.SerializerMethodField()
    owner_email = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = [
            "id",
            "name",
            "slug",
            "status",
            "trial_ends_at",
            "user_count",
            "owner_email",
            "created_at",
        ]
        read_only_fields = fields

    def get_user_count(self, obj):
        return obj.users.count()

    def get_owner_email(self, obj):
        # M4 fix: uses the Prefetch cache from PlatformTenantViewSet.
        # Falls back to a DB query only if the cache isn't present
        # (e.g. serializer used standalone in tests).
        owners = getattr(obj, "_owners_cache", None)
        if owners is None:
            owner = obj.users.filter(role=User.Role.OWNER).first()
            return owner.email if owner else None
        return owners[0].email if owners else None


class TenantAdminDetailSerializer(serializers.ModelSerializer):
    """Full read shape for /platform/tenants/<id>."""

    users = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = [
            "id",
            "name",
            "slug",
            "status",
            "trial_ends_at",
            "contact_email",
            "primary_color",
            "logo_url",
            "internal_notes",
            "created_at",
            "updated_at",
            "users",
        ]
        read_only_fields = fields

    def get_users(self, obj):
        return [
            {
                "id": str(u.id),
                "email": u.email,
                "role": u.role,
                "is_active": u.is_active,
                "first_name": u.first_name,
                "last_name": u.last_name,
            }
            for u in obj.users.all().order_by("role", "email")
        ]


class CreateTenantSerializer(serializers.Serializer):
    """Creates a Tenant + its OWNER user atomically. Platform-admin only.

    Input is deliberately minimal — we don't want platform admins
    guessing at schema internals during sales calls.
    """

    tenant_name = serializers.CharField(max_length=255)
    owner_email = serializers.EmailField()
    owner_password = serializers.CharField(write_only=True, min_length=10)
    owner_first_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    owner_last_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    status = serializers.ChoiceField(
        choices=Tenant.Status.choices, default=Tenant.Status.TRIAL
    )
    trial_days = serializers.IntegerField(min_value=0, max_value=365, default=14)
    contact_email = serializers.EmailField(required=False, allow_blank=True, default="")
    internal_notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_owner_email(self, value):
        value = value.lower()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("هذا البريد الإلكتروني مستخدم بالفعل.")
        return value

    def validate_owner_password(self, value):
        # Mirror the same password-validator rule that /api/v1/users/ uses
        # (H-8) so platform-admin-created owners aren't exempt.
        temp_user = User(
            email=(self.initial_data.get("owner_email") or "").lower(),
            first_name=self.initial_data.get("owner_first_name", ""),
            last_name=self.initial_data.get("owner_last_name", ""),
        )
        try:
            validate_password(value, user=temp_user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    @transaction.atomic
    def create(self, validated_data):
        from datetime import timedelta

        from django.utils import timezone

        from apps.audit.services import log_action

        request = self.context["request"]

        tenant = Tenant.objects.create(
            name=validated_data["tenant_name"],
            slug=Tenant.generate_unique_slug(validated_data["tenant_name"]),
            status=validated_data["status"],
            contact_email=validated_data.get("contact_email", ""),
            internal_notes=validated_data.get("internal_notes", ""),
            created_by_platform_admin=request.user,
            trial_ends_at=(
                timezone.now() + timedelta(days=validated_data["trial_days"])
                if validated_data["status"] == Tenant.Status.TRIAL
                else None
            ),
        )
        owner = User.objects.create_user(
            email=validated_data["owner_email"],
            password=validated_data["owner_password"],
            tenant=tenant,
            role=User.Role.OWNER,
            first_name=validated_data.get("owner_first_name", ""),
            last_name=validated_data.get("owner_last_name", ""),
        )
        log_action(
            actor=request.user,
            tenant=tenant,
            action="platform.tenant_created",
            obj=tenant,
            metadata={"owner_email": owner.email, "status": tenant.status},
        )
        return {"tenant": tenant, "owner": owner}


class UpdateTenantStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Tenant.Status.choices)
    internal_notes = serializers.CharField(required=False, allow_blank=True)


class ResetOwnerPasswordSerializer(serializers.Serializer):
    """M-18 FIX (Wave Zero): the previous version only enforced
    `min_length=10`. A platform admin could reset an owner's password
    to `aaaaaaaaaa` — a common-password value that Django's
    CommonPasswordValidator rejects on every other auth path
    (signup, change, reset). The owner context is injected by the view
    so UserAttributeSimilarityValidator can also compare against the
    owner's email/name.
    """

    new_password = serializers.CharField(write_only=True, min_length=10)

    def validate_new_password(self, value):
        owner = self.context.get("owner")
        if owner is not None:
            try:
                validate_password(value, user=owner)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(list(exc.messages))
        return value


class DemoRequestCreateSerializer(serializers.ModelSerializer):
    """Public input for POST /api/v1/demo-requests/."""

    class Meta:
        model = DemoRequest
        fields = ["school_name", "contact_name", "email", "phone", "num_students", "message"]

    def validate_email(self, value):
        return value.lower()


class DemoRequestAdminSerializer(serializers.ModelSerializer):
    """Read shape for the platform admin list/detail."""

    reviewed_by_email = serializers.SerializerMethodField()
    converted_tenant_id = serializers.SerializerMethodField()

    class Meta:
        model = DemoRequest
        fields = [
            "id",
            "school_name",
            "contact_name",
            "email",
            "phone",
            "num_students",
            "message",
            "status",
            "notes",
            "reviewed_by_email",
            "reviewed_at",
            "converted_tenant_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_reviewed_by_email(self, obj):
        return obj.reviewed_by.email if obj.reviewed_by_id else None

    def get_converted_tenant_id(self, obj):
        return str(obj.converted_tenant_id) if obj.converted_tenant_id else None


class DemoRequestUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=DemoRequest.Status.choices)
    notes = serializers.CharField(required=False, allow_blank=True)


class PlatformPlanSerializer(serializers.ModelSerializer):
    features = serializers.DictField(
        child=serializers.BooleanField(), required=False
    )

    class Meta:
        model = Plan
        fields = [
            "id",
            "key",
            "name",
            "description",
            "price_monthly",
            "price_yearly",
            "currency",
            "is_active",
            "is_public",
            "display_order",
            "max_students",
            "max_teachers",
            "max_storage_mb",
            "max_assessments_per_month",
            "features",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {
            "price_monthly": {"min_value": Decimal("0")},
            "price_yearly": {"min_value": Decimal("0")},
            "max_students": {"required": False, "allow_null": True, "min_value": 0},
            "max_teachers": {"required": False, "allow_null": True, "min_value": 0},
            "max_storage_mb": {"required": False, "allow_null": True, "min_value": 0},
            "max_assessments_per_month": {
                "required": False,
                "allow_null": True,
                "min_value": 0,
            },
        }

    def validate_key(self, value):
        if self.instance and value != self.instance.key:
            raise serializers.ValidationError(
                "معرّف الخطة ثابت بعد إنشائها حتى لا تتعطل الاشتراكات الحالية."
            )
        return value

    def validate_is_active(self, value):
        if self.instance and self.instance.key == "free" and not value:
            raise serializers.ValidationError(
                "لا يمكن إيقاف الباقة المجانية الافتراضية."
            )
        return value

    def validate_features(self, value):
        unknown = set(value) - set(FEATURES)
        if unknown:
            raise serializers.ValidationError(
                f"مفاتيح ميزات غير معروفة: {', '.join(sorted(unknown))}."
            )
        return value


class PlatformBillingTenantSerializer(serializers.ModelSerializer):
    plan_id = serializers.SerializerMethodField()
    plan_key = serializers.SerializerMethodField()
    plan_name = serializers.SerializerMethodField()
    subscription_status = serializers.SerializerMethodField()
    is_implicit = serializers.SerializerMethodField()
    current_period_end = serializers.SerializerMethodField()
    subscription_trial_end = serializers.SerializerMethodField()
    feature_overrides = serializers.SerializerMethodField()
    limit_overrides = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = [
            "id",
            "name",
            "slug",
            "status",
            "contact_email",
            "plan_id",
            "plan_key",
            "plan_name",
            "subscription_status",
            "is_implicit",
            "current_period_end",
            "subscription_trial_end",
            "feature_overrides",
            "limit_overrides",
        ]
        read_only_fields = fields

    def _subscription(self, obj):
        try:
            return obj.subscription
        except Subscription.DoesNotExist:
            return None

    def _plan(self, obj):
        subscription = self._subscription(obj)
        if subscription:
            return subscription.plan
        return self.context.get("default_plan")

    def get_plan_id(self, obj):
        plan = self._plan(obj)
        return str(plan.id) if plan else None

    def get_plan_key(self, obj):
        plan = self._plan(obj)
        return plan.key if plan else None

    def get_plan_name(self, obj):
        plan = self._plan(obj)
        return plan.name if plan else None

    def get_subscription_status(self, obj):
        subscription = self._subscription(obj)
        return subscription.status if subscription else "IMPLICIT_FREE"

    def get_is_implicit(self, obj):
        return self._subscription(obj) is None

    def get_current_period_end(self, obj):
        subscription = self._subscription(obj)
        return subscription.current_period_end if subscription else None

    def get_subscription_trial_end(self, obj):
        subscription = self._subscription(obj)
        return subscription.trial_end if subscription else None

    def get_feature_overrides(self, obj):
        subscription = self._subscription(obj)
        return subscription.feature_overrides if subscription else {}

    def get_limit_overrides(self, obj):
        subscription = self._subscription(obj)
        return subscription.limit_overrides if subscription else {}


class PlatformAssignSubscriptionSerializer(serializers.Serializer):
    plan_key = serializers.SlugRelatedField(
        slug_field="key", queryset=Plan.objects.filter(is_active=True)
    )
    status = serializers.ChoiceField(choices=Subscription.Status.choices)
    trial_days = serializers.IntegerField(min_value=0, max_value=365, required=False)
    feature_overrides = serializers.DictField(
        child=serializers.BooleanField(), required=False
    )
    limit_overrides = serializers.DictField(
        child=serializers.IntegerField(min_value=0, allow_null=True), required=False
    )

    def validate_feature_overrides(self, value):
        unknown = set(value) - set(FEATURES)
        if unknown:
            raise serializers.ValidationError(
                f"مفاتيح ميزات غير معروفة: {', '.join(sorted(unknown))}."
            )
        return value

    def validate_limit_overrides(self, value):
        unknown = set(value) - set(LIMITS)
        if unknown:
            raise serializers.ValidationError(
                f"مفاتيح حدود غير معروفة: {', '.join(sorted(unknown))}."
            )
        return value
