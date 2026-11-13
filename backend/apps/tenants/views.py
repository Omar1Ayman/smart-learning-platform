from django.conf import settings
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.permissions import SAFE_METHODS
from .serializers import TenantSignupSerializer
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.audit.services import log_action
from apps.common.mixins import TenantContextMixin
from apps.common.permissions import HasRole, IsTenantMember
from apps.tenants.permissions import CanManageTenantSettings

from .settings_serializers import TenantBrandingSerializer, TenantSettingsSerializer

class TenantSignupView(generics.CreateAPIView):
    """POST /api/v1/auth/signup/ — public. See TenantSignupSerializer."""

    serializer_class = TenantSignupSerializer
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "signup"

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = serializer.save()
        data = serializer.to_representation(result)
        refresh = data.pop("refresh")
        response = Response(data, status=status.HTTP_201_CREATED)
        response.set_cookie(
            key=settings.REFRESH_TOKEN_COOKIE_NAME,
            value=refresh,
            httponly=True,
            secure=not settings.DEBUG,
            samesite=settings.REFRESH_TOKEN_COOKIE_SAMESITE,
            max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
            path=settings.REFRESH_TOKEN_COOKIE_PATH,
        )
        return response

class TenantSettingsView(TenantContextMixin, APIView):
    """GET/PATCH /tenant/settings/ — policy configuration.

    F-19 FIX (Milestone 2, Batch 9): previously OWNER-only for BOTH read
    and write. That hid every policy from ADMIN — the role responsible
    for day-to-day operations. An ADMIN couldn't even answer a teacher's
    "why is fullscreen forced?" without escalating to the owner.

    Access matrix (intentionally asymmetric):
      - GET:   OWNER or ADMIN — read is a transparency requirement.
      -       PATCH: OWNER, or ADMIN when the owner enables admins_can_manage_settings.
    """

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsAuthenticated(), IsTenantMember(), HasRole("OWNER", "ADMIN")()]
        return [IsAuthenticated(), IsTenantMember(), CanManageTenantSettings()]

    def get(self, request):
        return Response(request.tenant.get_settings())

    def patch(self, request):
        serializer = TenantSettingsSerializer(
            data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.update(request.tenant, serializer.validated_data)
        log_action(
            actor=request.user,
            tenant=request.tenant,
            action="tenant.settings_updated",
            metadata={"sections": list(serializer.validated_data.keys())},
        )
        return Response(request.tenant.get_settings())


class TenantBrandingView(TenantContextMixin, APIView):
    """GET/PATCH /tenant/branding/ — name + logo + colors + contact email."""

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsAuthenticated(), IsTenantMember(), HasRole("OWNER", "ADMIN")()]
        return [IsAuthenticated(), IsTenantMember(), CanManageTenantSettings()]

    def get(self, request):
        t = request.tenant
        return Response({
            "name": t.name,
            "primary_color": t.primary_color,
            "logo_url": t.logo_url,
            "contact_email": t.contact_email,
        })

    def patch(self, request):
        serializer = TenantBrandingSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        t = request.tenant
        for field, value in serializer.validated_data.items():
            setattr(t, field, value)
        t.save(update_fields=list(serializer.validated_data.keys()) + ["updated_at"])
        log_action(
            actor=request.user,
            tenant=t,
            action="tenant.branding_updated",
            metadata={"fields": list(serializer.validated_data.keys())},
        )
        return Response({
            "name": t.name,
            "primary_color": t.primary_color,
            "logo_url": t.logo_url,
            "contact_email": t.contact_email,
        })