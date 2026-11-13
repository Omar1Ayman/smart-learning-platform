"""Wave M2 (Milestone 2, Batch 9) — F-19 regression.

ADMIN must be able to READ tenant settings and branding.
ADMIN must NOT be able to WRITE them (OWNER-only).
STUDENT/TEACHER must be rejected for both.
"""

import pytest

from apps.tenants.models import Tenant

from .conftest import login_as
from .factories import TeacherUserFactory, TenantFactory, UserFactory

pytestmark = pytest.mark.django_db


# ---------- Settings ----------


def test_owner_can_read_settings(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)
    r = client.get("/api/v1/tenant/settings/")
    assert r.status_code == 200
    assert "exam_policy" in r.data


def test_admin_can_read_settings(api_client):
    """F-19 core: ADMIN needs visibility to answer staff questions."""
    tenant = TenantFactory()
    admin = UserFactory(tenant=tenant, role="ADMIN")
    client = login_as(api_client, admin)
    r = client.get("/api/v1/tenant/settings/")
    assert r.status_code == 200
    assert "exam_policy" in r.data


def test_admin_cannot_patch_settings(api_client):
    """ADMIN remains read-only unless the OWNER delegates this permission."""
    tenant = TenantFactory()
    admin = UserFactory(tenant=tenant, role="ADMIN")
    client = login_as(api_client, admin)
    r = client.patch(
        "/api/v1/tenant/settings/",
        {"exam_policy": {"allow_retakes": False}},
        format="json",
    )
    assert r.status_code == 403


def test_admin_can_patch_settings_when_owner_allows_it(api_client):
    tenant = TenantFactory()
    settings = tenant.get_settings()
    settings["permissions"]["admins_can_manage_settings"] = True
    tenant.settings = settings
    tenant.save(update_fields=["settings"])

    admin = UserFactory(tenant=tenant, role="ADMIN")
    client = login_as(api_client, admin)
    r = client.patch(
        "/api/v1/tenant/settings/",
        {"exam_policy": {"allow_retakes": False}},
        format="json",
    )
    assert r.status_code == 200, r.data
    tenant.refresh_from_db()
    assert tenant.get_settings()["exam_policy"]["allow_retakes"] is False


def test_teacher_cannot_read_settings(api_client):
    tenant = TenantFactory()
    teacher = TeacherUserFactory(tenant=tenant)
    client = login_as(api_client, teacher)
    r = client.get("/api/v1/tenant/settings/")
    assert r.status_code == 403


def test_owner_can_still_patch_settings(api_client):
    """Sanity: F-19 didn't break OWNER write."""
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)
    r = client.patch(
        "/api/v1/tenant/settings/",
        {"exam_policy": {"allow_retakes": False}},
        format="json",
    )
    assert r.status_code == 200
    tenant.refresh_from_db()
    assert tenant.get_settings()["exam_policy"]["allow_retakes"] is False


# ---------- Branding ----------


def test_admin_can_read_branding(api_client):
    tenant = TenantFactory(primary_color="#111111")
    admin = UserFactory(tenant=tenant, role="ADMIN")
    client = login_as(api_client, admin)
    r = client.get("/api/v1/tenant/branding/")
    assert r.status_code == 200
    assert r.data["primary_color"] == "#111111"


def test_admin_cannot_patch_branding(api_client):
    tenant = TenantFactory()
    admin = UserFactory(tenant=tenant, role="ADMIN")
    client = login_as(api_client, admin)
    r = client.patch(
        "/api/v1/tenant/branding/",
        {"primary_color": "#FF0000"},
        format="json",
    )
    assert r.status_code == 403


def test_admin_can_patch_branding_when_owner_allows_settings_management(api_client):
    tenant = TenantFactory()
    settings = tenant.get_settings()
    settings["permissions"]["admins_can_manage_settings"] = True
    tenant.settings = settings
    tenant.save(update_fields=["settings"])

    admin = UserFactory(tenant=tenant, role="ADMIN")
    client = login_as(api_client, admin)
    r = client.patch(
        "/api/v1/tenant/branding/",
        {"primary_color": "#FF0000"},
        format="json",
    )
    assert r.status_code == 200, r.data
    tenant.refresh_from_db()
    assert tenant.primary_color == "#FF0000"


def test_owner_can_patch_branding(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)
    r = client.patch(
        "/api/v1/tenant/branding/",
        {"primary_color": "#FF0000"},
        format="json",
    )
    assert r.status_code == 200
    tenant.refresh_from_db()
    assert tenant.primary_color == "#FF0000"


def test_teacher_cannot_read_branding(api_client):
    tenant = TenantFactory()
    teacher = TeacherUserFactory(tenant=tenant)
    client = login_as(api_client, teacher)
    r = client.get("/api/v1/tenant/branding/")
    assert r.status_code == 403