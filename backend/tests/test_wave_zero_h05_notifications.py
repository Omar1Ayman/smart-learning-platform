"""Wave Zero — H-5: notify_many chunks bulk_create to stay under
PostgreSQL's parameter limits.

Before fix: one bulk_create call with 5000+ users generated a single
INSERT with tens of thousands of params, approaching PG's
max_query_parameters (65535) and risking "packet too large" errors.
After fix: chunked at 500 rows per INSERT.
"""
import pytest
from apps.notifications.models import Notification
from apps.notifications.services import notify_many
from .factories import TenantFactory, UserFactory

pytestmark = pytest.mark.django_db


def test_notify_many_handles_large_batch():
    """1200 users spans 3 chunks of 500 — the old single-INSERT design
    would have been at risk on a real PostgreSQL (not in this test,
    which uses whatever DB Django is configured for, but the chunking
    is what makes it safe)."""
    tenant = TenantFactory()
    users = [UserFactory(tenant=tenant) for _ in range(1200)]

    notify_many(users, "SYSTEM", "Bulk notification")

    assert Notification.objects.filter(title="Bulk notification").count() == 1200
    # Each user gets exactly one row — the chunking must not duplicate
    # or drop any.
    assert (
        Notification.objects.filter(title="Bulk notification")
        .values("user_id")
        .distinct()
        .count()
        == 1200
    )


def test_notify_many_handles_empty_list():
    """No crash on an empty iterable."""
    notify_many([], "SYSTEM", "No one")
    assert Notification.objects.filter(title="No one").count() == 0