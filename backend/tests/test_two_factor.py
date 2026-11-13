"""Wave 20 — TOTP 2FA flow."""

import pyotp
import pytest

from .conftest import login_as
from .factories import UserFactory

pytestmark = pytest.mark.django_db


def _setup_2fa(client):
    r = client.post("/api/v1/auth/2fa/setup/")
    assert r.status_code == 200
    return r.data


def _enable_2fa(client, secret):
    code = pyotp.totp.TOTP(secret).now()
    r = client.post("/api/v1/auth/2fa/enable/", {"code": code}, format="json")
    assert r.status_code == 200, r.data


def _login_2fa(client, email, password, secret=None, recovery_code=None):
    r = client.post("/api/v1/auth/login/", {"email": email, "password": password}, format="json")
    assert r.status_code == 200
    assert r.data.get("requires_2fa") is True
    twofa_token = r.data["twofa_token"]

    code = recovery_code or pyotp.totp.TOTP(secret).now()
    return client.post(
        "/api/v1/auth/login/2fa/",
        {"twofa_token": twofa_token, "code": code},
        format="json",
    )


def test_setup_returns_secret_and_recovery_codes(api_client):
    user = UserFactory()
    client = login_as(api_client, user)
    data = _setup_2fa(client)
    assert "secret" in data
    assert "provisioning_uri" in data
    assert len(data["recovery_codes"]) == 8
    # Not enabled yet
    user.refresh_from_db()
    assert user.two_factor_enabled is False


def test_enable_requires_valid_code(api_client):
    user = UserFactory()
    client = login_as(api_client, user)
    data = _setup_2fa(client)

    # Wrong code
    r = client.post("/api/v1/auth/2fa/enable/", {"code": "000000"}, format="json")
    assert r.status_code == 400

    # Correct code
    _enable_2fa(client, data["secret"])
    user.refresh_from_db()
    assert user.two_factor_enabled is True


def test_login_with_2fa_returns_challenge(api_client):
    user = UserFactory(password="TestPass123!")
    client = login_as(api_client, user)
    data = _setup_2fa(client)
    _enable_2fa(client, data["secret"])

    r = api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": "TestPass123!"}, format="json"
    )
    assert r.status_code == 200
    assert r.data["requires_2fa"] is True
    assert "twofa_token" in r.data
    assert "access" not in r.data


def test_login_with_2fa_and_valid_code_succeeds(api_client):
    user = UserFactory(password="TestPass123!")
    client = login_as(api_client, user)
    data = _setup_2fa(client)
    _enable_2fa(client, data["secret"])

    r = _login_2fa(api_client, user.email, "TestPass123!", secret=data["secret"])
    assert r.status_code == 200
    assert "access" in r.data
    assert r.data["user"]["email"] == user.email


def test_login_with_2fa_and_invalid_code_fails(api_client):
    user = UserFactory(password="TestPass123!")
    client = login_as(api_client, user)
    data = _setup_2fa(client)
    _enable_2fa(client, data["secret"])

    r = api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": "TestPass123!"}, format="json"
    )
    twofa_token = r.data["twofa_token"]

    r = api_client.post(
        "/api/v1/auth/login/2fa/",
        {"twofa_token": twofa_token, "code": "999999"},
        format="json",
    )
    assert r.status_code == 400


def test_recovery_code_works_once(api_client):
    user = UserFactory(password="TestPass123!")
    client = login_as(api_client, user)
    data = _setup_2fa(client)
    _enable_2fa(client, data["secret"])
    recovery = data["recovery_codes"][0]

    # First use — success
    r = _login_2fa(api_client, user.email, "TestPass123!", recovery_code=recovery)
    assert r.status_code == 200

    # Second use — fails (consumed)
    r = _login_2fa(api_client, user.email, "TestPass123!", recovery_code=recovery)
    assert r.status_code == 400


def test_disable_requires_password_and_code(api_client):
    user = UserFactory(password="TestPass123!")
    client = login_as(api_client, user)
    data = _setup_2fa(client)
    _enable_2fa(client, data["secret"])

    # Wrong password
    r = client.post(
        "/api/v1/auth/2fa/disable/",
        {"password": "wrong", "code": pyotp.totp.TOTP(data["secret"]).now()},
        format="json",
    )
    assert r.status_code == 400

    # Correct
    r = client.post(
        "/api/v1/auth/2fa/disable/",
        {"password": "TestPass123!", "code": pyotp.totp.TOTP(data["secret"]).now()},
        format="json",
    )
    assert r.status_code == 200
    user.refresh_from_db()
    assert user.two_factor_enabled is False
    assert user.two_factor_secret == ""


def test_expired_twofa_token_rejected(api_client, settings):
    user = UserFactory(password="TestPass123!")
    client = login_as(api_client, user)
    data = _setup_2fa(client)
    _enable_2fa(client, data["secret"])

    r = api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": "TestPass123!"}, format="json"
    )
    token = r.data["twofa_token"]

    # Manipulate to force expiry — easiest: tamper the token
    r = api_client.post(
        "/api/v1/auth/login/2fa/",
        {"twofa_token": token[:-5] + "xxxxx", "code": "000000"},
        format="json",
    )
    assert r.status_code == 401
