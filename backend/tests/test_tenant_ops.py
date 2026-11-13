"""Wave 24 — data export and bulk student import."""

import io
import zipfile

import pytest

from apps.accounts.models import User
from apps.people.models import Enrollment

from .conftest import enable_pro_features, login_as
from .factories import (
    AcademicYearFactory,
    EnrollmentFactory,
    GroupFactory,
    StudentUserFactory,
    TeacherUserFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


# ============================================================================
# Export
# ============================================================================


def test_owner_can_export_tenant_data(api_client):
    tenant = UserFactory(role="OWNER").tenant
    owner = UserFactory(tenant=tenant, role="OWNER")
    group = GroupFactory(tenant=tenant)
    EnrollmentFactory(tenant=tenant, group=group, academic_year=group.academic_year)

    client = login_as(api_client, owner)
    resp = client.get("/api/v1/tenant/export/")
    assert resp.status_code == 200
    assert resp["Content-Type"] == "application/zip"

    # Extract and inspect
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    names = zf.namelist()
    assert "users.csv" in names
    assert "enrollments.csv" in names
    assert "groups.csv" in names
    assert "README.txt" in names


def test_teacher_cannot_export(api_client):
    teacher = TeacherUserFactory()
    client = login_as(api_client, teacher)
    resp = client.get("/api/v1/tenant/export/")
    assert resp.status_code == 403


def test_student_cannot_export(api_client):
    student = StudentUserFactory()
    client = login_as(api_client, student)
    resp = client.get("/api/v1/tenant/export/")
    assert resp.status_code == 403


def test_export_contains_correct_student_count(api_client):
    tenant = UserFactory(role="OWNER").tenant
    owner = UserFactory(tenant=tenant, role="OWNER")
    for _ in range(3):
        StudentUserFactory(tenant=tenant)

    client = login_as(api_client, owner)
    resp = client.get("/api/v1/tenant/export/")
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    users_csv = zf.read("users.csv").decode("utf-8-sig")
    # 3 students + owner (owner logged in) = 4 lines minimum (header + 4)
    lines = [l for l in users_csv.splitlines() if l.strip()]
    assert len(lines) >= 5  # header + 4 users


# ============================================================================
# Template
# ============================================================================


def test_download_template(api_client):
    owner = UserFactory(role="OWNER")
    client = login_as(api_client, owner)
    resp = client.get("/api/v1/tenant/import/template/")
    assert resp.status_code == 200
    assert b"email" in resp.content
    assert b"first_name" in resp.content


# ============================================================================
# Import
# ============================================================================


def _csv_bytes(rows: list[str]) -> bytes:
    header = "email,first_name,last_name,group_name\n"
    return ("\ufeff" + header + "\n".join(rows)).encode("utf-8")


def test_import_dry_run_returns_preview(api_client):
    tenant = UserFactory(role="OWNER").tenant
    enable_pro_features(tenant)
    owner = UserFactory(tenant=tenant, role="OWNER")
    year = AcademicYearFactory(tenant=tenant)
    group = GroupFactory(tenant=tenant, academic_year=year)

    client = login_as(api_client, owner)
    csv_data = _csv_bytes([
        "s1@test.com,Ahmed,Ali," + group.name,
        "s2@test.com,Fatma,Samir," + group.name,
    ])

    resp = client.post(
        "/api/v1/tenant/import/students/",
        {
            "file": io.BytesIO(csv_data),
            "academic_year": str(year.id),
            "dry_run": "true",
        },
        format="multipart",
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["dry_run"] is True
    assert resp.data["summary"]["valid"] == 2
    assert resp.data["summary"]["errors"] == 0
    # Nothing created
    assert User.objects.filter(email="s1@test.com").count() == 0


def test_import_creates_students_and_enrollments(api_client):
    tenant = UserFactory(role="OWNER").tenant
    enable_pro_features(tenant)
    owner = UserFactory(tenant=tenant, role="OWNER")
    year = AcademicYearFactory(tenant=tenant)
    group = GroupFactory(tenant=tenant, academic_year=year)

    client = login_as(api_client, owner)
    csv_data = _csv_bytes([
        "new1@test.com,Ahmed,Ali," + group.name,
        "new2@test.com,Fatma,Samir," + group.name,
    ])

    resp = client.post(
        "/api/v1/tenant/import/students/",
        {
            "file": io.BytesIO(csv_data),
            "academic_year": str(year.id),
            "dry_run": "false",
        },
        format="multipart",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["result"]["created_students"] == 2
    assert resp.data["result"]["created_enrollments"] == 2
    assert User.objects.filter(email="new1@test.com", role="STUDENT").exists()
    assert Enrollment.objects.filter(student__email="new1@test.com").exists()


def test_import_rejects_when_any_row_has_errors(api_client):
    tenant = UserFactory(role="OWNER").tenant
    enable_pro_features(tenant)
    owner = UserFactory(tenant=tenant, role="OWNER")
    year = AcademicYearFactory(tenant=tenant)
    group = GroupFactory(tenant=tenant, academic_year=year)

    client = login_as(api_client, owner)
    csv_data = _csv_bytes([
        "good@test.com,Good,Row," + group.name,
        "bad,Bad,Row," + group.name,  # invalid email
    ])

    resp = client.post(
        "/api/v1/tenant/import/students/",
        {
            "file": io.BytesIO(csv_data),
            "academic_year": str(year.id),
            "dry_run": "false",
        },
        format="multipart",
    )
    assert resp.status_code == 400
    # Neither created
    assert not User.objects.filter(email="good@test.com").exists()
    assert not User.objects.filter(email="bad").exists()


def test_import_skips_existing_students(api_client):
    tenant = UserFactory(role="OWNER").tenant
    enable_pro_features(tenant)
    owner = UserFactory(tenant=tenant, role="OWNER")
    year = AcademicYearFactory(tenant=tenant)
    group = GroupFactory(tenant=tenant, academic_year=year)
    StudentUserFactory(tenant=tenant, email="existing@test.com")

    client = login_as(api_client, owner)
    csv_data = _csv_bytes([
        "existing@test.com,Ali,Hassan," + group.name,
        "fresh@test.com,New,Student," + group.name,
    ])

    resp = client.post(
        "/api/v1/tenant/import/students/",
        {
            "file": io.BytesIO(csv_data),
            "academic_year": str(year.id),
            "dry_run": "false",
        },
        format="multipart",
    )
    assert resp.status_code == 201
    assert resp.data["result"]["created_students"] == 1  # only "fresh"
    assert resp.data["result"]["skipped"] == 1  # "existing"


def test_import_rejects_unknown_group(api_client):
    tenant = UserFactory(role="OWNER").tenant
    enable_pro_features(tenant)
    owner = UserFactory(tenant=tenant, role="OWNER")
    year = AcademicYearFactory(tenant=tenant)

    client = login_as(api_client, owner)
    csv_data = _csv_bytes(["x@test.com,Ahmed,Ali,Nonexistent Group"])

    resp = client.post(
        "/api/v1/tenant/import/students/",
        {"file": io.BytesIO(csv_data), "academic_year": str(year.id), "dry_run": "true"},
        format="multipart",
    )
    assert resp.status_code == 200
    assert resp.data["summary"]["errors"] == 1
    assert "غير موجودة" in resp.data["rows"][0]["errors"][0]


def test_import_rejects_email_used_in_other_tenant(api_client):
    other_tenant = UserFactory(role="OWNER").tenant
    UserFactory(tenant=other_tenant, email="taken@other.com")

    tenant = UserFactory(role="OWNER").tenant
    enable_pro_features(tenant)
    owner = UserFactory(tenant=tenant, role="OWNER")
    year = AcademicYearFactory(tenant=tenant)
    group = GroupFactory(tenant=tenant, academic_year=year)

    client = login_as(api_client, owner)
    csv_data = _csv_bytes(["taken@other.com,Ahmed,Ali," + group.name])

    resp = client.post(
        "/api/v1/tenant/import/students/",
        {"file": io.BytesIO(csv_data), "academic_year": str(year.id), "dry_run": "true"},
        format="multipart",
    )
    assert resp.status_code == 200
    assert resp.data["summary"]["errors"] == 1
    assert "مؤسسة أخرى" in resp.data["rows"][0]["errors"][0]


def test_import_missing_required_columns_returns_400(api_client):
    tenant = UserFactory(role="OWNER").tenant
    enable_pro_features(tenant)
    owner = UserFactory(tenant=tenant, role="OWNER")
    year = AcademicYearFactory(tenant=tenant)

    client = login_as(api_client, owner)
    bad_csv = ("\ufeff" + "email,first_name\n" + "x@test.com,Ahmed\n").encode("utf-8")

    resp = client.post(
        "/api/v1/tenant/import/students/",
        {"file": io.BytesIO(bad_csv), "academic_year": str(year.id), "dry_run": "true"},
        format="multipart",
    )
    assert resp.status_code == 400