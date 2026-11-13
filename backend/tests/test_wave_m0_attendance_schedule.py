"""Wave M0 (Milestone 0, Batch 3) — attendance schedules + notifications.

Covers F-01 (today/from-schedule endpoints), F-02 (absence notification
auto-dispatch + manual trigger), F-06 (GroupSchedule CRUD).
"""

import pytest
from django.utils import timezone

from apps.attendance.models import AttendanceRecord, AttendanceSession, GroupSchedule
from apps.notifications.models import Notification
from apps.people.models import TeacherAssignment

from .conftest import login_as
from .factories import (
    AcademicYearFactory,
    CourseFactory,
    EnrollmentFactory,
    GroupFactory,
    StudentUserFactory,
    TeacherUserFactory,
    TenantFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _today_weekday():
    """Mirror the view's mapping: model Weekday 0=Sun..6=Sat."""
    return (timezone.localdate().weekday() + 1) % 7


def _make_schedule(
    group,
    *,
    teacher=None,
    weekday=None,
    start="09:00",
    end="10:00",
    start_offset_minutes: int | None = None,
):
    """Create a GroupSchedule.

    If `start_offset_minutes` is provided, `start` / `end` are computed
    relative to NOW — this makes the test time-independent (previously
    the fixed 09:00 made `from_schedule` tests fail whenever they ran
    outside 09:00 ± 30 min).
    """
    from datetime import timedelta as td

    if group.academic_year.status == "DRAFT":
        group.academic_year.activate()

    if start_offset_minutes is not None:
        now_local = timezone.localtime()
        target = now_local + td(minutes=start_offset_minutes)
        start = target.strftime("%H:%M")
        end = (target + td(hours=1)).strftime("%H:%M")

    return GroupSchedule.objects.create(
        tenant=group.tenant,
        group=group,
        weekday=weekday if weekday is not None else _today_weekday(),
        start_time=start,
        end_time=end,
        teacher=teacher,
        is_active=True,
    )


# ---------------------------------------------------------------------------
# F-06 — GroupSchedule CRUD
# ---------------------------------------------------------------------------


def test_owner_can_create_schedule(api_client):
    group = GroupFactory()
    group.academic_year.activate()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=group.tenant)

    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/attendance/schedules/",
        {
            "group": str(group.id),
            "weekday": 1,
            "start_time": "09:00",
            "end_time": "10:00",
            "teacher": str(teacher.id),
        },
        format="json",
    )
    assert r.status_code == 201, r.data
    assert GroupSchedule.objects.filter(group=group, weekday=1).exists()


def test_teacher_cannot_create_schedule(api_client):
    """Schedules are admin configuration, not teacher self-service."""
    group = GroupFactory()
    teacher = TeacherUserFactory(tenant=group.tenant)

    client = login_as(api_client, teacher)
    r = client.post(
        "/api/v1/attendance/schedules/",
        {
            "group": str(group.id),
            "weekday": 1,
            "start_time": "09:00",
            "end_time": "10:00",
        },
        format="json",
    )
    assert r.status_code == 403


def test_end_time_before_start_time_rejected(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/attendance/schedules/",
        {
            "group": str(group.id),
            "weekday": 1,
            "start_time": "10:00",
            "end_time": "09:00",
        },
        format="json",
    )
    assert r.status_code == 400


def test_duplicate_active_schedule_rejected(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    _make_schedule(group, weekday=2, start="09:00", end="10:00")

    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/attendance/schedules/",
        {
            "group": str(group.id),
            "weekday": 2,
            "start_time": "09:00",
            "end_time": "10:00",
        },
        format="json",
    )
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# F-01 — GET /attendance/sessions/today/
# ---------------------------------------------------------------------------


def test_today_returns_schedules_for_current_weekday(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=group.tenant)

    # Schedule for today.
    today_sched = _make_schedule(group, teacher=teacher)
    # Schedule for a different weekday — should NOT appear.
    _make_schedule(group, teacher=teacher, weekday=(_today_weekday() + 1) % 7)

    client = login_as(api_client, owner)
    r = client.get("/api/v1/attendance/sessions/today/")
    assert r.status_code == 200, r.data
    assert len(r.data) == 1
    assert r.data[0]["schedule_id"] == str(today_sched.id)
    assert r.data[0]["group_id"] == str(group.id)
    assert r.data[0]["session_id"] is None
    assert r.data[0]["session_status"] is None
    assert r.data[0]["can_start"] is True


def test_today_includes_existing_session(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=group.tenant)
    _make_schedule(group, teacher=teacher)

    session = AttendanceSession.objects.create(
        tenant=group.tenant,
        group=group,
        teacher=teacher,
        date=timezone.localdate(),
        start_time="09:00",
        end_time="10:00",
        status=AttendanceSession.Status.OPEN,
    )

    client = login_as(api_client, owner)
    r = client.get("/api/v1/attendance/sessions/today/")
    assert r.status_code == 200
    assert r.data[0]["session_id"] == str(session.id)
    assert r.data[0]["session_status"] == "OPEN"
    assert r.data[0]["can_start"] is False


def test_today_scoped_to_teacher_assignments(api_client):
    """TEACHER sees only their own group's schedule."""
    tenant = TenantFactory()
    teacher_a = TeacherUserFactory(tenant=tenant)
    teacher_b = TeacherUserFactory(tenant=tenant)
    group_a = GroupFactory(tenant=tenant)
    group_b = GroupFactory(tenant=tenant)

    # Assign teacher_a to group_a's grade
    course_a = CourseFactory(tenant=tenant, grade=group_a.grade)
    ta = TeacherAssignment.objects.create(tenant=tenant, teacher=teacher_a, course=course_a)
    ta.groups.set([group_a])

    _make_schedule(group_a, teacher=teacher_a)
    _make_schedule(group_b, teacher=teacher_b)

    client = login_as(api_client, teacher_a)
    r = client.get("/api/v1/attendance/sessions/today/")
    assert r.status_code == 200
    assert len(r.data) == 1
    assert r.data[0]["group_id"] == str(group_a.id)


def test_today_empty_for_student(api_client):
    """STUDENT is not a staff role — returns empty list."""
    tenant = TenantFactory()
    student = StudentUserFactory(tenant=tenant)
    group = GroupFactory(tenant=tenant)
    _make_schedule(group)

    client = login_as(api_client, student)
    r = client.get("/api/v1/attendance/sessions/today/")
    assert r.status_code == 200
    assert r.data == []


# ---------------------------------------------------------------------------
# F-01 — POST /attendance/sessions/from-schedule/
# ---------------------------------------------------------------------------


def test_from_schedule_creates_and_opens_session(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=group.tenant)
    schedule = _make_schedule(group, teacher=teacher, start_offset_minutes=0)

    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/attendance/sessions/from-schedule/",
        {"schedule": str(schedule.id)},
        format="json",
    )
    assert r.status_code == 201, r.data
    assert r.data["created"] is True
    assert r.data["status"] == "OPEN"
    assert str(r.data["group"]) == str(group.id)


def test_from_schedule_idempotent_resume(api_client):
    """Calling twice returns the SAME session (no duplicate)."""
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=group.tenant)
    schedule = _make_schedule(group, teacher=teacher, start_offset_minutes=0)

    client = login_as(api_client, owner)
    r1 = client.post(
        "/api/v1/attendance/sessions/from-schedule/",
        {"schedule": str(schedule.id)},
        format="json",
    )
    session_id = r1.data["id"]

    r2 = client.post(
        "/api/v1/attendance/sessions/from-schedule/",
        {"schedule": str(schedule.id)},
        format="json",
    )
    assert r2.status_code == 200
    assert r2.data["created"] is False
    assert r2.data["id"] == session_id


def test_quick_start_cannot_create_session_for_archived_group(api_client):
    group = GroupFactory()
    group.academic_year.activate()
    group.academic_year.close()
    AcademicYearFactory(tenant=group.tenant).activate()
    owner = UserFactory(tenant=group.tenant, role="OWNER")

    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/attendance/sessions/quick-start/",
        {"group": str(group.id)},
        format="json",
    )

    assert resp.status_code == 403
    assert AttendanceSession.objects.filter(group=group).count() == 0


def test_from_schedule_teacher_out_of_scope_denied(api_client):
    """A TEACHER cannot start a session for a group they don't manage."""
    tenant = TenantFactory()
    teacher = TeacherUserFactory(tenant=tenant)
    group = GroupFactory(tenant=tenant)  # not assigned to teacher
    schedule = _make_schedule(group, teacher=teacher, start_offset_minutes=0)

    client = login_as(api_client, teacher)
    r = client.post(
        "/api/v1/attendance/sessions/from-schedule/",
        {"schedule": str(schedule.id)},
        format="json",
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# F-02 — Absence notifications
# ---------------------------------------------------------------------------


def _setup_session_with_absent_student():
    """Group with 1 enrolled student who is marked ABSENT with parent_email."""
    group = GroupFactory()
    group.academic_year.activate()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=group.tenant)
    student = StudentUserFactory(tenant=group.tenant)
    student.parent_email = "parent@example.test"
    student.parent_name = "أبو الطالب"
    student.save(update_fields=["parent_email", "parent_name"])
    EnrollmentFactory(
        tenant=group.tenant, student=student, group=group, academic_year=group.academic_year
    )
    session = AttendanceSession.objects.create(
        tenant=group.tenant,
        group=group,
        teacher=teacher,
        date=timezone.localdate(),
        start_time="09:00",
        end_time="10:00",
        status=AttendanceSession.Status.OPEN,
    )
    # Pre-populate an ABSENT record for the student.
    AttendanceRecord.objects.create(
        tenant=group.tenant,
        session=session,
        student=student,
        status=AttendanceRecord.Status.ABSENT,
    )
    return {
        "group": group,
        "owner": owner,
        "teacher": teacher,
        "session": session,
        "student": student,
    }


def test_notify_parents_endpoint_dispatches(
    api_client, django_capture_on_commit_callbacks, mailoutbox
):
    ctx = _setup_session_with_absent_student()

    client = login_as(api_client, ctx["owner"])
    with django_capture_on_commit_callbacks(execute=True):
        r = client.post(
            f"/api/v1/attendance/sessions/{ctx['session'].id}/notify-parents/",
            {},
            format="json",
        )
    assert r.status_code == 200, r.data
    assert r.data["sent"] >= 1
    assert len(mailoutbox) >= 1
    assert "parent@example.test" in mailoutbox[0].to


def test_notify_parents_idempotent(api_client, django_capture_on_commit_callbacks, mailoutbox):
    """Second call without force → no duplicate send."""
    ctx = _setup_session_with_absent_student()

    client = login_as(api_client, ctx["owner"])
    with django_capture_on_commit_callbacks(execute=True):
        r1 = client.post(
            f"/api/v1/attendance/sessions/{ctx['session'].id}/notify-parents/",
            {},
            format="json",
        )
    assert r1.data["sent"] == 1

    mailoutbox.clear()

    with django_capture_on_commit_callbacks(execute=True):
        r2 = client.post(
            f"/api/v1/attendance/sessions/{ctx['session'].id}/notify-parents/",
            {},
            format="json",
        )
    # skipped because notified_at is set.
    assert r2.data["sent"] == 0
    assert r2.data["skipped"] >= 1
    assert len(mailoutbox) == 0


def test_notify_parents_force_resends(api_client, django_capture_on_commit_callbacks, mailoutbox):
    ctx = _setup_session_with_absent_student()

    client = login_as(api_client, ctx["owner"])
    with django_capture_on_commit_callbacks(execute=True):
        client.post(
            f"/api/v1/attendance/sessions/{ctx['session'].id}/notify-parents/",
            {},
            format="json",
        )
    mailoutbox.clear()

    with django_capture_on_commit_callbacks(execute=True):
        r = client.post(
            f"/api/v1/attendance/sessions/{ctx['session'].id}/notify-parents/",
            {"force": True},
            format="json",
        )
    assert r.data["sent"] == 1
    assert len(mailoutbox) == 1


def test_close_session_auto_dispatches_notifications(
    api_client, django_capture_on_commit_callbacks, mailoutbox
):
    """F-02 core: closing a session must send absence emails automatically."""
    ctx = _setup_session_with_absent_student()

    client = login_as(api_client, ctx["owner"])
    with django_capture_on_commit_callbacks(execute=True):
        r = client.post(
            f"/api/v1/attendance/sessions/{ctx['session'].id}/close/",
            {},
            format="json",
        )
    assert r.status_code == 200, r.data
    assert r.data["status"] == "CLOSED"
    assert len(mailoutbox) == 1
    assert "parent@example.test" in mailoutbox[0].to


def test_close_session_policy_disabled_no_notification(
    api_client, django_capture_on_commit_callbacks, mailoutbox
):
    """If the tenant policy `notify_parent_on_absence` is False, close
    must not send anything."""
    ctx = _setup_session_with_absent_student()
    tenant = ctx["group"].tenant
    settings = tenant.get_settings()
    settings.setdefault("attendance_policy", {})["notify_parent_on_absence"] = False
    tenant.settings = settings
    tenant.save(update_fields=["settings"])

    client = login_as(api_client, ctx["owner"])
    with django_capture_on_commit_callbacks(execute=True):
        client.post(
            f"/api/v1/attendance/sessions/{ctx['session'].id}/close/",
            {},
            format="json",
        )
    assert len(mailoutbox) == 0


def test_notify_parents_scheduled_session_rejected(api_client):
    """Can't notify parents on a session that hasn't opened."""
    ctx = _setup_session_with_absent_student()
    ctx["session"].status = AttendanceSession.Status.SCHEDULED
    ctx["session"].save(update_fields=["status"])

    client = login_as(api_client, ctx["owner"])
    r = client.post(
        f"/api/v1/attendance/sessions/{ctx['session'].id}/notify-parents/",
        {},
        format="json",
    )
    assert r.status_code == 400


def test_notify_parents_creates_in_app_notification(api_client, django_capture_on_commit_callbacks):
    """Parent linkage via ParentChild also gets an in-app notification."""
    from apps.accounts.models import ParentChild

    ctx = _setup_session_with_absent_student()
    parent_user = UserFactory(tenant=ctx["group"].tenant, role="PARENT")
    ParentChild.objects.create(
        tenant=ctx["group"].tenant,
        parent=parent_user,
        student=ctx["student"],
        is_primary=True,
    )

    client = login_as(api_client, ctx["owner"])
    with django_capture_on_commit_callbacks(execute=True):
        client.post(
            f"/api/v1/attendance/sessions/{ctx['session'].id}/notify-parents/",
            {},
            format="json",
        )

    assert Notification.objects.filter(user=parent_user, type="ABSENCE_ALERT").exists()
