import pytest

from apps.accounts.models import User

from .conftest import login_as
from .factories import UserFactory

pytestmark = pytest.mark.django_db


def test_signup_creates_tenant_and_owner_and_returns_tokens(api_client):
    resp = api_client.post(
        "/api/v1/auth/signup/",
        {
            "tenant_name": "Future Center",
            "owner_email": "owner@future.test",
            "owner_password": "StrongPass123!",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert "access" in resp.data
    assert "refresh" not in resp.data  # must never appear in the JSON body
    assert "refresh_token" in resp.cookies
    assert resp.cookies["refresh_token"]["httponly"] is True

    user = User.objects.get(email="owner@future.test")
    assert user.role == User.Role.OWNER
    assert user.tenant.name == "Future Center"


def test_signup_rejects_duplicate_email(api_client):
    UserFactory(email="dupe@example.test")
    resp = api_client.post(
        "/api/v1/auth/signup/",
        {
            "tenant_name": "Another Center",
            "owner_email": "dupe@example.test",
            "owner_password": "StrongPass123!",
        },
        format="json",
    )
    assert resp.status_code == 400


def test_login_then_me_returns_current_user_and_tenant(api_client):
    user = UserFactory(role=User.Role.TEACHER)
    client = login_as(api_client, user)
    resp = client.get("/api/v1/auth/me/")
    assert resp.status_code == 200
    assert resp.data["email"] == user.email
    assert resp.data["role"] == "TEACHER"
    assert resp.data["tenant"]["id"] == str(user.tenant_id)


def test_refresh_requires_cookie_not_body(api_client):
    # No cookie set on this fresh client — refresh must be rejected, not
    # fall back to reading a refresh token from the request body.
    resp = api_client.post("/api/v1/auth/refresh/", {}, format="json")
    assert resp.status_code == 401


def test_wrong_password_is_rejected(api_client):
    user = UserFactory()
    resp = api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": "not-the-password"}, format="json"
    )
    assert resp.status_code == 401


def test_unauthenticated_request_is_rejected(api_client):
    resp = api_client.get("/api/v1/academic-years/")
    assert resp.status_code == 401
