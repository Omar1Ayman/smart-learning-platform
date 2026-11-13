from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AttemptViewSet, StartAttemptView

router = DefaultRouter()
router.register("attempts", AttemptViewSet, basename="attempt")

urlpatterns = [
    path(
        "assessments/<uuid:assessment_id>/start/",
        StartAttemptView.as_view(),
        name="assessment-start",
    ),
] + router.urls