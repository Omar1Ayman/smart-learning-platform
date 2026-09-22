"""Separate from urls.py on purpose: these mount at /api/v1/ (alongside
academics/people), not under /api/v1/auth/ — managing tenant members
isn't an auth concern, it just happens to live in the accounts app
because that's where the User model is."""

from rest_framework.routers import DefaultRouter

from .views import UserViewSet

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")

urlpatterns = router.urls
