from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from apps.common.views import HealthCheckView
from apps.tenants.urls import tenant_urlpatterns

urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health-check"),
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("apps.tenants.urls")),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.accounts.user_urls")),
    path("api/v1/", include("apps.accounts.urls_parent")),
    path("api/v1/", include("apps.academics.urls")),
    path("api/v1/", include("apps.people.urls")),
    path("api/v1/", include("apps.content.urls")),
    path("api/v1/", include("apps.questions.urls")),
    path("api/v1/", include("apps.assessments.urls")),
    path("api/v1/", include("apps.exam_engine.urls")),
    path("api/v1/", include("apps.dashboard.urls")),
    path("api/v1/", include("apps.platform_admin.urls")),
    path("api/v1/", include("apps.audit.urls")),
    path("api/v1/", include("apps.tenant_ops.urls")),
    path("api/v1/", include("apps.notifications.urls")),
    path("api/v1/", include("apps.attendance.urls")),
    path("api/v1/", include("apps.billing.urls")),  
    path("api/v1/", include(tenant_urlpatterns)),
    path("api/v1/", include("apps.common.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)