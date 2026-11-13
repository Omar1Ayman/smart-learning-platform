from django.urls import path

from .views import (
    StudentImportTemplateView,
    StudentImportView,
    TenantExportView,
)

urlpatterns = [
    path("tenant/export/", TenantExportView.as_view(), name="tenant-export"),
    path(
        "tenant/import/template/",
        StudentImportTemplateView.as_view(),
        name="student-import-template",
    ),
    path("tenant/import/students/", StudentImportView.as_view(), name="student-import"),
]
