"""spec #78 — 'Access control' / 'Private/public visibility': the
download action re-runs the full permission chain, it never hands out a
direct file path."""

import pytest
from rest_framework.test import APIClient

from .conftest import login_as
from .factories import EnrollmentFactory, GroupFactory, TenantFactory, UserFactory
from .file_fixtures import make_pdf

pytestmark = pytest.mark.django_db


def _create_content(client, **overrides):
    payload = {"title": "Notes", "content_type": "PDF", "file": make_pdf()}
    payload.update(overrides)
    resp = client.post("/api/v1/content/", payload, format="multipart")
    assert resp.status_code == 201, resp.data
    return resp.data["id"]


def test_owner_can_download_a_file_they_uploaded(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)
    content_id = _create_content(client)

    resp = client.get(f"/api/v1/content/{content_id}/download/")
    assert resp.status_code == 200
    assert resp["Content-Disposition"].startswith("attachment;")


def test_student_outside_eligibility_gets_404_on_download(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)
    group = GroupFactory(tenant=tenant)
    content_id = _create_content(client, group=str(group.id))

    other_group = GroupFactory(tenant=tenant, grade=group.grade)
    student = UserFactory(tenant=tenant, role="STUDENT")
    EnrollmentFactory(
        tenant=tenant, student=student, group=other_group, academic_year=other_group.academic_year
    )

    student_client = login_as(APIClient(), student)
    resp = student_client.get(f"/api/v1/content/{content_id}/download/")
    assert resp.status_code == 404


def test_eligible_student_can_download(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)
    group = GroupFactory(tenant=tenant)
    content_id = _create_content(client, group=str(group.id))

    student = UserFactory(tenant=tenant, role="STUDENT")
    EnrollmentFactory(tenant=tenant, student=student, group=group, academic_year=group.academic_year)

    student_client = login_as(APIClient(), student)
    resp = student_client.get(f"/api/v1/content/{content_id}/download/")
    assert resp.status_code == 200


def test_unauthenticated_request_cannot_download(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)
    content_id = _create_content(client)

    anon = APIClient()
    resp = anon.get(f"/api/v1/content/{content_id}/download/")
    assert resp.status_code == 401


def test_external_link_download_returns_the_url_not_a_file(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/content/",
        {"title": "Link", "content_type": "EXTERNAL_LINK", "external_url": "https://example.com/video"},
        format="json",
    )
    content_id = resp.data["id"]

    resp = client.get(f"/api/v1/content/{content_id}/download/")
    assert resp.status_code == 200
    assert resp.data["external_url"] == "https://example.com/video"
