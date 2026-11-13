"""
Phase 1 — Billing foundation.

Three models that unlock pricing, feature flags, and per-tenant limits:

- `Plan`: a global catalog of what you SELL (Free, Starter, Pro, Enterprise).
  Not tenant-scoped — one plan serves many tenants.

- `Subscription`: a per-tenant relationship to a plan (1:1 with Tenant).
  Stores the current billing state (trialing/active/canceled), period
  boundaries, and per-tenant overrides for edge cases (early access,
  debugging, custom deals).

- `SubscriptionEvent`: append-only audit trail for billing lifecycle events.
  Separate from `AuditLog` because billing history is queried directly
  ("how many upgrades this quarter?") and mixing it with general audit
  creates noise.

Design notes:
- `Plan.features` is a dict — the source of truth for "what can this plan do?".
  A feature is `True` if present AND true. Missing key = `False`.
- `Plan.max_*` fields: `null` = unlimited, positive int = hard cap.
- `Subscription.feature_overrides` / `limit_overrides`: applied ON TOP of the
  plan (e.g. give a specific tenant `advanced_analytics=True` on Free plan
  for early access). Not exposed via API — controlled by platform admin only.
- No `Subscription` = tenant is on the default plan (`free`). This makes
  the rollout backward compatible: existing tenants keep working without
  any migration.
"""

import uuid

from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedModel


class Plan(TimeStampedModel):
    """A sellable plan. Global — not tenant-scoped."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    key = models.SlugField(
        max_length=50,
        unique=True,
        help_text="Stable identifier used in code: 'free', 'starter', 'pro', 'enterprise'.",
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default="")

    # --- Pricing ---
    price_monthly = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    price_yearly = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default="EGP")

    # --- Visibility ---
    is_active = models.BooleanField(
        default=True,
        help_text="Inactive plans cannot be assigned to new tenants.",
    )
    is_public = models.BooleanField(
        default=True,
        help_text="Public plans appear on the landing page / pricing page.",
    )
    display_order = models.PositiveSmallIntegerField(
        default=0,
        help_text="Lower = shown first. Used for sorting on pricing pages.",
    )

    # --- Limits (None = unlimited) ---
    max_students = models.PositiveIntegerField(null=True, blank=True)
    max_teachers = models.PositiveIntegerField(null=True, blank=True)
    max_storage_mb = models.PositiveIntegerField(null=True, blank=True)
    max_assessments_per_month = models.PositiveIntegerField(null=True, blank=True)

    # --- Features ---
    features = models.JSONField(
        default=dict,
        blank=True,
        help_text=(
            "Feature flags as {'feature_key': True/False}. "
            "Missing key = False. Example: "
            "{'bulk_grading': True, 'advanced_analytics': False}."
        ),
    )

    class Meta:
        db_table = "billing_plan"
        ordering = ["display_order", "price_monthly", "name"]

    def __str__(self):
        return f"{self.name} ({self.key})"

    def has_feature(self, feature_key: str) -> bool:
        return bool(self.features.get(feature_key, False))


class Subscription(TimeStampedModel):
    """A tenant's current plan. One per tenant."""

    class Status(models.TextChoices):
        TRIALING = "TRIALING", "Trialing"
        ACTIVE = "ACTIVE", "Active"
        PAST_DUE = "PAST_DUE", "Past due"
        CANCELED = "CANCELED", "Canceled"
        PAUSED = "PAUSED", "Paused"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    tenant = models.OneToOneField(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="subscription",
    )
    plan = models.ForeignKey(
        Plan,
        on_delete=models.PROTECT,  # never silently delete a plan that's in use
        related_name="subscriptions",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.TRIALING,
        db_index=True,
    )

    # --- Billing period ---
    current_period_start = models.DateTimeField(default=timezone.now)
    current_period_end = models.DateTimeField(null=True, blank=True)

    # --- Trial (separate from current_period — trial may precede first paid period) ---
    trial_start = models.DateTimeField(null=True, blank=True)
    trial_end = models.DateTimeField(null=True, blank=True)

    # --- Cancellation ---
    cancel_at_period_end = models.BooleanField(default=False)
    canceled_at = models.DateTimeField(null=True, blank=True)

    # --- Per-tenant overrides (controlled by platform admin only) ---
    feature_overrides = models.JSONField(
        default=dict,
        blank=True,
        help_text="Per-tenant feature overrides. Applied on top of the plan.",
    )
    limit_overrides = models.JSONField(
        default=dict,
        blank=True,
        help_text="Per-tenant limit overrides (int or null). Applied on top of the plan.",
    )

    class Meta:
        db_table = "billing_subscription"
        indexes = [
            models.Index(fields=["status", "current_period_end"]),
        ]

    def __str__(self):
        return f"{self.tenant} → {self.plan.key} ({self.status})"

    def is_active(self) -> bool:
        """True if the subscription currently grants access."""
        if self.status in (self.Status.ACTIVE, self.Status.TRIALING):
            return True
        return False

    def is_in_trial(self, now=None) -> bool:
        if self.status != self.Status.TRIALING:
            return False
        if self.trial_end is None:
            return False
        return (now or timezone.now()) < self.trial_end


class SubscriptionEvent(models.Model):
    """Append-only history of subscription lifecycle events."""

    class EventType(models.TextChoices):
        CREATED = "CREATED", "Created"
        PLAN_CHANGED = "PLAN_CHANGED", "Plan changed"
        CANCELED = "CANCELED", "Canceled"
        REACTIVATED = "REACTIVATED", "Reactivated"
        RENEWED = "RENEWED", "Renewed"
        TRIAL_ENDED = "TRIAL_ENDED", "Trial ended"
        PAST_DUE = "PAST_DUE", "Marked past due"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.CASCADE,
        related_name="events",
    )
    event_type = models.CharField(max_length=30, choices=EventType.choices)
    from_plan = models.ForeignKey(
        Plan,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    to_plan = models.ForeignKey(
        Plan,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    actor = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "billing_subscription_event"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["subscription", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.subscription_id} — {self.event_type}"
