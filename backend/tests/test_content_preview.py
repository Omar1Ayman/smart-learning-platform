"""Wave D0b-3 — image preview endpoint security + correctness."""

import pytest

from apps.content.models import Content

from .conftest import login_as
from .factories import (
    EnrollmentFactory,
    GroupFactory,
    StudentUserFactory,
    TenantFactory,
    UserFactory,
)
from .file_fixtures import make_png

pytestmark = pytest.mark.django_db


def _make_image_content(tenant, **kwargs):
    """Create an IMAGE Content with a real PNG on disk."""
    import uuid

    from django.core.files.base import ContentFile

    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + b"\x00" * 100
    # Simpler: use the file fixture's raw bytes via SimpleUploadedFile.

    png = make_png()
    content = Content(
        tenant=tenant,
        title=kwargs.pop("title", "Cover"),
        content_type="IMAGE",
        is_published=kwargs.pop("is_published", True),
        **kwargs,
    )
    content.file.save(f"test-{uuid.uuid4()}.png", ContentFile(png.read()), save=False)
    content.save()
    return content


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------


def test_owner_can_preview_image(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    content = _make_image_content(tenant)

    client = login_as(api_client, owner)
    r = client.get(f"/api/v1/content/{content.id}/preview/")
    assert r.status_code == 200
    assert r["Content-Type"] == "image/png"
    assert r["Content-Disposition"].startswith("inline")
    assert "max-age" in r["Cache-Control"]


def test_non_image_content_returns_404(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    content = Content.objects.create(
        tenant=tenant,
        title="A PDF",
        content_type="PDF",
        text_body="",  # not a real PDF — we only care that preview rejects it
    )

    client = login_as(api_client, owner)
    r = client.get(f"/api/v1/content/{content.id}/preview/")
    assert r.status_code == 404


def test_student_sees_preview_of_visible_image(api_client):
    group = GroupFactory()
    tenant = group.tenant
    owner = UserFactory(tenant=tenant, role="OWNER")
    content = _make_image_content(tenant, grade=group.grade)

    student = StudentUserFactory(tenant=tenant)
    EnrollmentFactory(
        tenant=tenant,
        student=student,
        group=group,
        academic_year=group.academic_year,
    )

    client = login_as(api_client, student)
    r = client.get(f"/api/v1/content/{content.id}/preview/")
    assert r.status_code == 200
    assert r["Content-Type"] == "image/png"


def test_student_gets_404_for_out_of_scope_image(api_client):
    """Same visibility rules as download — a student in another grade
    must not be able to fetch the image bytes."""
    group_a = GroupFactory()
    tenant = group_a.tenant
    owner = UserFactory(tenant=tenant, role="OWNER")
    # Image targeted at grade A only
    content = _make_image_content(tenant, grade=group_a.grade)

    # Student in a different grade
    group_b = GroupFactory(tenant=tenant)  # independent grade
    student = StudentUserFactory(tenant=tenant)
    EnrollmentFactory(
        tenant=tenant,
        student=student,
        group=group_b,
        academic_year=group_b.academic_year,
    )

    client = login_as(api_client, student)
    r = client.get(f"/api/v1/content/{content.id}/preview/")
    assert r.status_code == 404


def test_unauthenticated_preview_is_401(api_client):
    tenant = TenantFactory()
    content = _make_image_content(tenant)

    r = api_client.get(f"/api/v1/content/{content.id}/preview/")
    assert r.status_code == 401


def test_preview_returns_404_when_file_missing_on_disk(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    content = _make_image_content(tenant)
    # Delete the underlying file (simulates corrupted storage / manual wipe)
    content.file.delete(save=False)
    content.save(update_fields=["file"])

    client = login_as(api_client, owner)
    r = client.get(f"/api/v1/content/{content.id}/preview/")
    assert r.status_code == 404
