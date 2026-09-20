from django.urls import path

from .views import CookieTokenRefreshView, LogoutView, MeView, TenantTokenObtainPairView

urlpatterns = [
    path("login/", TenantTokenObtainPairView.as_view(), name="login"),
    path("refresh/", CookieTokenRefreshView.as_view(), name="token-refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
]
