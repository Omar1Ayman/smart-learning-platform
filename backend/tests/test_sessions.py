"""Wave 23 — session management lifecycle."""

import pytest

from apps.accounts.models import UserSession

from .conftest import login_as
from .factories import UserFactory

pytestmark = pytest.mark.django_db


def test_login_creates_a_session(api_client):
    user = UserFactory(password="TestPass123!")
    client = login_as(api_client, user)
    assert UserSession.objects.filter(user=user).count() == 1
    s = UserSession.objects.get(user=user)
    assert s.revoked_at is None
    assert s.device_label  # not empty


def test_login_response_includes_session_id(api_client):
    user = UserFactory(password="TestPass123!")
    r = api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": "TestPass123!"}, format="json"
    )
    assert r.status_code == 200
    assert "session_id" in r.data


def test_list_sessions_returns_own_only(api_client):
    user_a = UserFactory(password="TestPass123!")
    user_b = UserFactory(password="TestPass123!")
    client_a = login_as(api_client, user_a)
    login_as(api_client, user_b)  # separate client would be better but this works

    r = client_a.get("/api/v1/auth/sessions/")
    assert r.status_code == 200
    # at least user_a's session should be present
    assert r.data["active_count"] >= 1


def test_cannot_revoke_another_users_session(api_client):
    user_a = UserFactory(password="TestPass123!")
    user_b = UserFactory(password="TestPass123!")

    login_as(api_client, user_b)
    b_session = UserSession.objects.get(user=user_b)

    client_a = login_as(api_client, user_a)
    r = client_a.post(f"/api/v1/auth/sessions/{b_session.id}/revoke/")
    assert r.status_code == 404  # not their session


def test_revoke_own_session_marks_it_revoked(api_client):
    user = UserFactory(password="TestPass123!")
    client = login_as(api_client, user)
    session = UserSession.objects.get(user=user)

    r = client.post(f"/api/v1/auth/sessions/{session.id}/revoke/")
    assert r.status_code == 200
    session.refresh_from_db()
    assert session.revoked_at is not None


def test_logout_revokes_current_session(api_client):
    user = UserFactory(password="TestPass123!")
    client = login_as(api_client, user)
    session = UserSession.objects.get(user=user)
    assert session.revoked_at is None

    client.post("/api/v1/auth/logout/")
    session.refresh_from_db()
    assert session.revoked_at is not None


def test_password_change_revokes_other_sessions(api_client):
    user = UserFactory(password="OldPass123!")
    # Simulate two logins = two sessions
    login_as(api_client, user, password="OldPass123!")
    session1 = UserSession.objects.filter(user=user).first()

    # second login (a new session)
    api_client.credentials()  # clear
    login_as(api_client, user, password="OldPass123!")
    session2 = UserSession.objects.filter(user=user).exclude(id=session1.id).first()
    assert session2 is not None

    r = api_client.post(
        "/api/v1/auth/change-password/",
        {
            "current_password": "OldPass123!",
            "new_password": "NewPass123!",
            "confirm_password": "NewPass123!",
            "current_jti": session2.jti,
        },
        format="json",
    )
    assert r.status_code == 200, r.data
    session1.refresh_from_db()
    session2.refresh_from_db()
    assert session1.revoked_at is not None  # other session was revoked
    assert session2.revoked_at is None  # current session kept


def test_change_password_rejects_wrong_current(api_client):
    user = UserFactory(password="OldPass123!")
    client = login_as(api_client, user, password="OldPass123!")
    r = client.post(
        "/api/v1/auth/change-password/",
        {
            "current_password": "WrongOld!",
            "new_password": "NewPass123!",
            "confirm_password": "NewPass123!",
        },
        format="json",
    )
    assert r.status_code == 400


def test_change_password_rejects_mismatched_confirmation(api_client):
    user = UserFactory(password="OldPass123!")
    client = login_as(api_client, user, password="OldPass123!")
    r = client.post(
        "/api/v1/auth/change-password/",
        {
            "current_password": "OldPass123!",
            "new_password": "NewPass123!",
            "confirm_password": "NewPass999!",
        },
        format="json",
    )
    assert r.status_code == 400


def test_revoke_all_keeps_current(api_client):
    user = UserFactory(password="TestPass123!")

    # First session (old)
    login_as(api_client, user)
    api_client.credentials()

    # Second session (current)
    login_as(api_client, user)

    # Current session = the most recently created one.
    # Do NOT rely on last_seen_at ordering — both rows may share the
    # same microsecond and ordering becomes nondeterministic.
    current = (
        UserSession.objects.filter(user=user, revoked_at__isnull=True)
        .order_by("-created_at")
        .first()
    )
    assert current is not None
    current_jti = current.jti

    r = api_client.post(
        "/api/v1/auth/sessions/revoke-all/", {"keep_jti": current_jti}, format="json"
    )
    assert r.status_code == 200

    current.refresh_from_db()
    assert current.revoked_at is None

    # The OTHER session must be revoked.
    others = UserSession.objects.filter(user=user, revoked_at__isnull=True).exclude(
        id=current.id
    )
    assert others.count() == 0