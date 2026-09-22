import pytest
from rest_framework.test import APIClient

from apps.people.models import TeacherAssignment

from .conftest import login_as
from .factories import CourseFactory, GroupFactory, TeacherUserFactory, TenantFactory, UserFactory

pytestmark = pytest.mark.django_db


def test_owner_can_assign_teacher_to_course(api_client):
    course = CourseFactory()
    owner = UserFactory(tenant=course.tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=course.tenant)

    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/teacher-assignments/", {"teacher": str(teacher.id), "course": str(course.id)}, format="json"
    )
    assert resp.status_code == 201, resp.data
    assert TeacherAssignment.objects.get(id=resp.data["id"]).tenant_id == course.tenant_id


def test_assignment_group_must_belong_to_courses_grade(api_client):
    course = CourseFactory()
    owner = UserFactory(tenant=course.tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=course.tenant)
    unrelated_group = GroupFactory(tenant=course.tenant)  # its own independent grade

    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/teacher-assignments/",
        {"teacher": str(teacher.id), "course": str(course.id), "groups": [str(unrelated_group.id)]},
        format="json",
    )
    assert resp.status_code == 400


def test_cannot_assign_a_teacher_from_another_tenant(api_client):
    course = CourseFactory()
    owner = UserFactory(tenant=course.tenant, role="OWNER")
    foreign_teacher = TeacherUserFactory()  # independent tenant

    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/teacher-assignments/",
        {"teacher": str(foreign_teacher.id), "course": str(course.id)},
        format="json",
    )
    assert resp.status_code == 400


def test_admin_cannot_read_another_tenants_assignment(api_client):
    tenant_a = TenantFactory()
    admin_a = UserFactory(tenant=tenant_a, role="OWNER")
    course_b = CourseFactory()
    teacher_b = TeacherUserFactory(tenant=course_b.tenant)
    assignment_b = TeacherAssignment.objects.create(
        tenant=course_b.tenant, teacher=teacher_b, course=course_b
    )

    client = login_as(api_client, admin_a)
    resp = client.get(f"/api/v1/teacher-assignments/{assignment_b.id}/")
    assert resp.status_code in (403, 404)


def test_teacher_cannot_create_assignment(api_client):
    course = CourseFactory()
    teacher = TeacherUserFactory(tenant=course.tenant)
    other_teacher = TeacherUserFactory(tenant=course.tenant)

    client = login_as(APIClient(), teacher)
    resp = client.post(
        "/api/v1/teacher-assignments/",
        {"teacher": str(other_teacher.id), "course": str(course.id)},
        format="json",
    )
    assert resp.status_code == 403
