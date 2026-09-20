import uuid

from django.db import models
from django.utils.text import slugify


class Tenant(models.Model):
    """The isolation boundary of the whole system. Every tenant-owned row
    (see apps.common.models.TenantScopedModel) points back to exactly one
    of these. Nothing about a Tenant's own row is itself tenant-scoped —
    there's no "parent tenant" — it is the root."""

    class Status(models.TextChoices):
        TRIAL = "TRIAL", "Trial"
        ACTIVE = "ACTIVE", "Active"
        SUSPENDED = "SUSPENDED", "Suspended"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=120, unique=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.TRIAL)

    # Branding (spec #91) — customizable later via a settings endpoint;
    # deliberately plain fields, never raw HTML/CSS/JS from the tenant.
    primary_color = models.CharField(max_length=7, default="#2B3A67")
    logo_url = models.URLField(blank=True, default="")
    contact_email = models.EmailField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tenants_tenant"
        ordering = ["name"]

    def __str__(self):
        return self.name

    @staticmethod
    def generate_unique_slug(name):
        base = slugify(name)[:100] or "tenant"
        slug = base
        suffix = 1
        while Tenant.objects.filter(slug=slug).exists():
            suffix += 1
            slug = f"{base}-{suffix}"
        return slug
