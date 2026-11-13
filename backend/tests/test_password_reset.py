
"""Wave 13 — password reset flow. Uses Django's console email backend
(configured in settings) so the reset link is captured via
mail.outbox in tests."""

import pytest
from django.core import mail

from apps.accounts.models import User

from .factories import UserFactory

pytestmark = pytest.mark.django_db


def _extract_reset_url(body: str) -> tuple[str, str]:
    """Pull uidb64 and token out of the email body."""
    import re

    m = re.search(r"uidb64=([^&\s]+)&token=([^\s]+)", body)
    assert m, f"No reset URL in email body: {body}"
    return m.group(1), m.group(2)


def test_request_sends_email_when_user_exists(api_client):
    user = UserFactory(email="reset@example.test")
    mail.outbox = []

    resp = api_client.post(
        "/api/v1/auth/password-reset/", {"email": user.email}, format="json"
    )
    assert resp.status_code == 200
    assert len(mail.outbox) == 1
    assert "إعادة تعيين" in mail.outbox[0].subject
    assert user.email in mail.outbox[0].to


def test_request_does_not_reveal_missing_email(api_client):
    """Same response for existing and missing email — no enumeration."""
    mail.outbox = []
    resp = api_client.post(
        "/api/v1/auth/password-reset/", {"email": "nobody@example.test"}, format="json"
    )
    assert resp.status_code == 200
    assert len(mail.outbox) == 0


def test_full_reset_flow_changes_password(api_client):
    user = UserFactory(email="flow@example.test")
    original_hash = user.password

    mail.outbox = []
    api_client.post("/api/v1/auth/password-reset/", {"email": user.email}, format="json")
    uidb64, token = _extract_reset_url(mail.outbox[0].body)

    resp = api_client.post(
        "/api/v1/auth/password-reset/confirm/",
        {"uidb64": uidb64, "token": token, "new_password": "NewStrongPass123!"},
        format="json",
    )
    assert resp.status_code == 200, resp.data
    user.refresh_from_db()
    assert user.password != original_hash
    assert user.check_password("NewStrongPass123!")


def test_reset_rejects_invalid_token(api_client):
    user = UserFactory()
    resp = api_client.post(
        "/api/v1/auth/password-reset/confirm/",
        {"uidb64": "bogus", "token": "bad-token", "new_password": "NewStrongPass123!"},
        format="json",
    )
    assert resp.status_code == 400


def test_reset_token_is_single_use(api_client):
    user = UserFactory(email="single@example.test")
    mail.outbox = []
    api_client.post("/api/v1/auth/password-reset/", {"email": user.email}, format="json")
    uidb64, token = _extract_reset_url(mail.outbox[0].body)

    first = api_client.post(
        "/api/v1/auth/password-reset/confirm/",
        {"uidb64": uidb64, "token": token, "new_password": "NewPassFirst123!"},
        format="json",
    )
    assert first.status_code == 200

    second = api_client.post(
        "/api/v1/auth/password-reset/confirm/",
        {"uidb64": uidb64, "token": token, "new_password": "NewPassSecond123!"},
        format="json",
    )
    assert second.status_code == 400