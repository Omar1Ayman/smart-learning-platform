"""
spec #27's own example, made literal: "First Secondary Biology Term 1
Book" (scoped to grade + subject + term, no group at all) must be
visible to every eligible student in that grade regardless of which
Group they're in.
"""

import pytest

from apps.content.models import Content

from .conftest import login_as
from .factories import (
    AcademicYearFactory,
    CourseFactory,
    EnrollmentFactory,
    GroupFactory,
    SubjectFactory,
    TenantFactory,
    TermFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def _make_scoped_content(tenant, **scope):
    return Content.objects.create(
        tenant=tenant,
        title="First Secondary Biology Term 1 Book",
        content_type=Content.ContentType.TEXT,
        text_body="...",
        **scope,
    )


def test_student_sees_grade_subject_term_scoped_content_across_different_groups(api_client):
    tenant = TenantFactory()
    year = AcademicYearFactory(tenant=tenant)
    term = TermFactory(tenant=tenant, academic_year=year)
    subject = SubjectFactory(tenant=tenant)
    group_a = GroupFactory(tenant=tenant, academic_year=year)
    group_b = GroupFactory(tenant=tenant, grade=group_a.grade, academic_year=year)
    CourseFactory(tenant=tenant, grade=group_a.grade, subject=subject)

    content = _make_scoped_content(tenant, grade=group_a.grade, subject=subject, term=term)

    student_in_a = UserFactory(tenant=tenant, role="STUDENT")
    student_in_b = UserFactory(tenant=tenant, role="STUDENT")
    EnrollmentFactory(tenant=tenant, student=student_in_a, group=group_a, academic_year=year)
    EnrollmentFactory(tenant=tenant, student=student_in_b, group=group_b, academic_year=year)

    for student in (student_in_a, student_in_b):
        client = login_as(api_client, student)
        resp = client.get("/api/v1/content/")
        assert resp.status_code == 200
        ids = [row["id"] for row in resp.data["results"]]
        assert str(content.id) in ids, f"student in {student.email}'s group should see grade-wide content"


def test_student_does_not_see_content_scoped_to_a_different_group():
    pass  # covered structurally below with an explicit group scope


def test_student_does_not_see_group_scoped_content_from_another_group(api_client):
    tenant = TenantFactory()
    year = AcademicYearFactory(tenant=tenant)
    group_a = GroupFactory(tenant=tenant, academic_year=year)
    group_b = GroupFactory(tenant=tenant, grade=group_a.grade, academic_year=year)

    content = _make_scoped_content(tenant, group=group_a)  # explicitly narrowed to group A only

    student_in_b = UserFactory(tenant=tenant, role="STUDENT")
    EnrollmentFactory(tenant=tenant, student=student_in_b, group=group_b, academic_year=year)

    client = login_as(api_client, student_in_b)
    resp = client.get("/api/v1/content/")
    ids = [row["id"] for row in resp.data["results"]]
    assert str(content.id) not in ids


def test_student_with_no_enrollment_sees_no_content(api_client):
    tenant = TenantFactory()
    _make_scoped_content(tenant)  # unscoped — would be visible to any *enrolled* student
    student = UserFactory(tenant=tenant, role="STUDENT")  # never enrolled

    client = login_as(api_client, student)
    resp = client.get("/api/v1/content/")
    assert resp.data["count"] == 0


def test_student_does_not_see_unpublished_content(api_client):
    tenant = TenantFactory()
    year = AcademicYearFactory(tenant=tenant)
    group = GroupFactory(tenant=tenant, academic_year=year)
    content = _make_scoped_content(tenant, grade=group.grade)
    content.is_published = False
    content.save(update_fields=["is_published"])

    student = UserFactory(tenant=tenant, role="STUDENT")
    EnrollmentFactory(tenant=tenant, student=student, group=group, academic_year=year)

    client = login_as(api_client, student)
    resp = client.get("/api/v1/content/")
    assert resp.data["count"] == 0


def test_owner_sees_unpublished_content_too(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    content = _make_scoped_content(tenant)
    content.is_published = False
    content.save(update_fields=["is_published"])

    client = login_as(api_client, owner)
    resp = client.get("/api/v1/content/")
    ids = [row["id"] for row in resp.data["results"]]
    assert str(content.id) in ids


def test_admin_cannot_read_another_tenants_content(api_client):
    tenant_a = TenantFactory()
    admin_a = UserFactory(tenant=tenant_a, role="OWNER")
    other_content = _make_scoped_content(TenantFactory())

    client = login_as(api_client, admin_a)
    resp = client.get(f"/api/v1/content/{other_content.id}/")
    assert resp.status_code in (403, 404)
