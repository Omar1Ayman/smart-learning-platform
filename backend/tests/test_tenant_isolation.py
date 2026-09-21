"""
Mandatory per spec #71/#72: prove Tenant A can never reach Tenant B's data,
prove role checks hold, and prove a client-supplied tenant id is ignored
rather than trusted. These run against a real PostgreSQL database (see
README.md), not sqlite, because the constraints being tested
(UniqueConstraint scoped per tenant, CheckConstraint) are exactly the kind
of thing that can behave differently across engines.
"""

import pytest

from apps.academics.models import AcademicYear
from apps.accounts.models import User

from .conftest import login_as
from .factories import AcademicYearFactory, TenantFactory, UserFactory

pytestmark = pytest.mark.django_db


def test_admin_cannot_retrieve_another_tenants_academic_year(api_client):
    tenant_a = TenantFactory()
    tenant_b = TenantFactory()
    admin_a = UserFactory(tenant=tenant_a, role=User.Role.OWNER)
    year_b = AcademicYearFactory(tenant=tenant_b)

    client = login_as(api_client, admin_a)
    resp = client.get(f"/api/v1/academic-years/{year_b.id}/")
    assert resp.status_code in (403, 404)


def test_another_tenants_object_never_appears_in_list(api_client):
    tenant_a = TenantFactory()
    tenant_b = TenantFactory()
    admin_a = UserFactory(tenant=tenant_a, role=User.Role.OWNER)
    year_a = AcademicYearFactory(tenant=tenant_a, name="2026/2027")
    year_b = AcademicYearFactory(tenant=tenant_b, name="2099/2100")

    client = login_as(api_client, admin_a)
    resp = client.get("/api/v1/academic-years/")
    assert resp.status_code == 200
    ids = [row["id"] for row in resp.data["results"]]
    assert str(year_a.id) in ids
    assert str(year_b.id) not in ids


def test_admin_cannot_update_or_delete_another_tenants_object(api_client):
    tenant_a = TenantFactory()
    tenant_b = TenantFactory()
    admin_a = UserFactory(tenant=tenant_a, role=User.Role.OWNER)
    year_b = AcademicYearFactory(tenant=tenant_b)

    client = login_as(api_client, admin_a)
    resp = client.patch(f"/api/v1/academic-years/{year_b.id}/", {"name": "Hijacked"}, format="json")
    assert resp.status_code in (403, 404)

    resp = client.delete(f"/api/v1/academic-years/{year_b.id}/")
    assert resp.status_code in (403, 404)
    assert AcademicYear.objects.filter(id=year_b.id).exists()


def test_client_supplied_tenant_field_is_ignored_on_create(api_client):
    """The most literal test of spec #98: 'tenant_id from the frontend —
    don't trust it.' Even if a request body tries to smuggle a foreign
    tenant id in, the object must land in the *caller's own* tenant."""
    tenant_a = TenantFactory()
    tenant_b = TenantFactory()
    admin_a = UserFactory(tenant=tenant_a, role=User.Role.OWNER)

    client = login_as(api_client, admin_a)
    resp = client.post(
        "/api/v1/academic-years/",
        {
            "name": "2026/2027",
            "start_date": "2026-09-01",
            "end_date": "2027-06-30",
            "tenant": str(tenant_b.id),  # attempted smuggling
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    created = AcademicYear.objects.get(id=resp.data["id"])
    assert created.tenant_id == tenant_a.id
    assert created.tenant_id != tenant_b.id


def test_student_cannot_create_academic_year(api_client):
    tenant = TenantFactory()
    student = UserFactory(tenant=tenant, role=User.Role.STUDENT)

    client = login_as(api_client, student)
    resp = client.post(
        "/api/v1/academic-years/",
        {"name": "2026/2027", "start_date": "2026-09-01", "end_date": "2027-06-30"},
        format="json",
    )
    assert resp.status_code == 403


def test_student_can_still_read_academic_years_in_own_tenant(api_client):
    tenant = TenantFactory()
    student = UserFactory(tenant=tenant, role=User.Role.STUDENT)
    AcademicYearFactory(tenant=tenant)

    client = login_as(api_client, student)
    resp = client.get("/api/v1/academic-years/")
    assert resp.status_code == 200
    assert resp.data["count"] == 1


def test_term_cannot_be_linked_to_another_tenants_academic_year(api_client):
    """Layer 5 of the enforcement chain: relationship permission. A Term
    in Tenant A must not be attachable to an AcademicYear that belongs to
    Tenant B, even by id."""
    tenant_a = TenantFactory()
    tenant_b = TenantFactory()
    admin_a = UserFactory(tenant=tenant_a, role=User.Role.OWNER)
    year_b = AcademicYearFactory(tenant=tenant_b)

    client = login_as(api_client, admin_a)
    resp = client.post(
        "/api/v1/terms/",
        {
            "academic_year": str(year_b.id),
            "name": "Term 1",
            "start_date": "2026-09-01",
            "end_date": "2027-01-31",
            "order": 1,
        },
        format="json",
    )
    assert resp.status_code == 400  # not a valid choice for this tenant's request


def test_user_with_no_tenant_membership_is_denied(api_client):
    """A platform-admin-style user with no tenant at all must not be
    treated as a member of every tenant by omission."""
    orphan = User.objects.create_user(
        email="orphan@example.test", password="TestPass123!", is_platform_admin=True
    )
    client = login_as(api_client, orphan)
    resp = client.get("/api/v1/academic-years/")
    assert resp.status_code == 403
