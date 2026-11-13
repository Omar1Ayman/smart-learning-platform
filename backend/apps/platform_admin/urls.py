from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    PlatformAuditLogViewSet,
    PlatformBillingTenantViewSet,
    PlatformDemoRequestViewSet,
    PlatformMetricsView,
    PlatformPlanViewSet,
    PlatformTenantViewSet,
    PlatformUserViewSet,
    PublicDemoRequestView,
)

router = DefaultRouter()
router.register("platform/tenants", PlatformTenantViewSet, basename="platform-tenant")
router.register("platform/users", PlatformUserViewSet, basename="platform-user")
router.register("platform/audit", PlatformAuditLogViewSet, basename="platform-audit")
router.register("platform/demo-requests", PlatformDemoRequestViewSet, basename="platform-demo")
router.register("platform/billing/plans", PlatformPlanViewSet, basename="platform-plan")
router.register(
    "platform/billing/tenants",
    PlatformBillingTenantViewSet,
    basename="platform-billing-tenant",
)

urlpatterns = [
    path("platform/metrics/", PlatformMetricsView.as_view(), name="platform-metrics"),
    path("demo-requests/", PublicDemoRequestView.as_view(), name="public-demo-request"),
] + router.urls
