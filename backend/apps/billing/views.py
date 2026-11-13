"""Phase 1.1 — Billing API endpoints.

Endpoints:
  GET /api/v1/billing/plans/     — public plans list (AllowAny)
  GET /api/v1/billing/me/        — current tenant's billing summary
  GET /api/v1/billing/usage/     — current usage vs limits
  GET /api/v1/billing/features/  — feature flag map for this tenant
"""

from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.mixins import TenantContextMixin
from apps.common.permissions import IsTenantMember
from apps.tenants.permissions import CanViewBilling

from .models import Plan
from .serializers import (
    FeatureStatusSerializer,
    MyPlanSerializer,
    PlanSerializer,
    UsageItemSerializer,
)
from .services import get_features_dict, get_plan_summary, get_usage


class PublicPlansListView(APIView):
    """GET /api/v1/billing/plans/ — public catalog.

    AllowAny so the landing page can display real plans (not hardcoded).
    Only `is_active=True AND is_public=True` plans are returned.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        plans = (
            Plan.objects.filter(is_active=True, is_public=True)
            .order_by("display_order", "price_monthly")
        )
        return Response(PlanSerializer(plans, many=True).data)


class MyBillingView(TenantContextMixin, APIView):
    """GET /api/v1/billing/me/ — current plan + status + features + limits."""

    permission_classes = [IsAuthenticated, IsTenantMember, CanViewBilling]

    def get(self, request):
        summary = get_plan_summary(request.tenant)
        return Response(MyPlanSerializer(summary).data)


class MyUsageView(TenantContextMixin, APIView):
    """GET /api/v1/billing/usage/ — current vs max for each limit.

    Response shape: {limit_key: {current, max, unit}}.
    Returned as-is (dict of dicts) — no serializer needed.
    """

    permission_classes = [IsAuthenticated, IsTenantMember, CanViewBilling]

    def get(self, request):
        return Response(get_usage(request.tenant))
class MyFeaturesView(TenantContextMixin, APIView):
    """GET /api/v1/billing/features/ — quick feature map."""

    permission_classes = [IsAuthenticated, IsTenantMember]

    def get(self, request):
        return Response(
            FeatureStatusSerializer(
                {"features": get_features_dict(request.tenant)}
            ).data
        )