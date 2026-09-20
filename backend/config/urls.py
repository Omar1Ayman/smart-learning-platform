from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("apps.tenants.urls")),  # /auth/signup/
    path("api/v1/auth/", include("apps.accounts.urls")),  # /auth/login/, refresh/, logout/, me/
    path("api/v1/", include("apps.academics.urls")),
]
