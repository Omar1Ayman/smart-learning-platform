from rest_framework.routers import DefaultRouter

from .views import (
    AcademicYearViewSet,
    ChapterViewSet,
    CourseViewSet,
    GradeViewSet,
    GroupViewSet,
    LessonViewSet,
    StageViewSet,
    SubjectViewSet,
    TermViewSet,
)

router = DefaultRouter()
router.register("academic-years", AcademicYearViewSet, basename="academic-year")
router.register("terms", TermViewSet, basename="term")
router.register("stages", StageViewSet, basename="stage")
router.register("grades", GradeViewSet, basename="grade")
router.register("groups", GroupViewSet, basename="group")
router.register("subjects", SubjectViewSet, basename="subject")
router.register("courses", CourseViewSet, basename="course")
router.register("chapters", ChapterViewSet, basename="chapter")
router.register("lessons", LessonViewSet, basename="lesson")

urlpatterns = router.urls
