"""
Abstract base models every domain app builds on.

TenantScopedModel is the single most important class in this codebase:
every tenant-owned table inherits it, which is what makes "forgetting to
scope a query by tenant" require actively opting out rather than
remembering to opt in. See ARCHITECTURE.md #2 for the full request
lifecycle this participates in.
"""
import uuid

from django.db import models


class UUIDModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class TenantScopedQuerySet(models.QuerySet):
    def for_tenant(self, tenant):
        """The one and only sanctioned way to fetch tenant-owned rows.
        `tenant` may be a Tenant instance or a tenant id."""
        tenant_id = getattr(tenant, "id", tenant)
        return self.filter(tenant_id=tenant_id)


class TenantScopedManager(models.Manager.from_queryset(TenantScopedQuerySet)):
    pass


class TenantScopedModel(UUIDModel, TimeStampedModel):
    """
    Abstract base for every entity that belongs to exactly one tenant.

    Deliberately does NOT expose a manager that returns all tenants' rows
    by default in application code paths — `objects` still returns
    everything (Django admin, migrations, and shell debugging need that),
    but every ViewSet built on TenantScopedViewSet (apps/common/views.py)
    always calls `.for_tenant(request.tenant)` explicitly, never relies on
    an implicit default.
    """

    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="%(class)ss",
    )

    objects = TenantScopedManager()

    class Meta:
        abstract = True
