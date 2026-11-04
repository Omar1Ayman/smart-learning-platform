from rest_framework.routers import DefaultRouter

from .views import AssessmentQuestionViewSet, AssessmentTargetViewSet, AssessmentViewSet

router = DefaultRouter()
router.register("assessments", AssessmentViewSet, basename="assessment")
router.register("assessment-questions", AssessmentQuestionViewSet, basename="assessment-question")
router.register("assessment-targets", AssessmentTargetViewSet, basename="assessment-target")

urlpatterns = router.urls
