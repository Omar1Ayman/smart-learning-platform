"""
TenantContextMixin resolves `request.tenant` immediately after
authentication and before any permission check runs.

Also enforces tenant operational status (SUSPENDED/CHURNED) at this
point. DRF's APIView.initial() calls, in order:

  1. perform_authentication(request)   ← we hook here
  2. check_permissions(request)
  3. check_throttles(request)

Why not Django middleware: JWT auth is performed by DRF *inside* the
view, after all Django middleware has already run. A TenantStatusMiddleware
at Django level would see request.user == AnonymousUser for every JWT
request and silently pass everything through. The check must live here.

F-05 NOTE (Milestone 0): a legacy `apps/common/middleware.py` file used
to exist with a similar `TenantStatusMiddleware`. It was never
registered in settings.MIDDLEWARE (would have been useless anyway,
per the reasoning above). File was deleted to avoid confusion.
"""

from rest_framework.exceptions import PermissionDenied


class TenantContextMixin:
    def perform_authentication(self, request):
        super().perform_authentication(request)
        user = request.user
        request.tenant = getattr(user, "tenant", None) if user and user.is_authenticated else None

        if request.tenant is not None and not request.tenant.is_operational():
            if request.tenant.status == "SUSPENDED":
                detail = "تم تعليق حساب المؤسسة. يرجى التواصل مع الدعم."
            else:
                detail = "تم إلغاء اشتراك هذه المؤسسة. يرجى التواصل مع الدعم."
            raise PermissionDenied(detail)
