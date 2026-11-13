"""
User-facing notifications.

Deliberately NOT tenant-scoped (doesn't inherit TenantScopedModel):
notifications are per-user, and a platform admin has no tenant. `tenant`
is a plain nullable FK kept for reporting — deleting a tenant nulls it
without wiping the notification history.

Writes happen from server-side triggers (publish, submit, grade, …),
never from a client endpoint. The API is read-only + mark-read.
"""

import uuid

from django.db import models


class Notification(models.Model):
    class Type(models.TextChoices):
        EXAM_PUBLISHED = "EXAM_PUBLISHED", "امتحان جديد"
        EXAM_SUBMITTED = "EXAM_SUBMITTED", "محاولة جديدة"
        EXAM_GRADED = "EXAM_GRADED", "نتيجة جديدة"
        QUESTION_APPROVED = "QUESTION_APPROVED", "سؤال معتمد"
        QUESTION_REJECTED = "QUESTION_REJECTED", "سؤال مرفوض"
        QUESTION_PENDING = "QUESTION_PENDING", "سؤال بانتظار المراجعة"
        ENROLLMENT_CREATED = "ENROLLMENT_CREATED", "تسجيل جديد"
        SYSTEM = "SYSTEM", "نظام"
        EXAM_REOPENED = "EXAM_REOPENED", "إعادة فتح محاولة"
        ABSENCE_ALERT = "ABSENCE_ALERT", "غياب"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        "accounts.User", on_delete=models.CASCADE, related_name="notifications"
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="notifications",
    )
    type = models.CharField(max_length=40, choices=Type.choices)
    title = models.CharField(max_length=255)
    message = models.TextField(blank=True, default="")
    link = models.CharField(max_length=500, blank=True, default="")
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications_notification"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "is_read", "-created_at"]),
            models.Index(fields=["user", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.user_id} — {self.title}"
