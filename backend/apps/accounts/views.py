"""
Auth endpoints. The refresh token never appears in a JSON body the
frontend's JS can read — it is set as an httpOnly cookie here and read
back from the cookie on refresh/logout. See SECURITY.md #2 (Session
attacks) and ARCHITECTURE.md #6 for why.
"""

from django.conf import settings
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .serializers import MeSerializer
from .tokens import TenantTokenObtainPairSerializer


def _set_refresh_cookie(response, refresh_token: str):
    response.set_cookie(
        key=settings.REFRESH_TOKEN_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="Strict",
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        path=settings.REFRESH_TOKEN_COOKIE_PATH,
    )


class TenantTokenObtainPairView(TokenObtainPairView):
    """POST /api/v1/auth/login/ — body: {email, password}."""

    serializer_class = TenantTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            refresh = response.data.pop("refresh")
            _set_refresh_cookie(response, refresh)
        return response


class CookieTokenRefreshView(TokenRefreshView):
    """POST /api/v1/auth/refresh/ — no body; reads the httpOnly cookie."""

    def post(self, request, *args, **kwargs):
        refresh_token = request.COOKIES.get(settings.REFRESH_TOKEN_COOKIE_NAME)
        if not refresh_token:
            return Response(
                {"error": {"status": 401, "detail": "لا يوجد جلسة نشطة."}},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        serializer = self.get_serializer(data={"refresh": refresh_token})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError:
            return Response(
                {"error": {"status": 401, "detail": "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى."}},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        data = dict(serializer.validated_data)
        new_refresh = data.pop("refresh", None)
        response = Response(data, status=status.HTTP_200_OK)
        if new_refresh:
            _set_refresh_cookie(response, new_refresh)
        return response


class LogoutView(APIView):
    """POST /api/v1/auth/logout/ — blacklists the refresh token and clears
    the cookie, so a copy of it (if one ever leaked) is dead immediately."""

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        refresh_token = request.COOKIES.get(settings.REFRESH_TOKEN_COOKIE_NAME)
        if refresh_token:
            try:
                RefreshToken(refresh_token).blacklist()
            except TokenError:
                pass
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(settings.REFRESH_TOKEN_COOKIE_NAME, path=settings.REFRESH_TOKEN_COOKIE_PATH)
        return response


class MeView(generics.RetrieveAPIView):
    serializer_class = MeSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user
