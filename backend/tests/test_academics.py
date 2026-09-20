import pytest
from django.db import IntegrityError, transaction

from apps.academics.models import AcademicYear, Subject

from .conftest import login_as
from .factories import TenantFactory, UserFactory

pytestmark = pytest.mark.django_db


def test_two_tenants_can_each_have_a_subject_with_the_same_name():
    """Uniqueness is per-tenant, not global — two different tutoring
    centers can both have a 'Biology' subject."""
    tenant_a, tenant_b = TenantFactory(), TenantFactory()
    Subject.objects.create(tenant=tenant_a, name="Biology")
    Subject.objects.create(tenant=tenant_b, name="Biology")  # must not raise
    assert Subject.objects.for_tenant(tenant_a).count() == 1
    assert Subject.objects.for_tenant(tenant_b).count() == 1


def test_duplicate_subject_name_within_same_tenant_is_rejected():
    tenant = TenantFactory()
    Subject.objects.create(tenant=tenant, name="Biology")
    with pytest.raises(IntegrityError), transaction.atomic():
        Subject.objects.create(tenant=tenant, name="Biology")


def test_academic_year_end_date_must_be_after_start_date():
    tenant = TenantFactory()
    with pytest.raises(IntegrityError), transaction.atomic():
        AcademicYear.objects.create(
            tenant=tenant, name="Broken", start_date="2026-09-01", end_date="2026-08-01"
        )


def test_owner_can_create_and_read_back_an_academic_year(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    resp = client.post(
        "/api/v1/academic-years/",
        {"name": "2026/2027", "start_date": "2026-09-01", "end_date": "2027-06-30"},
        format="json",
    )
    assert resp.status_code == 201, resp.data

    resp = client.get(f"/api/v1/academic-years/{resp.data['id']}/")
    assert resp.status_code == 200
    assert resp.data["name"] == "2026/2027"
