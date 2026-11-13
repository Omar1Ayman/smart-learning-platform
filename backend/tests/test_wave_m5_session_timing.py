"""Wave M5 (Milestone 5, Batch 20) — session timing awareness.

The `today` endpoint must gate `can_start` on time-of-day, and
`from-schedule` must reject early/late starts unless `force=true`.
"""

from datetime import timedelta as td

import pytest
from django.utils import timezone

from apps.attendance.models import GroupSchedule

from .conftest import login_as
from .factories import (
    GroupFactory,
    TeacherUserFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def _today_weekday():
    return (timezone.localdate().weekday() + 1) % 7


def _make_schedule(group, *, start_offset_minutes=0, teacher=None):
    """Schedule whose start_time is `offset` minutes from now.

    If no teacher is given, creates one and assigns it to the schedule.
    The `from_schedule` view requires a teacher of record — without one
    the request returns 400 regardless of time-of-day gating.
    """
    if teacher is None:
        teacher = TeacherUserFactory(tenant=group.tenant)
    if group.academic_year.status == "DRAFT":
        group.academic_year.activate()

    now_local = timezone.localtime()
    target = now_local + td(minutes=start_offset_minutes)
    start = target.time().replace(second=0, microsecond=0)
    end = (target + td(hours=1)).time().replace(second=0, microsecond=0)

    return GroupSchedule.objects.create(
        tenant=group.tenant,
        group=group,
        weekday=_today_weekday(),
        start_time=start,
        end_time=end,
        teacher=teacher,
        is_active=True,
    )


def test_today_state_ready_within_window(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    _make_schedule(group, start_offset_minutes=5)  # 5 min from now

    client = login_as(api_client, owner)
    r = client.get("/api/v1/attendance/sessions/today/")
    assert r.data[0]["state"] == "ready"
    assert r.data[0]["ready_to_start"] is True


def test_today_state_upcoming_more_than_30_min(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    _make_schedule(group, start_offset_minutes=120)  # 2 hours from now

    client = login_as(api_client, owner)
    r = client.get("/api/v1/attendance/sessions/today/")
    assert r.data[0]["state"] == "upcoming"
    assert r.data[0]["ready_to_start"] is False
    assert r.data[0]["starts_in_minutes"] >= 115


def test_today_state_late_more_than_10_min(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    _make_schedule(group, start_offset_minutes=-30)  # 30 min ago

    client = login_as(api_client, owner)
    r = client.get("/api/v1/attendance/sessions/today/")
    assert r.data[0]["state"] == "late"
    assert r.data[0]["ready_to_start"] is False


def test_from_schedule_rejects_early_start_without_force(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    sched = _make_schedule(group, start_offset_minutes=120)

    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/attendance/sessions/from-schedule/",
        {"schedule": str(sched.id)},
        format="json",
    )
    assert r.status_code == 400
    assert "لم يحن موعدها" in r.data["error"]["detail"]


def test_from_schedule_accepts_early_start_with_force(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    sched = _make_schedule(group, start_offset_minutes=120)

    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/attendance/sessions/from-schedule/",
        {"schedule": str(sched.id), "force": True},
        format="json",
    )
    assert r.status_code == 201
    assert r.data["created"] is True


def test_from_schedule_rejects_late_start_without_force(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    sched = _make_schedule(group, start_offset_minutes=-30)

    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/attendance/sessions/from-schedule/",
        {"schedule": str(sched.id)},
        format="json",
    )
    assert r.status_code == 400
    assert "فات موعدها" in r.data["error"]["detail"]


def test_from_schedule_accepts_late_start_with_force(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    sched = _make_schedule(group, start_offset_minutes=-30)

    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/attendance/sessions/from-schedule/",
        {"schedule": str(sched.id), "force": True},
        format="json",
    )
    assert r.status_code == 201


def test_from_schedule_starts_directly_when_ready(api_client):
    """When within the ready window, no force is needed."""
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    sched = _make_schedule(group, start_offset_minutes=5)

    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/attendance/sessions/from-schedule/",
        {"schedule": str(sched.id)},
        format="json",
    )
    assert r.status_code == 201


def test_today_state_missed_more_than_2h_late(api_client):
    """Batch 20.1: >2h late = "missed", not "late"."""
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    _make_schedule(group, start_offset_minutes=-180)  # 3 hours ago

    client = login_as(api_client, owner)
    r = client.get("/api/v1/attendance/sessions/today/")
    assert r.data[0]["state"] == "missed"
    assert r.data[0]["ready_to_start"] is False


def test_from_schedule_rejects_missed_even_with_force(api_client):
    """Batch 20.1: a missed session cannot be force-started."""
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    sched = _make_schedule(group, start_offset_minutes=-180)

    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/attendance/sessions/from-schedule/",
        {"schedule": str(sched.id), "force": True},
        format="json",
    )
    assert r.status_code == 400
    assert "فات" in r.data["error"]["detail"]
