"""Wave M3 (Milestone 3, Batch 12) — notification bulk ops + filters."""

import pytest

from apps.notifications.models import Notification
from apps.notifications.services import notify

from .conftest import login_as
from .factories import UserFactory

pytestmark = pytest.mark.django_db


def test_bulk_delete_only_own_notifications(api_client):
    user_a = UserFactory()
    user_b = UserFactory()
    n_a1 = notify(user_a, "SYSTEM", "A1")
    n_a2 = notify(user_a, "SYSTEM", "A2")
    n_b = notify(user_b, "SYSTEM", "B")

    client = login_as(api_client, user_a)
    r = client.post(
        "/api/v1/notifications/bulk_delete/",
        {"ids": [str(n_a1.id), str(n_a2.id), str(n_b.id)]},
        format="json",
    )
    assert r.status_code == 200
    assert r.data["deleted"] == 2  # only A's; B's silently ignored

    assert Notification.objects.filter(id=n_a1.id).exists() is False
    assert Notification.objects.filter(id=n_a2.id).exists() is False
    assert Notification.objects.filter(id=n_b.id).exists() is True


def test_bulk_delete_rejects_empty_list(api_client):
    user = UserFactory()
    client = login_as(api_client, user)
    r = client.post(
        "/api/v1/notifications/bulk_delete/", {"ids": []}, format="json"
    )
    assert r.status_code == 400


def test_bulk_delete_rejects_over_100(api_client):
    user = UserFactory()
    client = login_as(api_client, user)
    r = client.post(
        "/api/v1/notifications/bulk_delete/",
        {"ids": [str(i) for i in range(101)]},
        format="json",
    )
    assert r.status_code == 400


def test_mark_unread_flips_flag(api_client):
    user = UserFactory()
    n = notify(user, "SYSTEM", "X")
    n.is_read = True
    n.save(update_fields=["is_read"])

    client = login_as(api_client, user)
    r = client.post(f"/api/v1/notifications/{n.id}/mark_unread/")
    assert r.status_code == 200
    n.refresh_from_db()
    assert n.is_read is False


def test_type_in_filter(api_client):
    user = UserFactory()
    notify(user, "EXAM_PUBLISHED", "Exam A")
    notify(user, "QUESTION_APPROVED", "Q A")
    notify(user, "SYSTEM", "Sys A")

    client = login_as(api_client, user)
    r = client.get("/api/v1/notifications/?type__in=EXAM_PUBLISHED,EXAM_GRADED")
    assert r.status_code == 200
    titles = {row["title"] for row in r.data["results"]}
    assert "Exam A" in titles
    assert "Q A" not in titles
    assert "Sys A" not in titles


def test_type_in_filter_with_multiple_types(api_client):
    user = UserFactory()
    notify(user, "QUESTION_APPROVED", "Q1")
    notify(user, "QUESTION_REJECTED", "Q2")
    notify(user, "SYSTEM", "Sys")

    client = login_as(api_client, user)
    r = client.get(
        "/api/v1/notifications/?type__in=QUESTION_APPROVED,QUESTION_REJECTED"
    )
    titles = {row["title"] for row in r.data["results"]}
    assert titles == {"Q1", "Q2"}


def test_type_in_ignored_when_empty(api_client):
    user = UserFactory()
    notify(user, "SYSTEM", "Sys")

    client = login_as(api_client, user)
    r = client.get("/api/v1/notifications/?type__in=")
    assert r.status_code == 200
    assert r.data["count"] == 1