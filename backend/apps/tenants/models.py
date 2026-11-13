import copy
import uuid

from django.db import models
from django.utils.text import slugify

def default_tenant_settings() -> dict:
    """Default policy for a newly created tenant."""
    return {
        "exam_policy": {
            "allow_retakes": True,
            "max_attempts_default": 2,
            "force_fullscreen": False,
            "auto_submit_after_tab_switches": 0,
            "show_correct_answers_after_submit": True,
            "teachers_can_self_publish": False,
            "shuffle_questions_default": False,
            "shuffle_options_default": False,
        },
        "question_policy": {
            "require_review": True,
            "owners_can_self_approve": True,
        },
        "content_policy": {
            "teachers_can_edit_others_content": False,
            "max_file_size_mb": 50,
        },
        "notification_policy": {
            "email_on_exam_publish": True,
            "email_on_result": True,
        },
        # 🆕 Wave 35 — Permission system
        "permissions": {
            # Teacher permissions
            "teachers_can_create_assessments": True,
            "teachers_can_delete_own_assessments": True,
            "teachers_can_view_all_student_results": False,
            "teachers_can_create_questions": True,
            "teachers_can_mark_attendance": True,
            "teachers_can_import_students": False,
            "teachers_can_export_data": False,
            "teachers_can_manage_own_content": True,
            "teachers_can_publish_content_directly": False,
            "teachers_can_delete_others_content": False,

            # Admin permissions
            "admins_can_manage_teachers": True,
            "admins_can_delete_assessments": True,
            "admins_can_approve_questions": True,
            "admins_can_export_data": False,
            "admins_can_view_billing": False,
            "admins_can_manage_settings": False,

            # Advanced
            "enable_audit_log_for_teachers": False,
            "enable_bulk_import": True,
        },
    }
class Tenant(models.Model):
    """The isolation boundary of the whole system.

    Lifecycle (spec §89-91 evolved for B2B onboarding):
      LEAD      → a demo request came in, not yet reviewed
      PENDING   → under review, awaiting approval / call
      TRIAL     → approved, 14-day trial (or custom)
      ACTIVE    → paying customer, full access
      SUSPENDED → temporarily blocked (billing, TOS)
      CHURNED   → cancelled subscription, data retained for export
    """

    class Status(models.TextChoices):
        LEAD = "LEAD", "Lead"
        PENDING = "PENDING", "Pending review"
        TRIAL = "TRIAL", "Trial"
        ACTIVE = "ACTIVE", "Active"
        SUSPENDED = "SUSPENDED", "Suspended"
        CHURNED = "CHURNED", "Churned"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=120, unique=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.TRIAL)

    # Branding (spec §91)
    primary_color = models.CharField(max_length=7, default="#2B3A67")
    logo_url = models.URLField(blank=True, default="")
    contact_email = models.EmailField(blank=True, default="")

    # B2B lifecycle tracking
    trial_ends_at = models.DateTimeField(null=True, blank=True)
    created_by_platform_admin = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_tenants",
    )
    internal_notes = models.TextField(blank=True, default="")

    # Wave 28 — per-tenant policy (exam, question, content, notification)
    settings = models.JSONField(default=default_tenant_settings, blank=True)

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

    def is_operational(self):
        return self.status not in (self.Status.SUSPENDED, self.Status.CHURNED)

    def get_settings(self) -> dict:
        """Return the tenant's settings merged with defaults.

        Merge is *one level deep per section* — if a future code change
        adds a new key to `default_tenant_settings()["exam_policy"]`,
        existing tenants get that new key's default automatically. This
        is what makes adding new settings backward compatible.
        """
        defaults = default_tenant_settings()
        stored = self.settings or {}

        merged = copy.deepcopy(defaults)
        for section, values in stored.items():
            if section in merged and isinstance(values, dict):
                merged[section].update(values)
            else:
                merged[section] = values
        return merged

    def get_policy(self, section: str) -> dict:
        return self.get_settings().get(section, {})


class DemoRequest(models.Model):
    """Inbound sales lead from the public /request-demo form."""

    class Status(models.TextChoices):
        NEW = "NEW", "New"
        CONTACTED = "CONTACTED", "Contacted"
        CONVERTED = "CONVERTED", "Converted"
        DECLINED = "DECLINED", "Declined"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school_name = models.CharField(max_length=255)
    contact_name = models.CharField(max_length=255)
    email = models.EmailField()
    phone = models.CharField(max_length=30)
    num_students = models.PositiveIntegerField(null=True, blank=True)
    message = models.TextField(blank=True, default="")

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW, db_index=True)
    reviewed_by = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_demo_requests",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")

    converted_tenant = models.ForeignKey(
        Tenant,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="source_demo_request",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tenants_demo_request"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "-created_at"])]

    def __str__(self):
        return f"{self.school_name} — {self.contact_name}"