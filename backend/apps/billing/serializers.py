"""Phase 1.1 — Billing serializers."""

from rest_framework import serializers

from .constants import FEATURES, LIMITS
from .models import Plan


class PlanSerializer(serializers.ModelSerializer):
    """Public shape — safe to expose on the landing page."""

    features = serializers.SerializerMethodField()
    limits = serializers.SerializerMethodField()

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
            "display_order",
            "features",
            "limits",
        ]
        read_only_fields = fields

    def get_features(self, obj) -> dict[str, bool]:
        """Always return ALL known features (missing = False)."""
        return {key: obj.has_feature(key) for key in FEATURES}

    def get_limits(self, obj) -> dict[str, int | None]:
        return {key: getattr(obj, key, None) for key in LIMITS}


class UsageItemSerializer(serializers.Serializer):
    current = serializers.IntegerField()
    max = serializers.IntegerField(allow_null=True)
    unit = serializers.CharField()


class FeatureStatusSerializer(serializers.Serializer):
    """Simple {key: bool} map for the frontend."""
    features = serializers.DictField(child=serializers.BooleanField())


class MyPlanSerializer(serializers.Serializer):
    """Response for GET /billing/me/."""

    plan = PlanSerializer()
    status = serializers.CharField()
    is_implicit = serializers.BooleanField()
    trial = serializers.DictField()
    cancel_at_period_end = serializers.BooleanField()
    current_period_end = serializers.CharField(allow_null=True)
    features = serializers.DictField(child=serializers.BooleanField())
    limits = serializers.DictField(allow_null=True)