from rest_framework.routers import DefaultRouter

from .views import QuestionBankViewSet, QuestionViewSet

router = DefaultRouter()
router.register("question-banks", QuestionBankViewSet, basename="question-bank")
router.register("questions", QuestionViewSet, basename="question")

urlpatterns = router.urls
