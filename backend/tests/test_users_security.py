"""Wave 1 security fixes — role-scoped /users/ read visibility, safe
update/delete on the User model, and OWNER-account protection."""

import pytest

from apps.accounts.models import User

from .conftest import login_as
from .factories import TeacherUserFactory, TenantFactory, UserFactory

pytestmark = pytest.mark.django_db


# ---------- Read visibility ----------


def test_student_can_only_see_themselves_in_users_list(api_client):
    tenant = TenantFactory()
    student_a = UserFactory(tenant=tenant, role="STUDENT")
    UserFactory(tenant=tenant, role="TEACHER", email="other-teacher@example.test")
    UserFactory(tenant=tenant, role="STUDENT", email="other-student@example.test")

    client = login_as(api_client, student_a)
    resp = client.get("/api/v1/users/")
    assert resp.status_code == 200
    assert resp.data["count"] == 1
    assert resp.data["results"][0]["id"] == str(student_a.id)


def test_teacher_can_only_see_themselves_in_users_list(api_client):
    tenant = TenantFactory()
    teacher_a = TeacherUserFactory(tenant=tenant)
    TeacherUserFactory(tenant=tenant)  # another teacher, must not be visible
    UserFactory(tenant=tenant, role="STUDENT")

    client = login_as(api_client, teacher_a)
    resp = client.get("/api/v1/users/")
    assert resp.status_code == 200
    assert resp.data["count"] == 1
    assert resp.data["results"][0]["id"] == str(teacher_a.id)


def test_owner_can_see_all_users_in_tenant(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    TeacherUserFactory(tenant=tenant)
    UserFactory(tenant=tenant, role="STUDENT")

    client = login_as(api_client, owner)
    resp = client.get("/api/v1/users/")
    assert resp.data["count"] == 3  # owner + teacher + student


# ---------- Update ----------


def test_admin_can_update_teacher_first_name(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=tenant)

    client = login_as(api_client, owner)
    resp = client.patch(f"/api/v1/users/{teacher.id}/", {"first_name": "Ahmed"}, format="json")
    assert resp.status_code == 200
    teacher.refresh_from_db()
    assert teacher.first_name == "Ahmed"


def test_admin_can_deactivate_teacher(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=tenant)

    client = login_as(api_client, owner)
    resp = client.patch(f"/api/v1/users/{teacher.id}/", {"is_active": False}, format="json")
    assert resp.status_code == 200
    teacher.refresh_from_db()
    assert teacher.is_active is False


def test_admin_cannot_change_a_users_email(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=tenant)
    original_email = teacher.email

    client = login_as(api_client, owner)
    resp = client.patch(
        f"/api/v1/users/{teacher.id}/", {"email": "hijacked@example.test"}, format="json"
    )
    assert resp.status_code == 200
    teacher.refresh_from_db()
    assert teacher.email == original_email  # ignored — read_only field


def test_admin_cannot_change_a_users_role(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=tenant)

    client = login_as(api_client, owner)
    resp = client.patch(f"/api/v1/users/{teacher.id}/", {"role": "ADMIN"}, format="json")
    assert resp.status_code == 200
    teacher.refresh_from_db()
    assert teacher.role == "TEACHER"  # unchanged


# ---------- OWNER / self protection ----------


def test_admin_cannot_delete_the_owner(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    admin = UserFactory(tenant=tenant, role="ADMIN")

    client = login_as(api_client, admin)
    resp = client.delete(f"/api/v1/users/{owner.id}/")
    assert resp.status_code == 403
    assert User.objects.filter(id=owner.id).exists()


def test_admin_cannot_deactivate_the_owner(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    admin = UserFactory(tenant=tenant, role="ADMIN")

    client = login_as(api_client, admin)
    resp = client.patch(f"/api/v1/users/{owner.id}/", {"is_active": False}, format="json")
    assert resp.status_code == 403
    owner.refresh_from_db()
    assert owner.is_active is True


def test_admin_cannot_delete_their_own_account(api_client):
    tenant = TenantFactory()
    admin = UserFactory(tenant=tenant, role="ADMIN")

    client = login_as(api_client, admin)
    resp = client.delete(f"/api/v1/users/{admin.id}/")
    assert resp.status_code == 403
    assert User.objects.filter(id=admin.id).exists()


def test_owner_can_still_delete_a_teacher(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=tenant)

    client = login_as(api_client, owner)
    resp = client.delete(f"/api/v1/users/{teacher.id}/")
    assert resp.status_code == 204
    assert not User.objects.filter(id=teacher.id).exists()
