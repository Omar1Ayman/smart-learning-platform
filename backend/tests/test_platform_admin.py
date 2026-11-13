"""Wave 19 — platform admin endpoints + demo requests + suspension."""

import pytest

from apps.accounts.models import User
from apps.tenants.models import DemoRequest, Tenant

from .conftest import login_as
from .factories import TenantFactory, UserFactory

pytestmark = pytest.mark.django_db


def _platform_admin():
    return User.objects.create_user(
        email="admin@platform.test",
        password="TestPass123!",
        is_platform_admin=True,
    )


# ---------- Access control ----------


def test_regular_user_cannot_list_tenants(api_client):
    user = UserFactory()
    client = login_as(api_client, user)
    resp = client.get("/api/v1/platform/tenants/")
    assert resp.status_code == 403


def test_owner_cannot_list_tenants(api_client):
    owner = UserFactory(role="OWNER")
    client = login_as(api_client, owner)
    resp = client.get("/api/v1/platform/tenants/")
    assert resp.status_code == 403


def test_platform_admin_can_list_tenants(api_client):
    TenantFactory()
    admin = _platform_admin()
    client = login_as(api_client, admin)
    resp = client.get("/api/v1/platform/tenants/")
    assert resp.status_code == 200


# ---------- Create tenant ----------


def test_platform_admin_can_create_tenant_with_owner(api_client):
    admin = _platform_admin()
    client = login_as(api_client, admin)
    resp = client.post(
        "/api/v1/platform/tenants/",
        {
            "tenant_name": "Cairo International School",
            "owner_email": "owner@cis.test",
            "owner_password": "StrongPass123!",
            "status": "TRIAL",
            "trial_days": 14,
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    tenant = Tenant.objects.get(name="Cairo International School")
    assert tenant.status == "TRIAL"
    assert tenant.created_by_platform_admin == admin
    assert tenant.trial_ends_at is not None

    owner = User.objects.get(email="owner@cis.test")
    assert owner.role == "OWNER"
    assert owner.tenant == tenant


def test_cannot_create_tenant_with_duplicate_owner_email(api_client):
    UserFactory(email="taken@example.test")
    admin = _platform_admin()
    client = login_as(api_client, admin)
    resp = client.post(
        "/api/v1/platform/tenants/",
        {
            "tenant_name": "Test School",
            "owner_email": "taken@example.test",
            "owner_password": "StrongPass123!",
        },
        format="json",
    )
    assert resp.status_code == 400


# ---------- Status update ----------


def test_platform_admin_can_suspend_tenant(api_client):
    tenant = TenantFactory(status="ACTIVE")
    admin = _platform_admin()
    client = login_as(api_client, admin)
    resp = client.post(
        f"/api/v1/platform/tenants/{tenant.id}/update_status/",
        {"status": "SUSPENDED", "internal_notes": "Payment overdue"},
        format="json",
    )
    assert resp.status_code == 200
    tenant.refresh_from_db()
    assert tenant.status == "SUSPENDED"
    assert tenant.internal_notes == "Payment overdue"


# ---------- Suspension enforcement ----------


def test_suspended_tenant_user_gets_403_on_tenant_endpoint(api_client):
    tenant = TenantFactory(status="SUSPENDED")
    user = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, user)
    resp = client.get("/api/v1/academic-years/")
    assert resp.status_code == 403
    detail = resp.data["error"]["detail"]
    assert "معلّق" in detail or "تعليق" in detail or "الدعم" in detail


def test_churned_tenant_user_gets_403(api_client):
    tenant = TenantFactory(status="CHURNED")
    user = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, user)
    resp = client.get("/api/v1/academic-years/")
    assert resp.status_code == 403


def test_active_tenant_user_can_access_endpoints(api_client):
    tenant = TenantFactory(status="ACTIVE")
    user = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, user)
    resp = client.get("/api/v1/academic-years/")
    assert resp.status_code == 200


# ---------- Public demo requests ----------


def test_anyone_can_submit_demo_request(api_client):
    resp = api_client.post(
        "/api/v1/demo-requests/",
        {
            "school_name": "New Cairo International",
            "contact_name": "Ahmed Hassan",
            "email": "ahmed@ncis.test",
            "phone": "+201001234567",
            "num_students": 500,
            "message": "نريد عرض توضيحي للمنصة",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert DemoRequest.objects.count() == 1
    demo = DemoRequest.objects.first()
    assert demo.status == "NEW"
    assert demo.school_name == "New Cairo International"


def test_platform_admin_can_see_demo_requests(api_client):
    DemoRequest.objects.create(
        school_name="Test School",
        contact_name="Contact",
        email="c@test.test",
        phone="01000000000",
    )
    admin = _platform_admin()
    client = login_as(api_client, admin)
    resp = client.get("/api/v1/platform/demo-requests/")
    assert resp.status_code == 200
    assert resp.data["count"] == 1


# ---------- Metrics ----------


def test_platform_metrics_returns_counts(api_client):
    TenantFactory(status="ACTIVE")
    TenantFactory(status="TRIAL")
    TenantFactory(status="TRIAL")
    DemoRequest.objects.create(school_name="X", contact_name="Y", email="z@test.test", phone="0")
    admin = _platform_admin()
    client = login_as(api_client, admin)
    resp = client.get("/api/v1/platform/metrics/")
    assert resp.status_code == 200
    assert resp.data["tenants"]["active"] == 1
    assert resp.data["tenants"]["trial"] == 2
    assert resp.data["demo_requests_new"] == 1
