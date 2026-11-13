import secrets
import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models

from .managers import UserManager


def generate_student_code() -> str:
    """Format: STU-XXXXXXXXXX (10 hex chars = 40 bits entropy)."""
    return f"STU-{secrets.token_hex(5).upper()}"


class User(AbstractUser):
    """A user belongs to exactly one Tenant (see PROJECT_MEMORY.md #14) —
    except a platform admin, who sits outside every tenant."""

    class Role(models.TextChoices):
        OWNER = "OWNER", "Owner/Admin"
        ADMIN = "ADMIN", "Admin"
        TEACHER = "TEACHER", "Teacher"
        STUDENT = "STUDENT", "Student"
        PARENT = "PARENT", "Parent/Guardian"

    username = None
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="users",
        null=True,
        blank=True,
    )
    role = models.CharField(max_length=20, choices=Role.choices, null=True, blank=True)
    is_platform_admin = models.BooleanField(default=False)

    # Per-student barcode identifier — printed on the student ID card.
    student_code = models.CharField(
        max_length=20,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="Printed on student ID cards; used for barcode attendance.",
    )

    # Parent contact info — populated on STUDENT rows (used both for
    # notifications AND as a matching key when a Parent account is created).
    parent_name = models.CharField(max_length=255, blank=True, default="")
    parent_email = models.EmailField(blank=True, default="")
    parent_phone = models.CharField(max_length=30, blank=True, default="")

    # ---- 2FA ----
    two_factor_enabled = models.BooleanField(default=False)
    two_factor_secret = models.CharField(max_length=64, blank=True, default="")
    two_factor_recovery_codes = models.JSONField(
        default=list,
        blank=True,
        help_text="SHA-256 hashes of single-use recovery codes. Never the plaintext.",
    )
    telegram_chat_id = models.CharField(max_length=40, blank=True, default="")

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

    def save(self, *args, **kwargs):
        """Auto-generate student_code for any STUDENT row lacking one."""
        if self.role == self.Role.STUDENT and not self.student_code:
            for _ in range(3):
                candidate = generate_student_code()
                if not User.objects.filter(student_code=candidate).exists():
                    self.student_code = candidate
                    break
            else:
                self.student_code = f"STU-{secrets.token_hex(8).upper()}"
        super().save(*args, **kwargs)

    def __str__(self):
        return self.email


class UserSession(models.Model):
    """A logged-in device session. One row per (user × device × login).

    Rotation behaviour: on refresh, the underlying JWT rotates and its
    `jti` claim changes. We UPDATE the same session row's `jti` rather
    than creating a new row, so a session represents "this device's
    login", not "this token". Refresh cookie → same session_id.

    Revocation semantics:
    - `revoked_at` is set when the user (or their password change, or
      the platform admin) forcibly ends a session.
    - We also blacklist the underlying refresh token so it can't be
      used. Access tokens (30-min TTL) are NOT revoked instantly —
      that is standard SaaS behaviour and documented in SECURITY.md.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sessions")
    jti = models.CharField(max_length=255, unique=True, db_index=True)

    # Device context at login time. Not updated on refresh — that way a
    # user recognises "this is the Chrome on Windows session I created
    # 3 days ago" even if they've refreshed 50 times since.
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True, default="")
    device_label = models.CharField(max_length=200, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_reason = models.CharField(max_length=100, blank=True, default="")

    class Meta:
        db_table = "accounts_user_session"
        ordering = ["-last_seen_at"]
        indexes = [
            models.Index(fields=["user", "-last_seen_at"]),
            models.Index(fields=["user", "revoked_at"]),
        ]

    def __str__(self):
        return f"{self.user.email} — {self.device_label} ({self.ip_address})"

    @property
    def is_active(self):
        return self.revoked_at is None


class ParentChild(models.Model):
    """Links a PARENT user to a STUDENT user within the same tenant.

    A child can have multiple guardians; a guardian can have multiple
    children. The relationship type (father/mother/guardian) matters for
    deciding who gets contacted first.
    """

    class Relationship(models.TextChoices):
        FATHER = "FATHER", "الأب"
        MOTHER = "MOTHER", "الأم"
        GUARDIAN = "GUARDIAN", "ولي أمر / وصي"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        "tenants.Tenant", on_delete=models.CASCADE, related_name="parent_links"
    )
    parent = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="children_links",
        limit_choices_to={"role": "PARENT"},
    )
    student = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="parents_links",
        limit_choices_to={"role": "STUDENT"},
    )
    relationship = models.CharField(
        max_length=20,
        choices=Relationship.choices,
        default=Relationship.GUARDIAN,
    )
    is_primary = models.BooleanField(
        default=False,
        help_text="Primary contact for absence/result notifications.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "accounts_parent_child"
        ordering = ["student", "-is_primary", "relationship"]
        constraints = [
            models.UniqueConstraint(fields=["parent", "student"], name="uniq_parent_child"),
            models.UniqueConstraint(
                fields=["student"],
                condition=models.Q(is_primary=True),
                name="uniq_primary_parent_per_student",
            ),
        ]
        indexes = [
            models.Index(fields=["tenant", "parent"]),
            models.Index(fields=["tenant", "student"]),
        ]

    def save(self, *args, **kwargs):
        if self.student_id and not self.tenant_id:
            self.tenant_id = self.student.tenant_id
        if self.parent_id and self.student_id:
            if self.parent.tenant_id != self.student.tenant_id:
                raise ValueError("Parent and student must belong to the same tenant.")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.parent.email} → {self.student.email} ({self.relationship})"
