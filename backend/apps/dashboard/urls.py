from django.urls import path

from .views import (
    AdminDashboardView,
    AdminReportsView,
    StudentDashboardView,
    TeacherDashboardView,
)

urlpatterns = [
    path("dashboard/admin/", AdminDashboardView.as_view(), name="dashboard-admin"),
    path("dashboard/teacher/", TeacherDashboardView.as_view(), name="dashboard-teacher"),
    path("dashboard/student/", StudentDashboardView.as_view(), name="dashboard-student"),
    # Batch 18 (Milestone 5)
    path("dashboard/reports/", AdminReportsView.as_view(), name="dashboard-reports"),
]
