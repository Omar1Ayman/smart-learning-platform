from django.urls import path

from .views import (
    ChangePasswordView,
    CookieTokenRefreshView,
    LogoutView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    ProfileView,
    RevokeAllSessionsView,
    RevokeSessionView,
    TenantTokenObtainPairView,
    TwoFactorDisableView,
    TwoFactorEnableView,
    TwoFactorLoginView,
    TwoFactorSetupView,
    UserSessionsView,
)

urlpatterns = [
    path("login/", TenantTokenObtainPairView.as_view(), name="login"),
    path("login/2fa/", TwoFactorLoginView.as_view(), name="login-2fa"),
    path("refresh/", CookieTokenRefreshView.as_view(), name="token-refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("password-reset/", PasswordResetRequestView.as_view(), name="password-reset-request"),
    path(
        "password-reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    # 2FA
    path("2fa/setup/", TwoFactorSetupView.as_view(), name="2fa-setup"),
    path("2fa/enable/", TwoFactorEnableView.as_view(), name="2fa-enable"),
    path("2fa/disable/", TwoFactorDisableView.as_view(), name="2fa-disable"),
    # Sessions
    path("sessions/", UserSessionsView.as_view(), name="user-sessions"),
    path("sessions/revoke-all/", RevokeAllSessionsView.as_view(), name="sessions-revoke-all"),
    path("sessions/<uuid:session_id>/revoke/", RevokeSessionView.as_view(), name="session-revoke"),
    path("profile/", ProfileView.as_view(), name="user-profile"),
]
