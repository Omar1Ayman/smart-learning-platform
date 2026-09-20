from rest_framework.routers import DefaultRouter

from .views import AcademicYearViewSet, GradeViewSet, GroupViewSet, StageViewSet, SubjectViewSet, TermViewSet

router = DefaultRouter()
router.register("academic-years", AcademicYearViewSet, basename="academic-year")
router.register("terms", TermViewSet, basename="term")
router.register("stages", StageViewSet, basename="stage")
router.register("grades", GradeViewSet, basename="grade")
router.register("groups", GroupViewSet, basename="group")
router.register("subjects", SubjectViewSet, basename="subject")

urlpatterns = router.urls
