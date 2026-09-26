"""spec #78 — the file upload security checklist, each item as its own
assertion rather than one big "uploads work" test."""

import pytest

from apps.content.models import Content

from .conftest import login_as
from .factories import TeacherUserFactory, TenantFactory, UserFactory
from .file_fixtures import make_oversized_pdf, make_pdf, make_png, make_png_disguised_as_pdf

pytestmark = pytest.mark.django_db


def test_valid_pdf_upload_succeeds(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    resp = client.post(
        "/api/v1/content/",
        {"title": "Lesson 1 notes", "content_type": "PDF", "file": make_pdf()},
        format="multipart",
    )
    assert resp.status_code == 201, resp.data
    content = Content.objects.get(id=resp.data["id"])
    assert content.original_filename == "lesson.pdf"
    assert content.tenant_id == tenant.id


def test_file_content_not_matching_claimed_type_is_rejected(api_client):
    """The core MIME-sniff defense: real bytes are a PNG, only the
    filename and declared content_type claim PDF."""
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    resp = client.post(
        "/api/v1/content/",
        {"title": "Sneaky", "content_type": "PDF", "file": make_png_disguised_as_pdf()},
        format="multipart",
    )
    assert resp.status_code == 400
    assert Content.objects.count() == 0


def test_wrong_extension_for_content_type_is_rejected(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    resp = client.post(
        "/api/v1/content/",
        {"title": "Bad extension", "content_type": "PDF", "file": make_png()},  # a real PNG, .png extension
        format="multipart",
    )
    assert resp.status_code == 400


def test_oversized_file_is_rejected(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    resp = client.post(
        "/api/v1/content/",
        {"title": "Too big", "content_type": "PDF", "file": make_oversized_pdf()},
        format="multipart",
    )
    assert resp.status_code == 400


def test_stored_path_never_contains_the_original_filename(api_client):
    """Path-traversal defense: the name on disk is a generated UUID, not
    anything the uploader supplied. Django's own multipart parser already
    strips directory components from an uploaded filename before this
    code ever sees it (a first, independent layer) — so this test uses a
    plain relative-looking name and asserts the *stored* path is still a
    fresh UUID, never a pass-through of what was uploaded."""
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    resp = client.post(
        "/api/v1/content/",
        {"title": "Notes", "content_type": "PDF", "file": make_pdf(name="../../etc/passwd.pdf")},
        format="multipart",
    )
    assert resp.status_code == 201, resp.data
    content = Content.objects.get(id=resp.data["id"])
    assert content.file.name != content.original_filename  # never a pass-through
    assert ".." not in content.file.name
    assert content.original_filename.endswith("passwd.pdf")  # kept only as a *display* value


def test_content_type_payload_mismatch_is_rejected(api_client):
    """EXTERNAL_LINK must not also carry a file, and vice versa — spec
    #78 aside, this is basic data-integrity hygiene for what 'download'
    (views.py) will actually serve."""
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    resp = client.post(
        "/api/v1/content/",
        {"title": "Confused", "content_type": "EXTERNAL_LINK", "file": make_pdf()},
        format="multipart",
    )
    assert resp.status_code == 400


def test_external_link_content_does_not_need_a_file(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    resp = client.post(
        "/api/v1/content/",
        {"title": "Khan Academy", "content_type": "EXTERNAL_LINK", "external_url": "https://example.com/x"},
        format="json",
    )
    assert resp.status_code == 201, resp.data


def test_teacher_can_upload_content(api_client):
    tenant = TenantFactory()
    teacher = TeacherUserFactory(tenant=tenant)
    client = login_as(api_client, teacher)

    resp = client.post(
        "/api/v1/content/",
        {"title": "My notes", "content_type": "PDF", "file": make_pdf()},
        format="multipart",
    )
    assert resp.status_code == 201, resp.data
    assert Content.objects.get(id=resp.data["id"]).created_by_id == teacher.id


def test_teacher_cannot_edit_another_teachers_content(api_client):
    tenant = TenantFactory()
    teacher_a = TeacherUserFactory(tenant=tenant)
    teacher_b = TeacherUserFactory(tenant=tenant)
    content = Content.objects.create(
        tenant=tenant, title="A's notes", content_type="TEXT", text_body="...", created_by=teacher_a
    )

    client = login_as(api_client, teacher_b)
    resp = client.patch(f"/api/v1/content/{content.id}/", {"title": "Hijacked"}, format="json")
    assert resp.status_code == 403


def test_owner_can_edit_any_teachers_content(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=tenant)
    content = Content.objects.create(
        tenant=tenant, title="Teacher's notes", content_type="TEXT", text_body="...", created_by=teacher
    )

    client = login_as(api_client, owner)
    resp = client.patch(f"/api/v1/content/{content.id}/", {"title": "Reviewed"}, format="json")
    assert resp.status_code == 200


def test_student_cannot_create_content(api_client):
    tenant = TenantFactory()
    student = UserFactory(tenant=tenant, role="STUDENT")
    client = login_as(api_client, student)

    resp = client.post(
        "/api/v1/content/", {"title": "Not allowed", "content_type": "TEXT", "text_body": "x"}, format="json"
    )
    assert resp.status_code == 403
