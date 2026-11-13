"""Wave M5 (Milestone 5, Batch 17) — enriched setup-status payload."""

import pytest

from .conftest import login_as
from .factories import UserFactory

pytestmark = pytest.mark.django_db


def test_new_tenant_returns_full_step_metadata(api_client):
    owner = UserFactory(role="OWNER")
    client = login_as(api_client, owner)
    r = client.get("/api/v1/setup-status/")
    assert r.status_code == 200

    step = next(s for s in r.data["steps"] if s["key"] == "academic_year")
    assert step["estimated_minutes"] >= 1
    assert step["why"] != ""
    assert step["on_minimal_path"] is True


def test_minimal_path_progress_tracks_correctly(api_client):
    """Fresh tenant → minimal_path.done_count = 0."""
    owner = UserFactory(role="OWNER")
    client = login_as(api_client, owner)
    r = client.get("/api/v1/setup-status/")
    mp = r.data["minimal_path"]
    assert mp["done_count"] == 0
    assert mp["total_count"] == 6
    assert mp["complete"] is False


def test_estimated_minutes_remaining_sums_all_undone_steps(api_client):
    """Fresh tenant → sum of every step's estimated_minutes."""
    owner = UserFactory(role="OWNER")
    client = login_as(api_client, owner)
    r = client.get("/api/v1/setup-status/")
    # 11 steps total, sum from STEP_META (all 11 have ≥1 min).
    assert r.data["estimated_minutes_remaining"] >= 11


def test_after_complete_empty_until_fully_complete(api_client):
    owner = UserFactory(role="OWNER")
    client = login_as(api_client, owner)
    r = client.get("/api/v1/setup-status/")
    assert r.data["complete"] is False
    assert r.data["after_complete"] == []


def test_after_complete_populated_when_complete(api_client):
    """Build a tenant through all required steps, then assert the
    after-complete cards appear."""
    from apps.people.models import TeacherAssignment

    from .factories import (
        AcademicYearFactory,
        ChapterFactory,
        CourseFactory,
        EnrollmentFactory,
        GradeFactory,
        GroupFactory,
        StageFactory,
        SubjectFactory,
        TeacherUserFactory,
    )

    owner = UserFactory(role="OWNER")
    tenant = owner.tenant

    year = AcademicYearFactory(tenant=tenant)
    stage = StageFactory(tenant=tenant)
    grade = GradeFactory(tenant=tenant, stage=stage)
    group = GroupFactory(tenant=tenant, grade=grade, academic_year=year)
    subject = SubjectFactory(tenant=tenant)
    course = CourseFactory(tenant=tenant, grade=grade, subject=subject)
    ChapterFactory(tenant=tenant, course=course)
    teacher = TeacherUserFactory(tenant=tenant)
    ta = TeacherAssignment.objects.create(tenant=tenant, teacher=teacher, course=course)
    ta.groups.set([group])
    student = UserFactory(tenant=tenant, role="STUDENT")
    EnrollmentFactory(tenant=tenant, student=student, group=group, academic_year=year)

    client = login_as(api_client, owner)
    r = client.get("/api/v1/setup-status/")
    assert r.data["complete"] is True
    assert len(r.data["after_complete"]) == 3
    keys = {a["key"] for a in r.data["after_complete"]}
    assert keys == {"first_assessment", "invite_team", "upload_content"}
