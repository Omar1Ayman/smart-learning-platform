"""Separate from urls.py on purpose: these mount at /api/v1/, not under
/api/v1/auth/ — managing tenant members isn't an auth concern."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import StudentDetailView, TeacherDetailView, UserViewSet

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")

urlpatterns = [
    path("students/<uuid:user_id>/", StudentDetailView.as_view(), name="student-detail"),
    path("teachers/<uuid:user_id>/", TeacherDetailView.as_view(), name="teacher-detail"),
] + router.urls