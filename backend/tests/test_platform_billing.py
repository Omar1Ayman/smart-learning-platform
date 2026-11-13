import pytest

from apps.accounts.models import User
from apps.billing.models import Plan, Subscription, SubscriptionEvent
from apps.tenants.models import Tenant

from .conftest import login_as
from .factories import TenantFactory, UserFactory

pytestmark = pytest.mark.django_db


def _platform_admin():
    return User.objects.create_user(
        email="billing-admin@platform.test",
        password="TestPass123!",
        is_platform_admin=True,
    )


def test_tenant_admin_cannot_manage_platform_plans(api_client):
    tenant = TenantFactory()
    owner = UserFactory(role="OWNER")
    client = login_as(api_client, owner)
    plan = Plan.objects.get(key="pro")

    response = client.get("/api/v1/platform/billing/plans/")
    assert response.status_code == 403

    response = client.patch(
        f"/api/v1/platform/billing/plans/{plan.id}/",
        {"price_monthly": "1"},
        format="json",
    )
    assert response.status_code == 403

    response = client.delete(f"/api/v1/platform/billing/plans/{plan.id}/")
    assert response.status_code == 403

    response = client.patch(
        f"/api/v1/platform/billing/tenants/{tenant.id}/subscription/",
        {"plan_key": "pro", "status": "ACTIVE"},
        format="json",
    )
    assert response.status_code == 403


def test_platform_admin_can_list_plans_and_implicit_subscriptions(api_client):
    tenant = TenantFactory()
    client = login_as(api_client, _platform_admin())

    plans_response = client.get("/api/v1/platform/billing/plans/")
    tenants_response = client.get("/api/v1/platform/billing/tenants/")

    assert plans_response.status_code == 200
    assert any(plan["key"] == "free" for plan in plans_response.data["results"])
    row = next(item for item in tenants_response.data["results"] if item["id"] == str(tenant.id))
    assert row["plan_key"] == "free"
    assert row["subscription_status"] == "IMPLICIT_FREE"
    assert row["is_implicit"] is True


def test_platform_admin_can_create_a_plan(api_client):
    client = login_as(api_client, _platform_admin())

    response = client.post(
        "/api/v1/platform/billing/plans/",
        {
            "key": "schools-plus",
            "name": "Schools Plus",
            "description": "A custom plan",
            "price_monthly": "1200.00",
            "price_yearly": "12000.00",
            "currency": "EGP",
            "is_active": True,
            "is_public": True,
            "display_order": 5,
            "features": {"attendance": True},
        },
        format="json",
    )

    assert response.status_code == 201, response.data
    plan = Plan.objects.get(key="schools-plus")
    assert plan.price_monthly == 1200
    assert plan.features == {"attendance": True}


def test_platform_admin_can_assign_plan_and_overrides(api_client):
    tenant = TenantFactory(status=Tenant.Status.ACTIVE)
    client = login_as(api_client, _platform_admin())

    response = client.patch(
        f"/api/v1/platform/billing/tenants/{tenant.id}/subscription/",
        {
            "plan_key": "pro",
            "status": "ACTIVE",
            "feature_overrides": {"priority_support": True},
            "limit_overrides": {"max_students": 1800},
        },
        format="json",
    )

    assert response.status_code == 200, response.data
    assert response.data["plan_key"] == "pro"
    assert response.data["is_implicit"] is False
    assert response.data["feature_overrides"] == {"priority_support": True}
    assert response.data["limit_overrides"] == {"max_students": 1800}
    subscription = Subscription.objects.get(tenant=tenant)
    assert subscription.status == Subscription.Status.ACTIVE
    assert subscription.events.filter(event_type=SubscriptionEvent.EventType.CREATED).exists()


def test_platform_admin_starts_trial_when_changing_active_subscription(api_client):
    tenant = TenantFactory(status=Tenant.Status.ACTIVE)
    subscription = Subscription.objects.create(
        tenant=tenant,
        plan=Plan.objects.get(key="pro"),
        status=Subscription.Status.ACTIVE,
    )
    client = login_as(api_client, _platform_admin())

    response = client.patch(
        f"/api/v1/platform/billing/tenants/{tenant.id}/subscription/",
        {"plan_key": "pro", "status": "TRIALING"},
        format="json",
    )

    assert response.status_code == 200, response.data
    subscription.refresh_from_db()
    assert subscription.trial_start is not None
    assert subscription.trial_end is not None
    assert subscription.trial_end > subscription.trial_start


def test_platform_billing_rejects_unknown_feature_or_limit_overrides(api_client):
    tenant = TenantFactory()
    client = login_as(api_client, _platform_admin())

    response = client.patch(
        f"/api/v1/platform/billing/tenants/{tenant.id}/subscription/",
        {
            "plan_key": "pro",
            "status": "ACTIVE",
            "feature_overrides": {"grant_platform_admin": True},
        },
        format="json",
    )

    assert response.status_code == 400
    assert not Subscription.objects.filter(tenant=tenant).exists()


def test_platform_admin_can_update_plan_but_cannot_rename_its_key(api_client):
    plan = Plan.objects.get(key="pro")
    client = login_as(api_client, _platform_admin())

    response = client.patch(
        f"/api/v1/platform/billing/plans/{plan.id}/",
        {"price_monthly": "999"},
        format="json",
    )
    assert response.status_code == 200, response.data
    plan.refresh_from_db()
    assert str(plan.price_monthly) == "999.00"

    response = client.patch(
        f"/api/v1/platform/billing/plans/{plan.id}/",
        {"key": "renamed-pro"},
        format="json",
    )
    assert response.status_code == 400
    assert not Plan.objects.filter(key="renamed-pro").exists()


def test_platform_admin_can_unpublish_a_plan_from_public_pricing(api_client):
    plan = Plan.objects.get(key="pro")
    client = login_as(api_client, _platform_admin())

    response = client.patch(
        f"/api/v1/platform/billing/plans/{plan.id}/",
        {"is_public": False},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["is_public"] is False
    public_plans = client.get("/api/v1/billing/plans/")
    assert all(item["key"] != "pro" for item in public_plans.data)


def test_deactivating_and_reactivating_plan_preserves_subscriptions(api_client):
    plan = Plan.objects.get(key="pro")
    tenant = TenantFactory(status=Tenant.Status.ACTIVE)
    subscription = Subscription.objects.create(
        tenant=tenant,
        plan=plan,
        status=Subscription.Status.ACTIVE,
    )
    client = login_as(api_client, _platform_admin())
    plan_url = f"/api/v1/platform/billing/plans/{plan.id}/"

    deactivate_response = client.patch(
        plan_url,
        {"is_active": False},
        format="json",
    )

    assert deactivate_response.status_code == 200
    assert deactivate_response.data["is_active"] is False
    assert Subscription.objects.filter(id=subscription.id, plan=plan).exists()
    public_plans = client.get("/api/v1/billing/plans/")
    assert all(item["key"] != "pro" for item in public_plans.data)

    reactivate_response = client.patch(
        plan_url,
        {"is_active": True},
        format="json",
    )

    assert reactivate_response.status_code == 200
    assert reactivate_response.data["is_active"] is True
    public_plans = client.get("/api/v1/billing/plans/")
    assert any(item["key"] == "pro" for item in public_plans.data)


def test_platform_admin_can_delete_unused_plan(api_client):
    plan = Plan.objects.create(
        key="unused-test-plan",
        name="Unused test plan",
        price_monthly="100.00",
    )
    client = login_as(api_client, _platform_admin())

    response = client.delete(f"/api/v1/platform/billing/plans/{plan.id}/")

    assert response.status_code == 204
    assert not Plan.objects.filter(id=plan.id).exists()


def test_platform_admin_cannot_delete_default_or_subscribed_plan(api_client):
    free = Plan.objects.get(key="free")
    subscribed = Plan.objects.get(key="pro")
    tenant = TenantFactory(status=Tenant.Status.ACTIVE)
    Subscription.objects.create(
        tenant=tenant,
        plan=subscribed,
        status=Subscription.Status.ACTIVE,
    )
    client = login_as(api_client, _platform_admin())

    free_response = client.delete(f"/api/v1/platform/billing/plans/{free.id}/")
    subscribed_response = client.delete(f"/api/v1/platform/billing/plans/{subscribed.id}/")
    inactive_free_response = client.patch(
        f"/api/v1/platform/billing/plans/{free.id}/",
        {"is_active": False},
        format="json",
    )

    assert free_response.status_code == 409
    assert subscribed_response.status_code == 409
    assert inactive_free_response.status_code == 400
    assert Plan.objects.filter(id=free.id).exists()
    assert Plan.objects.filter(id=subscribed.id).exists()
