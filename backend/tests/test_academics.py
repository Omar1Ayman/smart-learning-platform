from datetime import date

import pytest
from django.db import IntegrityError, transaction

from apps.academics.models import AcademicYear, Subject, Term
from apps.academics.services import prepare_next_year

from .conftest import login_as
from .factories import AcademicYearFactory, TenantFactory, UserFactory

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


def test_activating_prepared_year_closes_the_previous_active_year(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    source_year = AcademicYearFactory(tenant=tenant, name="2025/2026")
    source_year.activate()
    target_year = AcademicYearFactory(tenant=tenant, name="2026/2027")
    client = login_as(api_client, owner)

    response = client.post(
        f"/api/v1/academic-years/{target_year.id}/activate/",
        format="json",
    )

    assert response.status_code == 200, response.data
    assert response.data["status"] == AcademicYear.Status.ACTIVE
    source_year.refresh_from_db()
    assert source_year.status == AcademicYear.Status.CLOSING


def test_prepare_next_year_is_idempotent_after_a_lost_response():
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    source_year = AcademicYearFactory(
        tenant=tenant,
        name="2025/2026",
        start_date=date(2025, 9, 1),
        end_date=date(2026, 6, 30),
    )
    source_year.activate()
    Term.objects.create(
        tenant=tenant,
        academic_year=source_year,
        name="الفصل الأول",
        start_date=date(2025, 9, 1),
        end_date=date(2026, 1, 15),
        order=1,
    )
    data = {
        "name": "2026/2027",
        "start_date": date(2026, 9, 1),
        "end_date": date(2027, 6, 30),
        "copy_terms": True,
        "copy_groups": False,
        "copy_courses": False,
    }

    first = prepare_next_year(source_year, data, user=owner)
    source_year.close(archive=True, by_user=owner)
    retry = prepare_next_year(source_year, data, user=owner)

    assert first["_created"] is True
    assert retry["_created"] is False
    assert retry["new_year_id"] == first["new_year_id"]
    target_year = AcademicYear.objects.get(pk=first["new_year_id"])
    assert target_year.terms.count() == 1
    assert retry["copied"] == {"terms": 1}


def test_prepare_next_endpoint_returns_existing_target_on_retry(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    source_year = AcademicYearFactory(tenant=tenant, name="2025/2026")
    source_year.activate()
    client = login_as(api_client, owner)
    payload = {
        "name": "2026/2027",
        "start_date": "2026-09-01",
        "end_date": "2027-06-30",
        "copy_terms": False,
        "copy_groups": False,
        "copy_courses": False,
    }

    first = client.post(
        f"/api/v1/academic-years/{source_year.id}/prepare-next/",
        payload,
        format="json",
    )
    retry = client.post(
        f"/api/v1/academic-years/{source_year.id}/prepare-next/",
        payload,
        format="json",
    )

    assert first.status_code == 201, first.data
    assert retry.status_code == 200, retry.data
    assert first.data["new_year_id"] == retry.data["new_year_id"]
    assert retry.data["reused_existing"] is True
    assert AcademicYear.objects.filter(rollover_source=source_year).count() == 1


def test_prepare_next_year_reuses_existing_target_for_different_request():
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    source_year = AcademicYearFactory(tenant=tenant, name="2025/2026")
    source_year.activate()
    data = {
        "name": "2026/2027",
        "start_date": date(2026, 9, 1),
        "end_date": date(2027, 6, 30),
        "copy_terms": False,
        "copy_groups": False,
        "copy_courses": False,
    }
    prepare_next_year(source_year, data, user=owner)

    changed_request = {**data, "name": "2027/2028"}
    retry = prepare_next_year(source_year, changed_request, user=owner)

    assert retry["_created"] is False
    assert retry["_request_changed"] is True
    assert retry["new_year_name"] == "2026/2027"
