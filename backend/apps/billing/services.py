"""
Phase 1.1 — Billing services.

The ONLY place where code asks "can this tenant do X?" or
"how many Y can this tenant have?". Every other module imports from
here, never reads `Plan`/`Subscription` directly.

Backward compatible: no subscription → default plan (key="free").
"""

from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING

from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from .exceptions import LimitReached
from .models import Plan, Subscription, SubscriptionEvent


from .constants import all_feature_keys, all_limit_keys
from .models import Plan, Subscription, SubscriptionEvent

if TYPE_CHECKING:
    from apps.tenants.models import Tenant


DEFAULT_PLAN_KEY = "free"


# ============================================================================
# Plan / Subscription resolution
# ============================================================================


def get_active_subscription(tenant: "Tenant") -> Subscription | None:
    """Return the tenant's subscription, or None if not subscribed yet."""
    try:
        return tenant.subscription
    except Subscription.DoesNotExist:
        return None


def get_plan_for_tenant(tenant: "Tenant") -> Plan | None:
    """Return the plan the tenant is currently on.

    Order of precedence:
      1. The subscription's plan (if any).
      2. The default plan (key=DEFAULT_PLAN_KEY).
    """
    sub = get_active_subscription(tenant)
    if sub:
        return sub.plan
    return Plan.objects.filter(key=DEFAULT_PLAN_KEY, is_active=True).first()


# ============================================================================
# Feature checks
# ============================================================================


def has_feature(tenant: "Tenant", feature_key: str) -> bool:
    """Return True if the tenant has this feature."""
    sub = get_active_subscription(tenant)
    if sub and feature_key in sub.feature_overrides:
        return bool(sub.feature_overrides[feature_key])

    plan = get_plan_for_tenant(tenant)
    if plan is None:
        return False
    return plan.has_feature(feature_key)


def require_feature(tenant: "Tenant", feature_key: str) -> None:
    """Raise 403 PermissionDenied if tenant lacks feature.

    Uses a plain string detail so `custom_exception_handler` produces
    the standard `{"error": {"status": 403, "detail": "<message>"}}`
    envelope (not a nested dict).
    """
    if not has_feature(tenant, feature_key):
        raise PermissionDenied(
            "هذه الميزة غير متاحة في باقتك الحالية. "
            "قم بالترقية للوصول إليها."
        )

def get_features_dict(tenant: "Tenant") -> dict[str, bool]:
    """Return {feature_key: bool} for ALL canonical features."""
    return {key: has_feature(tenant, key) for key in all_feature_keys()}


# ============================================================================
# Limit checks
# ============================================================================


def get_limit(tenant: "Tenant", limit_key: str) -> int | None:
    """Return the numeric limit. None = unlimited."""
    sub = get_active_subscription(tenant)
    if sub and limit_key in sub.limit_overrides:
        val = sub.limit_overrides[limit_key]
        return int(val) if val is not None else None

    plan = get_plan_for_tenant(tenant)
    if plan is None:
        return 0
    val = getattr(plan, limit_key, None)
    return int(val) if val is not None else None


def is_within_limit(
    tenant: "Tenant", limit_key: str, current_value: int
) -> tuple[bool, str | None]:
    """Return (allowed, error_message)."""
    limit = get_limit(tenant, limit_key)
    if limit is None:
        return True, None
    if current_value >= limit:
        return False, (
            f"وصلت للحد الأقصى المسموح في باقتك الحالية ({limit}). "
            "قم بالترقية لإضافة المزيد."
        )
    return True, None


def require_within_limit(
    tenant: "Tenant", limit_key: str, current_value: int
) -> None:
    """Raise 402 LimitReached if adding one more would exceed the limit.

    Distinct from ValidationError (400) so the frontend can show an
    "Upgrade" dialog instead of a form error.
    """
    allowed, message = is_within_limit(tenant, limit_key, current_value)
    if not allowed:
        raise LimitReached(message or LimitReached.default_detail)
# ============================================================================
# Usage tracking
# ============================================================================


def get_usage(tenant: "Tenant") -> dict[str, dict]:
    """Return current usage for each limited resource.

    Shape: {limit_key: {"current": int, "max": int|None, "unit": str}}
    `max=None` means unlimited.
    """
    from apps.accounts.models import User
    from apps.assessments.models import Assessment
    from apps.content.models import Content
    from .constants import LIMITS

    # Students / teachers
    student_count = (
        User.objects.for_tenant(tenant).filter(role=User.Role.STUDENT).count()
    )
    teacher_count = (
        User.objects.for_tenant(tenant).filter(role=User.Role.TEACHER).count()
    )

    # Assessments this calendar month
    now = timezone.now()
    month_start = now.replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )
    assessments_this_month = (
        Assessment.objects.for_tenant(tenant)
        .filter(created_at__gte=month_start)
        .count()
    )

    # Storage — sum of actual file sizes (best-effort; missing files skipped)
    total_bytes = 0
    for c in (
        Content.objects.for_tenant(tenant)
        .filter(file__isnull=False)
        .exclude(file="")
        .only("file")
    ):
        try:
            total_bytes += c.file.size
        except (FileNotFoundError, OSError):
            pass
    storage_mb = total_bytes // (1024 * 1024)

    return {
        "max_students": {
            "current": student_count,
            "max": get_limit(tenant, "max_students"),
            "unit": LIMITS["max_students"]["unit"],
        },
        "max_teachers": {
            "current": teacher_count,
            "max": get_limit(tenant, "max_teachers"),
            "unit": LIMITS["max_teachers"]["unit"],
        },
        "max_storage_mb": {
            "current": storage_mb,
            "max": get_limit(tenant, "max_storage_mb"),
            "unit": LIMITS["max_storage_mb"]["unit"],
        },
        "max_assessments_per_month": {
            "current": assessments_this_month,
            "max": get_limit(tenant, "max_assessments_per_month"),
            "unit": LIMITS["max_assessments_per_month"]["unit"],
        },
    }


# ============================================================================
# Plan summary (used by the /billing/me/ endpoint)
# ============================================================================


def get_plan_summary(tenant: "Tenant") -> dict:
    """Complete billing picture for the current tenant.

    Works with or without a Subscription row:
      - With subscription: reflects actual status + trial.
      - Without: synthesises an "implicit free" view so the frontend
        always has a consistent payload.
    """
    sub = get_active_subscription(tenant)
    plan = get_plan_for_tenant(tenant)

    now = timezone.now()

    if sub is None:
        status = "IMPLICIT_FREE"
        is_implicit = True
        trial = {"is_in_trial": False, "ends_at": None}
        cancel_at_period_end = False
        current_period_end = None
    else:
        status = sub.status
        is_implicit = False
        trial = {
            "is_in_trial": sub.is_in_trial(now=now),
            "ends_at": sub.trial_end.isoformat() if sub.trial_end else None,
        }
        cancel_at_period_end = sub.cancel_at_period_end
        current_period_end = (
            sub.current_period_end.isoformat()
            if sub.current_period_end
            else None
        )

    return {
        "plan": plan,
        "status": status,
        "is_implicit": is_implicit,
        "trial": trial,
        "cancel_at_period_end": cancel_at_period_end,
        "current_period_end": current_period_end,
        "features": get_features_dict(tenant),
        "limits": {
            key: get_limit(tenant, key) for key in all_limit_keys()
        },
    }


# ============================================================================
# Mutations (platform admin only)
# ============================================================================


def assign_plan(
    tenant: "Tenant",
    plan_key: str,
    *,
    status: str = Subscription.Status.ACTIVE,
    actor=None,
    trial_days: int | None = None,
) -> Subscription:
    """Assign or change a tenant's plan. Records a SubscriptionEvent."""
    plan = Plan.objects.get(key=plan_key, is_active=True)
    sub = get_active_subscription(tenant)
    from_plan = sub.plan if sub else None

    now = timezone.now()

    if sub is None:
        sub = Subscription.objects.create(
            tenant=tenant,
            plan=plan,
            status=status,
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
            trial_start=now if status == Subscription.Status.TRIALING else None,
            trial_end=(
                now + timedelta(days=trial_days or 14)
                if status == Subscription.Status.TRIALING
                else None
            ),
        )
        SubscriptionEvent.objects.create(
            subscription=sub,
            event_type=SubscriptionEvent.EventType.CREATED,
            to_plan=plan,
            actor=actor,
            metadata={"initial_status": status},
        )
    else:
        sub.plan = plan
        sub.status = status
        sub.save(update_fields=["plan", "status", "updated_at"])
        SubscriptionEvent.objects.create(
            subscription=sub,
            event_type=SubscriptionEvent.EventType.PLAN_CHANGED,
            from_plan=from_plan,
            to_plan=plan,
            actor=actor,
        )

    return sub