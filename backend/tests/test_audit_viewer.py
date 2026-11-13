"""Wave 23 — audit log viewer for OWNER/ADMIN."""

import pytest

from apps.audit.models import AuditLog

from .conftest import login_as
from .factories import TeacherUserFactory, TenantFactory, UserFactory

pytestmark = pytest.mark.django_db


def test_owner_can_list_audit_logs(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    AuditLog.objects.create(tenant=tenant, actor=owner, action="user.logged_in", object_type="User")
    client = login_as(api_client, owner)
    r = client.get("/api/v1/audit-logs/")
    assert r.status_code == 200
    assert r.data["count"] >= 1


def test_teacher_cannot_access_audit_logs(api_client):
    tenant = TenantFactory()
    teacher = TeacherUserFactory(tenant=tenant)
    client = login_as(api_client, teacher)
    r = client.get("/api/v1/audit-logs/")
    assert r.status_code == 403


def test_filter_by_action_prefix(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    AuditLog.objects.create(tenant=tenant, actor=owner, action="user.logged_in")
    AuditLog.objects.create(tenant=tenant, actor=owner, action="content.created")
    client = login_as(api_client, owner)

    r = client.get("/api/v1/audit-logs/?action=user.")
    assert r.status_code == 200
    actions = {row["action"] for row in r.data["results"]}
    assert "user.logged_in" in actions
    assert "content.created" not in actions


def test_cannot_see_other_tenant_audit_logs(api_client):
    """owner_a logs in (creating an audit log in tenant_a). The API must
    return ONLY tenant_a's logs — the tenant_b log must not appear even
    though it exists in the DB.

    Note: we can't assert count == 0 because login_as creates a legitimate
    audit log in tenant_a. The real assertion is "tenant_b's row is not in
    the response".
    """
    tenant_a = TenantFactory()
    tenant_b = TenantFactory()
    owner_a = UserFactory(tenant=tenant_a, role="OWNER")

    # Create a marker audit log in tenant_b that must NEVER appear
    foreign_log = AuditLog.objects.create(
        tenant=tenant_b, action="user.logged_in", object_type="ForeignRowMarker"
    )

    client = login_as(api_client, owner_a)
    r = client.get("/api/v1/audit-logs/")
    assert r.status_code == 200

    # The response must not contain tenant_b's log
    ids = {row["id"] for row in r.data["results"]}
    assert str(foreign_log.id) not in ids

    # And every returned row must belong to tenant_a
    for row in r.data["results"]:
        assert row["object_type"] != "ForeignRowMarker"
