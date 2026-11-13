"""Platform-admin permissions.

The platform admin is a User with `is_platform_admin=True` and NO tenant.
They sit outside the multi-tenant hierarchy and can see / manage every
tenant. This is a distinct layer from the tenant-scoped permissions
(IsTenantMember, IsAdminForWriteActions) and NEVER mixes with them —
platform endpoints never accept tenant-scoped users, and tenant
endpoints never accept platform admins without an explicit tenant.
"""

from rest_framework.permissions import BasePermission


class IsPlatformAdmin(BasePermission):
    message = "هذا الإجراء متاح لمديري المنصة فقط."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_platform_admin
            and request.user.tenant_id is None
        )
