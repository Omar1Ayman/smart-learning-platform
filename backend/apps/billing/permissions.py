"""DRF permission classes for billing feature gates."""

from rest_framework.permissions import BasePermission

from .services import has_feature


def HasFeature(feature_key: str) -> type[BasePermission]:
    """Factory: returns a BasePermission class gating `feature_key`.

    Usage:
        @action(permission_classes=[HasFeature("bulk_grading")])
        def bulk_grade(self, request): ...

    Returns 403 PermissionDenied with a clear Arabic message when the
    tenant's plan doesn't include the feature.
    """

    class _HasFeature(BasePermission):
        message = "هذه الميزة غير متاحة في باقتك الحالية. قم بالترقية للوصول إليها."

        def has_permission(self, request, view):
            tenant = getattr(request, "tenant", None)
            if tenant is None:
                return False
            return has_feature(tenant, feature_key)

    _HasFeature.__name__ = f"HasFeature_{feature_key}"
    return _HasFeature
