from django.urls import path

from .views import TenantBrandingView, TenantSettingsView, TenantSignupView

urlpatterns = [
    path("signup/", TenantSignupView.as_view(), name="tenant-signup"),
]

# Separate prefix for /tenant/* — not under /auth/
tenant_urlpatterns = [
    path("tenant/settings/", TenantSettingsView.as_view(), name="tenant-settings"),
    path("tenant/branding/", TenantBrandingView.as_view(), name="tenant-branding"),
]