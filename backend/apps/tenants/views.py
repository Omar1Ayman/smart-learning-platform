from django.conf import settings
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .serializers import TenantSignupSerializer


class TenantSignupView(generics.CreateAPIView):
    """POST /api/v1/auth/signup/ — public. See TenantSignupSerializer."""

    serializer_class = TenantSignupSerializer
    permission_classes = [AllowAny]

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
            samesite="Strict",
            max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
            path=settings.REFRESH_TOKEN_COOKIE_PATH,
        )
        return response
