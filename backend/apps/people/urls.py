from rest_framework.routers import DefaultRouter

from .views import EnrollmentViewSet, TeacherAssignmentViewSet

router = DefaultRouter()
router.register("teacher-assignments", TeacherAssignmentViewSet, basename="teacher-assignment")
router.register("enrollments", EnrollmentViewSet, basename="enrollment")

urlpatterns = router.urls
