"""
TenantContextMixin resolves `request.tenant` immediately after
authentication and before any permission check runs — see
ARCHITECTURE.md #2, step 2.

DRF's APIView.initial() calls, in order: perform_authentication(request),
then check_permissions(request), then check_throttles(request).
Overriding perform_authentication (not initial) is what guarantees
request.tenant exists by the time check_permissions runs.
"""


class TenantContextMixin:
    def perform_authentication(self, request):
        super().perform_authentication(request)
        user = request.user
        request.tenant = getattr(user, "tenant", None) if user and user.is_authenticated else None
