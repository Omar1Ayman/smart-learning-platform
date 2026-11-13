from datetime import datetime

from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.common.mixins import TenantContextMixin
from apps.common.permissions import IsTenantMember
from apps.tenants.permissions import CanViewAuditLog

from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogViewSet(TenantContextMixin, ReadOnlyModelViewSet):
    """Read-only tenant audit log, with optional teacher access by policy.

    Filters:
    - action: exact match OR prefix match if ending with '.' (e.g. "user.")
    - actor: user id
    - object_type: model name (e.g. "Content")
    - from / to: ISO date (YYYY-MM-DD) — inclusive bounds on created_at date
    """

    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, IsTenantMember, CanViewAuditLog]

    def get_queryset(self):
        qs = AuditLog.objects.filter(tenant=self.request.tenant).select_related("actor")

        action = self.request.query_params.get("action")
        if action:
            if action.endswith("."):
                qs = qs.filter(action__startswith=action)
            else:
                qs = qs.filter(action=action)

        actor_id = self.request.query_params.get("actor")
        if actor_id:
            qs = qs.filter(actor_id=actor_id)

        object_type = self.request.query_params.get("object_type")
        if object_type:
            qs = qs.filter(object_type=object_type)

        from_date = self.request.query_params.get("from")
        if from_date:
            try:
                d = datetime.strptime(from_date, "%Y-%m-%d").date()
                qs = qs.filter(created_at__date__gte=d)
            except ValueError:
                pass

        to_date = self.request.query_params.get("to")
        if to_date:
            try:
                d = datetime.strptime(to_date, "%Y-%m-%d").date()
                qs = qs.filter(created_at__date__lte=d)
            except ValueError:
                pass

        return qs.order_by("-created_at")