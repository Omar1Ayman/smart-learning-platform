"""
Spec #12/#13: a Teacher must see only students within their own
assignment scope; a Student must see only their own data. This is the
first phase where that's actually enforceable (it needs TeacherAssignment
to exist), so it gets its own thorough test coverage — same seriousness
as tenant isolation itself, just one role-layer deeper.
"""

import pytest

from apps.people.models import Enrollment, TeacherAssignment

from .conftest import login_as
from .factories import (
    AcademicYearFactory,
    EnrollmentFactory,
    GroupFactory,
    StudentUserFactory,
    TeacherUserFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def test_owner_can_enroll_student_and_academic_year_is_derived(api_client):
    group = GroupFactory()
    group.academic_year.activate()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    student = StudentUserFactory(tenant=group.tenant)

    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/enrollments/", {"student": str(student.id), "group": str(group.id)}, format="json"
    )
    assert resp.status_code == 201, resp.data
    enrollment = Enrollment.objects.get(id=resp.data["id"])
    assert enrollment.academic_year_id == group.academic_year_id


def test_duplicate_enrollment_same_student_same_year_is_rejected(api_client):
    group = GroupFactory()
    group.academic_year.activate()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    student = StudentUserFactory(tenant=group.tenant)
    EnrollmentFactory(
        student=student, group=group, tenant=group.tenant, academic_year=group.academic_year
    )

    another_group_same_year = GroupFactory(
        grade=group.grade, academic_year=group.academic_year, tenant=group.tenant
    )
    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/enrollments/",
        {"student": str(student.id), "group": str(another_group_same_year.id)},
        format="json",
    )
    assert resp.status_code == 400


def test_enrollment_cannot_be_created_while_year_is_draft(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    student = StudentUserFactory(tenant=group.tenant)

    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/enrollments/",
        {"student": str(student.id), "group": str(group.id)},
        format="json",
    )

    assert resp.status_code == 403
    assert "قيد الإعداد" in str(resp.data)


def test_enrollment_cannot_be_created_while_year_is_closing(api_client):
    group = GroupFactory()
    group.academic_year.activate()
    group.academic_year.close(archive=False)
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    student = StudentUserFactory(tenant=group.tenant)

    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/enrollments/",
        {"student": str(student.id), "group": str(group.id)},
        format="json",
    )

    assert resp.status_code == 403
    assert "قيد الإغلاق" in str(resp.data)


def test_archived_group_year_is_locked_even_if_another_year_is_active(api_client):
    group = GroupFactory()
    archived_year = group.academic_year
    archived_year.activate()
    archived_year.close()
    AcademicYearFactory(tenant=group.tenant).activate()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    student = StudentUserFactory(tenant=group.tenant)

    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/enrollments/",
        {"student": str(student.id), "group": str(group.id)},
        format="json",
    )

    assert resp.status_code == 403
    assert "مؤرشفة" in str(resp.data)


def test_archived_group_cannot_be_updated_when_another_year_is_active(api_client):
    group = GroupFactory()
    archived_year = group.academic_year
    archived_year.activate()
    archived_year.close()
    AcademicYearFactory(tenant=group.tenant).activate()
    owner = UserFactory(tenant=group.tenant, role="OWNER")

    client = login_as(api_client, owner)
    resp = client.patch(
        f"/api/v1/groups/{group.id}/",
        {"name": "Changed"},
        format="json",
    )

    assert resp.status_code == 403
    group.refresh_from_db()
    assert group.name != "Changed"


def test_student_sees_only_their_own_enrollment(api_client):
    group = GroupFactory()
    student_a = StudentUserFactory(tenant=group.tenant)
    student_b = StudentUserFactory(tenant=group.tenant)
    EnrollmentFactory(
        student=student_a, group=group, tenant=group.tenant, academic_year=group.academic_year
    )
    EnrollmentFactory(
        student=student_b, group=group, tenant=group.tenant, academic_year=group.academic_year
    )

    client = login_as(api_client, student_a)
    resp = client.get("/api/v1/enrollments/")
    assert resp.status_code == 200
    assert resp.data["count"] == 1
    assert resp.data["results"][0]["student"] == student_a.id


def test_owner_sees_every_enrollment_in_tenant(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    for _ in range(3):
        EnrollmentFactory(group=group, tenant=group.tenant, academic_year=group.academic_year)

    client = login_as(api_client, owner)
    resp = client.get("/api/v1/enrollments/")
    assert resp.data["count"] == 3


def test_teacher_with_narrowed_groups_sees_only_those_groups(api_client):
    group_a = GroupFactory()
    group_b = GroupFactory(
        grade=group_a.grade, academic_year=group_a.academic_year, tenant=group_a.tenant
    )
    teacher = TeacherUserFactory(tenant=group_a.tenant)
    from .factories import CourseFactory

    course = CourseFactory(grade=group_a.grade, tenant=group_a.tenant)
    assignment = TeacherAssignment.objects.create(
        tenant=group_a.tenant, teacher=teacher, course=course
    )
    assignment.groups.set([group_a])

    enrollment_a = EnrollmentFactory(
        group=group_a, tenant=group_a.tenant, academic_year=group_a.academic_year
    )
    EnrollmentFactory(
        group=group_b, tenant=group_a.tenant, academic_year=group_a.academic_year
    )  # not visible

    client = login_as(api_client, teacher)
    resp = client.get("/api/v1/enrollments/")
    assert resp.data["count"] == 1
    assert resp.data["results"][0]["id"] == str(enrollment_a.id)


def test_teacher_with_whole_grade_assignment_sees_every_group_in_grade(api_client):
    group_a = GroupFactory()
    group_b = GroupFactory(
        grade=group_a.grade, academic_year=group_a.academic_year, tenant=group_a.tenant
    )
    teacher = TeacherUserFactory(tenant=group_a.tenant)
    from .factories import CourseFactory

    course = CourseFactory(grade=group_a.grade, tenant=group_a.tenant)
    # no .groups.set(...) at all -> "whole grade" per the model's own docstring
    TeacherAssignment.objects.create(tenant=group_a.tenant, teacher=teacher, course=course)

    EnrollmentFactory(group=group_a, tenant=group_a.tenant, academic_year=group_a.academic_year)
    EnrollmentFactory(group=group_b, tenant=group_a.tenant, academic_year=group_a.academic_year)

    client = login_as(api_client, teacher)
    resp = client.get("/api/v1/enrollments/")
    assert resp.data["count"] == 2


def test_teacher_with_no_assignment_sees_nothing(api_client):
    group = GroupFactory()
    teacher = TeacherUserFactory(tenant=group.tenant)  # no TeacherAssignment at all
    EnrollmentFactory(group=group, tenant=group.tenant, academic_year=group.academic_year)

    client = login_as(api_client, teacher)
    resp = client.get("/api/v1/enrollments/")
    assert resp.data["count"] == 0


def test_teacher_cannot_directly_fetch_an_out_of_scope_enrollment_by_id(api_client):
    group_a = GroupFactory()
    group_b = GroupFactory(
        grade=group_a.grade, academic_year=group_a.academic_year, tenant=group_a.tenant
    )
    teacher = TeacherUserFactory(tenant=group_a.tenant)
    from .factories import CourseFactory

    course = CourseFactory(grade=group_a.grade, tenant=group_a.tenant)
    assignment = TeacherAssignment.objects.create(
        tenant=group_a.tenant, teacher=teacher, course=course
    )
    assignment.groups.set([group_a])

    out_of_scope = EnrollmentFactory(
        group=group_b, tenant=group_a.tenant, academic_year=group_a.academic_year
    )

    client = login_as(api_client, teacher)
    resp = client.get(f"/api/v1/enrollments/{out_of_scope.id}/")
    assert resp.status_code == 404  # not in this teacher's get_queryset() at all


def test_enrollment_list_includes_readable_student_and_group(api_client):
    """The Wave 15 serializer expansion: rather than returning bare UUIDs
    the frontend has to resolve client-side, we include student_email,
    student_name, group_name, academic_year_name as read-only fields."""
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    student = StudentUserFactory(tenant=group.tenant, first_name="Ali", last_name="Hassan")
    EnrollmentFactory(
        student=student, group=group, tenant=group.tenant, academic_year=group.academic_year
    )

    client = login_as(api_client, owner)
    resp = client.get("/api/v1/enrollments/")
    assert resp.status_code == 200
    row = resp.data["results"][0]
    assert row["student_email"] == student.email
    assert row["student_name"] == "Ali Hassan"
    assert row["group_name"] == group.name
    assert row["academic_year_name"] == group.academic_year.name
