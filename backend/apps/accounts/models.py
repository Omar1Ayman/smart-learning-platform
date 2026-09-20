import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models

from .managers import UserManager


class User(AbstractUser):
    """A user belongs to exactly one Tenant (see PROJECT_MEMORY.md #14 for
    why this is a field, not a separate Membership model, and when that
    decision should be revisited) — except a platform admin, who sits
    outside every tenant and is never returned by any tenant-scoped query."""

    class Role(models.TextChoices):
        OWNER = "OWNER", "Owner/Admin"
        ADMIN = "ADMIN", "Admin"
        TEACHER = "TEACHER", "Teacher"
        STUDENT = "STUDENT", "Student"

    username = None
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    tenant = models.ForeignKey(
        "tenants.Tenant", on_delete=models.CASCADE, related_name="users", null=True, blank=True
    )
    role = models.CharField(max_length=20, choices=Role.choices, null=True, blank=True)
    is_platform_admin = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        db_table = "accounts_user"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(is_platform_admin=True) | models.Q(tenant__isnull=False),
                name="user_must_have_tenant_unless_platform_admin",
            ),
        ]

    def __str__(self):
        return self.email
