from django.urls import path

from .views_parent import (
    AdminParentLinkViewSet,
    ParentChildDetailView,
    ParentChildrenView,
)

urlpatterns = [
    # Parent portal (read-only)
    path(
        "parent/children/",
        ParentChildrenView.as_view(),
        name="parent-children",
    ),
    path(
        "parent/children/<uuid:student_id>/",
        ParentChildDetailView.as_view(),
        name="parent-child-detail",
    ),
    # Admin-side linking
    path(
        "admin/parent-links/",
        AdminParentLinkViewSet.as_view(),
        name="admin-parent-links-create",
    ),
    path(
        "admin/parent-links/<uuid:link_id>/",
        AdminParentLinkViewSet.as_view(),
        name="admin-parent-links-delete",
    ),
]