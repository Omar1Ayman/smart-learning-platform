"""
TenantScopedViewSet is the base every domain ViewSet (academics, content,
questions, ...) inherits from. It is what makes tenant filtering the
default rather than something each view has to remember — see
ARCHITECTURE.md #2, steps 2-6.
"""

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .mixins import TenantContextMixin
from .permissions import IsSameTenantObject, IsTenantMember


class TenantScopedViewSet(TenantContextMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsTenantMember, IsSameTenantObject]

    def get_queryset(self):
        qs = super().get_queryset()
        return qs.for_tenant(self.request.tenant)

    def perform_create(self, serializer):
        # tenant is never a writable serializer field (mass-assignment
        # protection) — it is always taken from the authenticated
        # request, never from client input. See SECURITY.md #1.
        serializer.save(tenant=self.request.tenant)
