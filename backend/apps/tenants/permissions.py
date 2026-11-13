"""Helper functions to check tenant permissions (RBAC)."""

from rest_framework.permissions import SAFE_METHODS, BasePermission


def tenant_can(tenant, permission_key: str) -> bool:
    """Check a specific permission at tenant level."""
    if not tenant:
        return False
    perms = tenant.get_policy("permissions")
    return bool(perms.get(permission_key, False))


def user_can(user, permission_key: str) -> bool:
    """Check if a specific user has a specific permission.

    OWNER always has all permissions (bypass).
    ADMIN follows admins_* and teachers_* permissions.
    TEACHER follows teachers_* permissions.
    """
    if not user or not user.tenant:
        return False


    # المالك دائماً لديه كل الصلاحيات
    if user.role == "OWNER":
        return True

    tenant = user.tenant
    perms = tenant.get_policy("permissions")

    if user.role == "ADMIN":
        return bool(perms.get(permission_key, False))

    if user.role == "TEACHER":
        if permission_key.startswith("teachers_") or permission_key == (
            "enable_audit_log_for_teachers"
        ):
            return bool(perms.get(permission_key, False))
        return False

    return False


class CanImportStudents(BasePermission):
    message = "استيراد الطلاب غير مسموح لدورك حسب إعدادات المؤسسة."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.role == "OWNER":
            return True
        if user.role == "ADMIN":
            return user_can(user, "enable_bulk_import")
        if user.role == "TEACHER":
            return user_can(user, "teachers_can_import_students") and tenant_can(
                user.tenant, "enable_bulk_import"
            )
        return False


class CanExportTenant(BasePermission):
    message = "تصدير بيانات المؤسسة غير مسموح لدورك حسب إعدادات المؤسسة."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.role == "OWNER":
            return True
        if user.role == "ADMIN":
            return user_can(user, "admins_can_export_data")
        if user.role == "TEACHER":
            return user_can(user, "teachers_can_export_data")
        return False


class CanManageTeachers(BasePermission):
    message = "إدارة المعلمين وتكليفاتهم غير مسموحة للمسؤول حسب إعدادات المؤسسة."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.role == "OWNER":
            return True
        if user.role != "ADMIN":
            return False
        return request.method in SAFE_METHODS or user_can(
            user, "admins_can_manage_teachers"
        )


class CanManageTenantSettings(BasePermission):
    message = "تعديل إعدادات المؤسسة متاح للمالك أو للمسؤول المصرح له فقط."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return user.role == "OWNER" or (
            user.role == "ADMIN"
            and user_can(user, "admins_can_manage_settings")
        )


class CanApproveQuestions(BasePermission):
    message = "اعتماد الأسئلة متاح للمالك أو للمسؤول المصرح له فقط."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return user.role == "OWNER" or (
            user.role == "ADMIN"
            and user_can(user, "admins_can_approve_questions")
        )


class CanViewAuditLog(BasePermission):
    message = "عرض سجل التدقيق غير مسموح لدورك حسب إعدادات المؤسسة."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return user.role in ("OWNER", "ADMIN") or (
            user.role == "TEACHER"
            and user_can(user, "enable_audit_log_for_teachers")
        )


class CanViewBilling(BasePermission):
    message = "عرض بيانات الفوترة متاح للمالك أو للمسؤول المصرح له فقط."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return user.role == "OWNER" or (
            user.role == "ADMIN" and user_can(user, "admins_can_view_billing")
        )
