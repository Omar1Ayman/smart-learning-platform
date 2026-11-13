"""Wave Zero — H-8, H-9, M-18: safe password setup and validation.

H-8: tenant admins no longer set or transmit user passwords; new users
receive an invitation and choose a password through the reset flow.

H-9: PasswordResetConfirmSerializer validates against the resolved user,
so a reset cannot downgrade a strong password to a weak one.

M-18: ResetOwnerPasswordSerializer (platform admin path) had the same
gap. Fixed by passing the owner in serializer context so
UserAttributeSimilarityValidator can also run.

Fix history (test M-18): the previous version created the platform admin
with password="AdminPass123!" but called login_as(api_client, admin) with
its default password (DEFAULT_TEST_PASSWORD) — so login failed with 401
`no_active_account`. That was a test bug, not a validator bug. Now the
admin is created via UserFactory, which sets DEFAULT_TEST_PASSWORD by
default, so login_as works as intended.
"""

import pytest

from .conftest import login_as
from .factories import TenantFactory, UserFactory

pytestmark = pytest.mark.django_db


# Passwords that MUST be rejected by Django's validators:
#   - "1234567890": all-numeric (NumericPasswordValidator)
#   - "password123": common (CommonPasswordValidator)
#   - "qwertyuiop": common (CommonPasswordValidator)
WEAK_PASSWORDS = ["1234567890", "password123", "qwertyuiop"]


# ---- H-8: invited user password setup ----


def test_admin_cannot_set_the_invited_users_password(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    resp = client.post(
        "/api/v1/users/",
        {
            "email": "weak@test.com",
            "password": "StrongPass123!",
            "role": "TEACHER",
        },
        format="json",
    )
    assert resp.status_code == 400, resp.data
    assert "password" in str(resp.data).lower()


# ---- H-9: password reset ----


@pytest.mark.parametrize("weak", WEAK_PASSWORDS)
def test_cannot_reset_password_to_weak_value(api_client, weak):
    from django.contrib.auth.tokens import default_token_generator
    from django.utils.encoding import force_bytes
    from django.utils.http import urlsafe_base64_encode

    user = UserFactory(password="OriginalPass123!")
    uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)

    resp = api_client.post(
        "/api/v1/auth/password-reset/confirm/",
        {
            "uidb64": uidb64,
            "token": token,
            "new_password": weak,
        },
        format="json",
    )
    assert resp.status_code == 400, resp.data
    assert "new_password" in str(resp.data)


# ---- M-18: platform admin owner-password reset ----


def test_platform_admin_cannot_set_weak_owner_password(api_client):
    """M-18: ResetOwnerPasswordSerializer validates against the owner.

    Uses UserFactory (not User.objects.create_user) so the platform
    admin's password matches DEFAULT_TEST_PASSWORD, which login_as() uses.
    """
    admin = UserFactory(is_platform_admin=True, tenant=None)
    tenant = TenantFactory(status="ACTIVE")
    UserFactory(tenant=tenant, role="OWNER", email="owner@tenant.test")

    client = login_as(api_client, admin)
    resp = client.post(
        f"/api/v1/platform/tenants/{tenant.id}/reset_owner_password/",
        {"new_password": "password123"},
        format="json",
    )
    assert resp.status_code == 400, resp.data
    assert "new_password" in str(resp.data)


def test_platform_admin_can_set_strong_owner_password(api_client):
    """Sanity: strong passwords still succeed via the platform admin path."""
    admin = UserFactory(is_platform_admin=True, tenant=None)
    tenant = TenantFactory(status="ACTIVE")
    UserFactory(tenant=tenant, role="OWNER", email="owner@tenant.test")

    client = login_as(api_client, admin)
    resp = client.post(
        f"/api/v1/platform/tenants/{tenant.id}/reset_owner_password/",
        {"new_password": "Zebra!Forest42"},
        format="json",
    )
    assert resp.status_code == 200, resp.data
