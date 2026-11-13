"""Wave D1b — bulk curriculum import regression tests."""

import io

import pytest

from apps.academics.models import (
    AcademicYear,
    Chapter,
    Course,
    Grade,
    Lesson,
    Stage,
    Subject,
)

from .conftest import enable_pro_features, login_as
from .factories import (
    AcademicYearFactory,
    TenantFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


HEADER = (
    "academic_year,stage,grade,subject,course,chapter,chapter_order,"
    "lesson,lesson_order\n"
)


def _csv(*rows: str) -> bytes:
    return ("\ufeff" + HEADER + "\n".join(rows)).encode("utf-8")


def _upload(client, content: bytes, dry_run: bool = True):
    return client.post(
        "/api/v1/courses/import/",
        {
            "file": io.BytesIO(content),
            "dry_run": "true" if dry_run else "false",
        },
        format="multipart",
    )


# ---------------------------------------------------------------------------
# Template
# ---------------------------------------------------------------------------


def test_template_downloads_xlsx(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    r = client.get("/api/v1/courses/import_template/")
    assert r.status_code == 200
    assert "spreadsheetml" in r["Content-Type"]
    assert r.content[:4] == b"PK\x03\x04"


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def test_dry_run_validates_and_reports_will_create(api_client):
    tenant = TenantFactory()
    enable_pro_features(tenant)
    year = AcademicYearFactory(tenant=tenant, name="2025/2026")
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    csv = _csv(
        "2025/2026,الثانوية,أولى ثانوي,رياضيات,رياضيات,الجبر,1,المعادلات,1",
        "2025/2026,الثانوية,أولى ثانوي,رياضيات,رياضيات,الجبر,1,المتباينات,2",
        "2025/2026,الثانوية,أولى ثانوي,أحياء,أحياء,الخلية,1,تركيب,1",
    )
    r = _upload(client, csv, dry_run=True)
    assert r.status_code == 200, r.data
    assert r.data["summary"]["valid"] == 3
    assert r.data["summary"]["errors"] == 0
    # 1 stage, 1 grade, 2 subjects, 2 courses, 2 chapters, 3 lessons
    wc = r.data["will_create"]
    assert wc["stages"] == 1
    assert wc["grades"] == 1
    assert wc["subjects"] == 2
    assert wc["courses"] == 2
    assert wc["chapters"] == 2  # same "الجبر" reused
    assert wc["lessons"] == 3
    # Nothing created yet.
    assert Stage.objects.count() == 0
    assert Course.objects.count() == 0


def test_dry_run_reports_missing_year_as_error(api_client):
    tenant = TenantFactory()
    enable_pro_features(tenant)
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    csv = _csv(
        "9999/8888,الثانوية,أولى ثانوي,رياضيات,رياضيات,الجبر,1,المعادلات,1"
    )
    r = _upload(client, csv, dry_run=True)
    assert r.status_code == 200
    assert r.data["summary"]["errors"] == 1
    assert "غير موجودة" in str(r.data["rows"][0]["errors"])


def test_dry_run_detects_duplicate_paths_in_file(api_client):
    tenant = TenantFactory()
    enable_pro_features(tenant)
    AcademicYearFactory(tenant=tenant, name="2025/2026")
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    csv = _csv(
        "2025/2026,الثانوية,أولى ثانوي,رياضيات,رياضيات,الجبر,1,المعادلات,1",
        "2025/2026,الثانوية,أولى ثانوي,رياضيات,رياضيات,الجبر,1,المعادلات,1",
    )
    r = _upload(client, csv, dry_run=True)
    assert r.status_code == 200
    assert r.data["summary"]["valid"] == 1
    assert r.data["summary"]["skip"] == 1


# ---------------------------------------------------------------------------
# Commit
# ---------------------------------------------------------------------------


def test_commit_creates_full_hierarchy(api_client):
    tenant = TenantFactory()
    enable_pro_features(tenant)
    AcademicYearFactory(tenant=tenant, name="2025/2026")
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    csv = _csv(
        "2025/2026,الثانوية,أولى ثانوي,رياضيات,رياضيات,الجبر,1,المعادلات,1",
        "2025/2026,الثانوية,أولى ثانوي,رياضيات,رياضيات,الجبر,1,المتباينات,2",
        "2025/2026,الثانوية,أولى ثانوي,أحياء,أحياء,الخلية,1,تركيب,1",
    )
    r = _upload(client, csv, dry_run=False)
    assert r.status_code == 201, r.data
    res = r.data["result"]
    assert res["created_stages"] == 1
    assert res["created_grades"] == 1
    assert res["created_subjects"] == 2
    assert res["created_courses"] == 2
    assert res["created_chapters"] == 2
    assert res["created_lessons"] == 3
    assert Stage.objects.count() == 1
    assert Course.objects.count() == 2
    assert Lesson.objects.count() == 3


def test_commit_reuses_existing_stage(api_client):
    tenant = TenantFactory()
    enable_pro_features(tenant)
    AcademicYearFactory(tenant=tenant, name="2025/2026")
    Stage.objects.create(tenant=tenant, name="الثانوية")
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    csv = _csv("2025/2026,الثانوية,أولى ثانوي,رياضيات,رياضيات,الجبر,1,,1")
    r = _upload(client, csv, dry_run=False)
    assert r.status_code == 201
    assert r.data["result"]["created_stages"] == 0
    assert r.data["result"]["created_grades"] == 1
    assert Stage.objects.count() == 1


def test_commit_with_empty_lesson_creates_chapter_only(api_client):
    tenant = TenantFactory()
    enable_pro_features(tenant)
    AcademicYearFactory(tenant=tenant, name="2025/2026")
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    csv = _csv("2025/2026,الثانوية,أولى ثانوي,رياضيات,رياضيات,الجبر,1,,")
    r = _upload(client, csv, dry_run=False)
    assert r.status_code == 201
    assert r.data["result"]["created_chapters"] == 1
    assert r.data["result"]["created_lessons"] == 0
    assert Chapter.objects.count() == 1
    assert Lesson.objects.count() == 0


def test_commit_rejects_on_any_error(api_client):
    tenant = TenantFactory()
    enable_pro_features(tenant)
    AcademicYearFactory(tenant=tenant, name="2025/2026")
    owner = UserFactory(tenant=tenant, role="OWNER")
    client = login_as(api_client, owner)

    csv = _csv(
        "2025/2026,الثانوية,أولى ثانوي,رياضيات,رياضيات,الجبر,1,,1",
        "9999/8888,الثانوية,ثانية ثانوي,رياضيات,رياضيات,الهندسة,1,,1",
    )
    r = _upload(client, csv, dry_run=False)
    assert r.status_code == 400
    # Nothing partially committed.
    assert Stage.objects.count() == 0


# ---------------------------------------------------------------------------
# Access control
# ---------------------------------------------------------------------------


def test_teacher_cannot_import_curriculum(api_client):
    from .factories import TeacherUserFactory

    tenant = TenantFactory()
    AcademicYearFactory(tenant=tenant, name="2025/2026")
    teacher = TeacherUserFactory(tenant=tenant)
    client = login_as(api_client, teacher)

    csv = _csv("2025/2026,الثانوية,أولى ثانوي,رياضيات,رياضيات,الجبر,1,,1")
    r = _upload(client, csv, dry_run=True)
    assert r.status_code == 403


def test_student_cannot_import(api_client):
    tenant = TenantFactory()
    AcademicYearFactory(tenant=tenant, name="2025/2026")
    student = UserFactory(tenant=tenant, role="STUDENT")
    client = login_as(api_client, student)

    csv = _csv("2025/2026,الثانوية,أولى ثانوي,رياضيات,رياضيات,الجبر,1,,1")
    r = _upload(client, csv, dry_run=True)
    assert r.status_code == 403