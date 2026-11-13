from django.urls import path

from .views import SetupStatusView

urlpatterns = [
    path("setup-status/", SetupStatusView.as_view(), name="setup-status"),
]
