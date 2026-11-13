"""
Permission primitives every domain app composes. Nothing here trusts a
client-supplied tenant id, and role checks always read request.user.role
(a fresh DB value — see apps/accounts/models.py), never a token claim.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsTenantMember(BasePermission):
    message = "يجب تسجيل الدخول ضمن مؤسسة (Tenant) فعالة."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request, "tenant", None) is not None
        )


def HasRole(*roles):
    """Factory returning a BasePermission subclass restricted to `roles`.
    Usage: permission_classes = [IsAuthenticated, HasRole("OWNER", "ADMIN")]
    """

    class _HasRole(BasePermission):
        message = f"هذا الإجراء متاح فقط للأدوار: {', '.join(roles)}."

        def has_permission(self, request, view):
            return bool(
                request.user and request.user.is_authenticated and request.user.role in roles
            )

    _HasRole.__name__ = f"HasRole_{'_'.join(roles)}"
    return _HasRole


class IsAdminForWriteActions(BasePermission):
    """Any authenticated tenant member may read (list/retrieve). Only
    OWNER/ADMIN may write (create/update/delete). This is the default
    write policy for the core academic structure."""

    message = "التعديل متاح فقط لمالك أو مسؤول المؤسسة."

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("OWNER", "ADMIN")
        )


class IsStaffForWriteActions(BasePermission):
    """Like IsAdminForWriteActions, but TEACHER may also write — for
    content where teachers realistically need to upload their own
    lesson material (spec doesn't restrict this to Admin only). Combine
    with IsOwnContentOrAdmin below for *object*-level write (a Teacher
    can edit their own upload; only OWNER/ADMIN can touch anyone else's)."""

    message = "التعديل متاح فقط لمالك أو مسؤول المؤسسة أو معلّم."

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("OWNER", "ADMIN", "TEACHER")
        )


class IsStaffMember(BasePermission):
    """Blocks STUDENT entirely — not a write-only gate like the classes
    above. For resources a student should never even browse (spec #29's
    question bank: seeing the question text ahead of time is nearly as
    bad as seeing the answer). OWNER/ADMIN/TEACHER pass for every method;
    STUDENT is refused before get_queryset() ever runs."""

    message = "هذا القسم متاح فقط لفريق العمل (مالك/مسؤول/معلّم)."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("OWNER", "ADMIN", "TEACHER")
        )


class IsCreatorOrAdmin(BasePermission):
    """Object-level: OWNER/ADMIN may modify anything; anyone else only
    what they themselves created (tracked via obj.created_by)."""

    message = "لا يمكنك تعديل محتوى أنشأه شخص آخر."

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        if request.user.role in ("OWNER", "ADMIN"):
            return True
        return getattr(obj, "created_by_id", None) == request.user.id


class IsSameTenantObject(BasePermission):
    """Object-level check: the row must belong to request.tenant. This is
    the backstop even if a queryset ever forgets to filter — defense in
    depth, not the only layer (see ARCHITECTURE.md #2, step 4)."""

    message = "هذا العنصر لا ينتمي إلى مؤسستك."

    def has_object_permission(self, request, view, obj):
        tenant = getattr(request, "tenant", None)
        obj_tenant_id = getattr(obj, "tenant_id", None)
        return tenant is not None and obj_tenant_id == tenant.id
