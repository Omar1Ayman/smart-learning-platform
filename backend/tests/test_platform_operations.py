import pytest
from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.tenants.models import Tenant

from .conftest import login_as
from .factories import TenantFactory, UserFactory

pytestmark = pytest.mark.django_db


def _platform_admin():
    return User.objects.create_user(
        email="operations-admin@platform.test",
        password="TestPass123!",
        is_platform_admin=True,
    )


def test_tenant_admin_cannot_access_platform_user_or_audit_endpoints(api_client):
    owner = UserFactory(role=User.Role.OWNER)
    client = login_as(api_client, owner)

    assert client.get("/api/v1/platform/users/").status_code == 403
    assert client.get("/api/v1/platform/audit/").status_code == 403


def test_platform_admin_can_search_tenant_users_without_platform_accounts(api_client):
    tenant = TenantFactory()
    UserFactory(tenant=tenant, role=User.Role.TEACHER, email="teacher@school.test")
    platform_admin = _platform_admin()
    client = login_as(api_client, platform_admin)

    response = client.get(
        "/api/v1/platform/users/",
        {"search": "teacher", "role": User.Role.TEACHER},
    )

    assert response.status_code == 200
    assert response.data["count"] == 1
    row = response.data["results"][0]
    assert row["email"] == "teacher@school.test"
    assert row["tenant_name"] == tenant.name
    assert row["role"] == User.Role.TEACHER


def test_platform_admin_can_change_non_owner_user_status_and_audit_it(api_client):
    tenant = TenantFactory()
    user = UserFactory(tenant=tenant, role=User.Role.STUDENT, is_active=True)
    client = login_as(api_client, _platform_admin())

    response = client.patch(
        f"/api/v1/platform/users/{user.id}/status/",
        {"is_active": False},
        format="json",
    )

    assert response.status_code == 200, response.data
    user.refresh_from_db()
    assert user.is_active is False
    event = AuditLog.objects.get(action="platform.user_status_updated")
    assert event.tenant == tenant
    assert event.object_id == str(user.id)


def test_platform_admin_cannot_disable_an_owner_from_user_directory(api_client):
    owner = UserFactory(role=User.Role.OWNER)
    client = login_as(api_client, _platform_admin())

    response = client.patch(
        f"/api/v1/platform/users/{owner.id}/status/",
        {"is_active": False},
        format="json",
    )

    assert response.status_code == 400
    owner.refresh_from_db()
    assert owner.is_active is True


def test_platform_audit_excludes_tenant_learning_events(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role=User.Role.OWNER)
    platform_admin = _platform_admin()
    AuditLog.objects.create(
        tenant=tenant,
        actor=owner,
        action="assessment.created",
        object_type="Assessment",
        object_id="assessment-1",
    )
    AuditLog.objects.create(
        tenant=tenant,
        actor=platform_admin,
        action="platform.subscription_updated",
        object_type="Subscription",
        object_id="subscription-1",
    )
    client = login_as(api_client, platform_admin)

    response = client.get("/api/v1/platform/audit/")

    assert response.status_code == 200
    actions = [row["action"] for row in response.data["results"]]
    assert "platform.subscription_updated" in actions
    assert "assessment.created" not in actions


def test_platform_audit_excludes_unscoped_tenant_data(api_client):
    tenant = TenantFactory(status=Tenant.Status.ACTIVE)
    owner = UserFactory(tenant=tenant, role=User.Role.OWNER)
    AuditLog.objects.create(
        tenant=tenant,
        actor=owner,
        action="user.created",
        object_type="User",
        object_id=str(owner.id),
    )
    client = login_as(api_client, _platform_admin())

    response = client.get("/api/v1/platform/audit/")

    assert response.status_code == 200
    actions = [row["action"] for row in response.data["results"]]
    assert "user.created" not in actions
