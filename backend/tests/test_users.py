import re
from urllib.parse import parse_qs, urlparse

import pytest

from apps.accounts.models import User

from .conftest import login_as
from .factories import TenantFactory, UserFactory

pytestmark = pytest.mark.django_db


def test_owner_can_create_a_teacher_account_and_invite_user(api_client, mailoutbox):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")

    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/users/",
        {
            "email": "teacher@example.test",
            "role": "TEACHER",
            "first_name": "Ahmed",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["password_setup_pending"] is True
    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == ["teacher@example.test"]
    created = User.objects.get(email="teacher@example.test")
    assert created.tenant_id == tenant.id
    assert not created.has_usable_password()

    invite_url = re.search(r"https?://\S+", mailoutbox[0].body).group()
    invite_params = parse_qs(urlparse(invite_url).query)
    assert invite_params["invite"] == ["1"]

    reset = api_client.post(
        "/api/v1/auth/password-reset/confirm/",
        {
            "uidb64": invite_params["uidb64"][0],
            "token": invite_params["token"][0],
            "new_password": "StrongPass123!",
        },
        format="json",
    )
    assert reset.status_code == 200, reset.data
    created.refresh_from_db()
    assert created.check_password("StrongPass123!")
    detail = client.get(f"/api/v1/users/{created.id}/")
    assert detail.data["password_setup_pending"] is False


def test_failed_invitation_delivery_does_not_create_user(api_client, monkeypatch):
    from apps.accounts import serializers
    from apps.accounts.invitations import InvitationDeliveryError

    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    def fail_invitation(user):
        raise InvitationDeliveryError()

    monkeypatch.setattr(serializers, "send_account_invitation", fail_invitation)

    response = client.post(
        "/api/v1/users/",
        {"email": "no-invite@example.test", "role": "TEACHER"},
        format="json",
    )
    assert response.status_code == 503
    assert not User.objects.filter(email="no-invite@example.test").exists()


def test_cannot_create_a_second_owner_via_this_endpoint(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")

    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/users/",
        {"email": "owner2@example.test", "role": "OWNER"},
        format="json",
    )
    assert resp.status_code == 400


def test_teacher_cannot_create_users(api_client):
    tenant = TenantFactory()
    teacher = UserFactory(tenant=tenant, role="TEACHER")

    client = login_as(api_client, teacher)
    resp = client.post(
        "/api/v1/users/",
        {"email": "student@example.test", "role": "STUDENT"},
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


def test_admin_cannot_set_a_users_password(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/users/",
        {
            "email": "weak@test.com",
            "password": "StrongPass123!",
            "role": "TEACHER",
        },
        format="json",
    )
    assert r.status_code == 400
    assert not User.objects.filter(email="weak@test.com").exists()
