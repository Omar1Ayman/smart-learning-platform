"""Wave 13 — verify rate limits actually trigger. Rate limits are cached
per test via LocMemCache so each test starts fresh (override_settings
below is not strictly needed; the throttle backend resets per test).

The 6th login attempt with a wrong password is what we test — successful
logins are also throttled, but failed ones are the real attack pattern."""

import pytest

from .factories import UserFactory

pytestmark = pytest.mark.django_db


def test_login_throttles_after_five_attempts(api_client):
    """5/min on login — the 6th fails with 429 even with valid creds."""
    user = UserFactory(password="CorrectPass123!")

    for _ in range(5):
        api_client.post(
            "/api/v1/auth/login/",
            {"email": user.email, "password": "WrongPass123!"},
            format="json",
        )

    resp = api_client.post(
        "/api/v1/auth/login/",
        {"email": user.email, "password": "CorrectPass123!"},
        format="json",
    )
    assert resp.status_code == 429


def test_signup_throttles(api_client):
    """3/hour — heavy protection against tenant-spam signups."""
    for i in range(3):
        api_client.post(
            "/api/v1/auth/signup/",
            {
                "tenant_name": f"Center {i}",
                "owner_email": f"owner{i}@example.test",
                "owner_password": "StrongPass123!",
            },
            format="json",
        )

    resp = api_client.post(
        "/api/v1/auth/signup/",
        {
            "tenant_name": "Blocked",
            "owner_email": "blocked@example.test",
            "owner_password": "StrongPass123!",
        },
        format="json",
    )
    assert resp.status_code == 429


def test_password_reset_throttles(api_client):
    for i in range(3):
        api_client.post(
            "/api/v1/auth/password-reset/",
            {"email": f"r{i}@example.test"},
            format="json",
        )
    resp = api_client.post(
        "/api/v1/auth/password-reset/", {"email": "blocked@example.test"}, format="json"
    )
    assert resp.status_code == 429
