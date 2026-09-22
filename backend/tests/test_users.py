import pytest

from apps.accounts.models import User

from .conftest import login_as
from .factories import TenantFactory, UserFactory

pytestmark = pytest.mark.django_db


def test_owner_can_create_a_teacher_account(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")

    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/users/",
        {
            "email": "teacher@example.test",
            "password": "StrongPass123!",
            "role": "TEACHER",
            "first_name": "Ahmed",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert "password" not in resp.data
    created = User.objects.get(email="teacher@example.test")
    assert created.tenant_id == tenant.id
    assert created.check_password("StrongPass123!")


def test_cannot_create_a_second_owner_via_this_endpoint(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")

    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/users/",
        {"email": "owner2@example.test", "password": "StrongPass123!", "role": "OWNER"},
        format="json",
    )
    assert resp.status_code == 400


def test_teacher_cannot_create_users(api_client):
    tenant = TenantFactory()
    teacher = UserFactory(tenant=tenant, role="TEACHER")

    client = login_as(api_client, teacher)
    resp = client.post(
        "/api/v1/users/",
        {"email": "student@example.test", "password": "StrongPass123!", "role": "STUDENT"},
        format="json",
    )
    assert resp.status_code == 403


def test_admin_cannot_list_another_tenants_users(api_client):
    tenant_a = TenantFactory()
    admin_a = UserFactory(tenant=tenant_a, role="OWNER")
    UserFactory(role="TEACHER")  # independent tenant

    client = login_as(api_client, admin_a)
    resp = client.get("/api/v1/users/")
    assert resp.status_code == 200
    assert resp.data["count"] == 1  # only admin_a themself
