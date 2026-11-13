"""Parent-specific permissions."""

from rest_framework.permissions import BasePermission

from .models import ParentChild


class IsParent(BasePermission):
    message = "هذا القسم متاح لأولياء الأمور فقط."

    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and request.user.role == "PARENT"
        )


class CanViewChild(BasePermission):
    """Object-level: the parent must have a ParentChild link to this student."""

    message = "ليس لديك صلاحية لعرض هذا الطالب."

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.role != "PARENT":
            return False
        return ParentChild.objects.filter(parent=request.user, student=obj).exists()
