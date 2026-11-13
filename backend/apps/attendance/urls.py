from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AttendanceSessionViewSet,
    GroupScheduleViewSet,
    LookupStudentByCodeView,
    MarkQRView,
)

router = DefaultRouter()
router.register(
    "attendance/sessions",
    AttendanceSessionViewSet,
    basename="attendance-session",
)
router.register(
    "attendance/schedules",
    GroupScheduleViewSet,
    basename="group-schedule",
)

urlpatterns = [
    path("attendance/mark-qr/", MarkQRView.as_view(), name="attendance-mark-qr"),
    path(
        "attendance/lookup-by-code/",
        LookupStudentByCodeView.as_view(),
        name="attendance-lookup-by-code",
    ),
] + router.urls