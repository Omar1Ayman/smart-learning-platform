"""Phase 1.1 — Billing API tests."""

import pytest

from apps.billing.models import Plan
from apps.billing.services import assign_plan

from .conftest import login_as
from .factories import TeacherUserFactory, TenantFactory, UserFactory

pytestmark = pytest.mark.django_db


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def free_plan():
    return Plan.objects.get(key="free")


@pytest.fixture
def pro_plan():
    return Plan.objects.get(key="pro")


# ============================================================================
# GET /billing/plans/ — public
# ============================================================================


def test_plans_list_is_public(api_client, free_plan, pro_plan):
    r = api_client.get("/api/v1/billing/plans/")
    assert r.status_code == 200
    keys = [p["key"] for p in r.data]
    assert "free" in keys
    assert "pro" in keys


def test_plans_excludes_inactive(api_client, free_plan):
    Plan.objects.create(key="hidden", name="Hidden", is_active=False, is_public=True)
    r = api_client.get("/api/v1/billing/plans/")
    keys = [p["key"] for p in r.data]
    assert "hidden" not in keys


# ============================================================================
# GET /billing/me/
# ============================================================================


def test_me_returns_implicit_free_when_no_subscription(api_client, free_plan):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")

    client = login_as(api_client, owner)
    r = client.get("/api/v1/billing/me/")
    assert r.status_code == 200, r.data
    assert r.data["status"] == "IMPLICIT_FREE"
    assert r.data["is_implicit"] is True
    assert r.data["plan"]["key"] == "free"
    assert r.data["features"]["bulk_grading"] is False
    assert r.data["features"]["parent_portal"] is True
    assert r.data["limits"]["max_students"] == 30


def test_me_returns_subscription_after_assign(api_client, free_plan, pro_plan):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    assign_plan(tenant, "pro", status="ACTIVE")

    client = login_as(api_client, owner)
    r = client.get("/api/v1/billing/me/")
    assert r.status_code == 200, r.data
    assert r.data["status"] == "ACTIVE"
    assert r.data["is_implicit"] is False
    assert r.data["plan"]["key"] == "pro"
    assert r.data["features"]["bulk_grading"] is True
    assert r.data["limits"]["max_students"] == 300


# ============================================================================
# GET /billing/usage/
# ============================================================================


def test_usage_endpoint(api_client, free_plan):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    UserFactory(tenant=tenant, role="STUDENT")
    UserFactory(tenant=tenant, role="STUDENT")

    client = login_as(api_client, owner)
    r = client.get("/api/v1/billing/usage/")
    assert r.status_code == 200, r.data
    assert r.data["max_students"]["current"] == 2
    assert r.data["max_students"]["max"] == 30


# ============================================================================
# GET /billing/features/
# ============================================================================


def test_features_endpoint(api_client, free_plan):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")

    client = login_as(api_client, owner)
    r = client.get("/api/v1/billing/features/")
    assert r.status_code == 200, r.data
    assert "bulk_grading" in r.data["features"]
    assert r.data["features"]["bulk_grading"] is False


def test_teacher_can_read_features_without_billing_details(api_client, free_plan):
    teacher = TeacherUserFactory()
    client = login_as(api_client, teacher)

    features = client.get("/api/v1/billing/features/")
    billing = client.get("/api/v1/billing/me/")

    assert features.status_code == 200
    assert billing.status_code == 403


def test_admin_billing_access_is_owner_configurable(api_client, free_plan):
    tenant = TenantFactory()
    settings = tenant.get_settings()
    settings["permissions"]["admins_can_view_billing"] = False
    tenant.settings = settings
    tenant.save(update_fields=["settings"])
    admin = UserFactory(tenant=tenant, role="ADMIN")
    client = login_as(api_client, admin)

    denied = client.get("/api/v1/billing/me/")
    assert denied.status_code == 403

    settings["permissions"]["admins_can_view_billing"] = True
    tenant.settings = settings
    tenant.save(update_fields=["settings"])
    allowed = client.get("/api/v1/billing/me/")
    assert allowed.status_code == 200, allowed.data
