"""Wave M5 (Milestone 5, Batch 18) — admin reports endpoint."""

import pytest
from django.utils import timezone

from apps.attendance.models import AttendanceRecord, AttendanceSession

from .conftest import login_as
from .factories import (
    AssessmentFactory,
    EnrollmentFactory,
    GroupFactory,
    StudentUserFactory,
    TeacherUserFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def test_student_cannot_access_reports(api_client):
    student = UserFactory(role="STUDENT")
    client = login_as(api_client, student)
    r = client.get("/api/v1/dashboard/reports/")
    assert r.status_code == 403


def test_teacher_cannot_access_reports(api_client):
    teacher = TeacherUserFactory()
    client = login_as(api_client, teacher)
    r = client.get("/api/v1/dashboard/reports/")
    assert r.status_code == 403


def test_admin_can_access_reports(api_client):
    admin = UserFactory(role="ADMIN")
    client = login_as(api_client, admin)
    r = client.get("/api/v1/dashboard/reports/")
    assert r.status_code == 200
    assert "attendance" in r.data
    assert "exams" in r.data
    assert "teachers" in r.data


def test_empty_tenant_returns_null_rates_not_zeros(api_client):
    """F-22 style — when there's no data, return None, not a fake 0%."""
    owner = UserFactory(role="OWNER")
    client = login_as(api_client, owner)
    r = client.get("/api/v1/dashboard/reports/")
    assert r.data["attendance"]["overall_rate"] is None
    assert r.data["exams"]["avg_score_pct"] is None
    assert r.data["attendance"]["by_group"] == []
    assert r.data["exams"]["by_assessment"] == []


def test_attendance_by_group_aggregation(api_client):
    tenant = UserFactory(role="OWNER").tenant
    owner = UserFactory(tenant=tenant, role="OWNER")
    group = GroupFactory(tenant=tenant)
    teacher = TeacherUserFactory(tenant=tenant)
    s1 = StudentUserFactory(tenant=tenant)
    s2 = StudentUserFactory(tenant=tenant)
    EnrollmentFactory(tenant=tenant, student=s1, group=group, academic_year=group.academic_year)
    EnrollmentFactory(tenant=tenant, student=s2, group=group, academic_year=group.academic_year)

    session = AttendanceSession.objects.create(
        tenant=tenant,
        group=group,
        teacher=teacher,
        date=timezone.localdate(),
        start_time="09:00",
        end_time="10:00",
        status=AttendanceSession.Status.CLOSED,
    )
    AttendanceRecord.objects.create(tenant=tenant, session=session, student=s1, status="PRESENT")
    AttendanceRecord.objects.create(tenant=tenant, session=session, student=s2, status="ABSENT")

    client = login_as(api_client, owner)
    r = client.get("/api/v1/dashboard/reports/?days=7")
    by_group = r.data["attendance"]["by_group"]
    assert len(by_group) == 1
    assert by_group[0]["group_id"] == str(group.id)
    assert by_group[0]["total_sessions"] == 1
    assert by_group[0]["avg_present_pct"] == 50.0
    assert r.data["attendance"]["overall_rate"] == 50.0


def test_teacher_activity_classification(api_client):
    tenant = UserFactory(role="OWNER").tenant
    owner = UserFactory(tenant=tenant, role="OWNER")
    active_teacher = TeacherUserFactory(tenant=tenant)

    # 3 actions = active
    AssessmentFactory(tenant=tenant, created_by=active_teacher)
    AssessmentFactory(tenant=tenant, created_by=active_teacher)
    AssessmentFactory(tenant=tenant, created_by=active_teacher)

    inactive_teacher = TeacherUserFactory(tenant=tenant)
    # 0 actions = inactive

    client = login_as(api_client, owner)
    r = client.get("/api/v1/dashboard/reports/?days=7")
    by_teacher = {t["teacher_id"]: t for t in r.data["teachers"]["by_teacher"]}
    assert by_teacher[str(active_teacher.id)]["activity"] == "active"
    assert by_teacher[str(inactive_teacher.id)]["activity"] == "inactive"
    assert r.data["teachers"]["active"] >= 1
    assert r.data["teachers"]["inactive"] >= 1


def test_teacher_activity_low_classification(api_client):
    """1-2 actions = low."""
    tenant = UserFactory(role="OWNER").tenant
    owner = UserFactory(tenant=tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=tenant)
    AssessmentFactory(tenant=tenant, created_by=teacher)  # 1 action

    client = login_as(api_client, owner)
    r = client.get("/api/v1/dashboard/reports/?days=7")
    by_teacher = {t["teacher_id"]: t for t in r.data["teachers"]["by_teacher"]}
    assert by_teacher[str(teacher.id)]["activity"] == "low"
