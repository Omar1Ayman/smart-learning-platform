from django.urls import path

from .views import TenantSignupView

urlpatterns = [
    path("signup/", TenantSignupView.as_view(), name="tenant-signup"),
]
