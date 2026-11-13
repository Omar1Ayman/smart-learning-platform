from django.urls import path

from .views import (
    MyBillingView,
    MyFeaturesView,
    MyUsageView,
    PublicPlansListView,
)

urlpatterns = [
    path("billing/plans/", PublicPlansListView.as_view(), name="billing-plans"),
    path("billing/me/", MyBillingView.as_view(), name="billing-me"),
    path("billing/usage/", MyUsageView.as_view(), name="billing-usage"),
    path("billing/features/", MyFeaturesView.as_view(), name="billing-features"),
]