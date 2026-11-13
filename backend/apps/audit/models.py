import uuid

from django.db import models


class AuditLog(models.Model):
    """Append-only record of security/business-relevant actions (spec #50).
    Nullable FKs with SET_NULL so a deleted tenant/user doesn't wipe the
    historical trail of what they did."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        "tenants.Tenant",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_logs",
    )
    actor = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_logs"
    )
    action = models.CharField(max_length=100)  # e.g. "tenant.created", "academic_year.created"
    object_type = models.CharField(max_length=100, blank=True, default="")
    object_id = models.CharField(max_length=64, blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "audit_log"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["tenant", "action", "-created_at"])]

    def __str__(self):
        return f"{self.action} @ {self.created_at:%Y-%m-%d %H:%M}"
