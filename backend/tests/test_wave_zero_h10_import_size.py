"""Wave Zero — H-10: import file size cap.

Before fix: openpyxl loaded the whole file into memory regardless of
size. A 500 MB xlsx could OOM the worker. After fix: the view checks
upload.size BEFORE reading, rejecting anything over 10 MB.

Note on Django's own limit: DATA_UPLOAD_MAX_MEMORY_SIZE (default 2.5 MB)
would reject large uploads BEFORE the view runs, so for this test to
exercise the CUSTOM check (not Django's default), we raise that limit
via @override_settings. In production, the custom check is
defense-in-depth on top of Django's own gate.
"""
import io

import pytest
from django.test import override_settings

from .conftest import enable_pro_features, login_as
from .factories import AcademicYearFactory, TenantFactory, UserFactory

pytestmark = pytest.mark.django_db


@override_settings(DATA_UPLOAD_MAX_MEMORY_SIZE=20 * 1024 * 1024)
def test_oversized_import_file_is_rejected(api_client):
    """An 11 MB upload must be rejected with a clear size error."""
    tenant = TenantFactory()
    enable_pro_features(tenant)
    owner = UserFactory(tenant=tenant, role="OWNER")
    year = AcademicYearFactory(tenant=tenant)

    # 11 MB CSV-shaped payload — well over the 10 MB custom cap.
    payload = b"email,first_name,last_name,group_name\n" + b"x" * (11 * 1024 * 1024)
    upload = io.BytesIO(payload)
    upload.name = "huge.csv"

    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/tenant/import/students/",
        {
            "file": upload,
            "academic_year": str(year.id),
            "dry_run": "true",
        },
        format="multipart",
    )

    assert resp.status_code == 400
    detail = str(resp.data)
    assert "حجم" in detail or "يتجاوز" in detail


@override_settings(DATA_UPLOAD_MAX_MEMORY_SIZE=20 * 1024 * 1024)
def test_small_import_file_passes_size_check(api_client):
    """Sanity: a well-under-cap file is rejected for OTHER reasons
    (empty / missing headers), not for size."""
    tenant = TenantFactory()
    enable_pro_features(tenant)
    owner = UserFactory(tenant=tenant, role="OWNER")
    year = AcademicYearFactory(tenant=tenant)

    upload = io.BytesIO(b"email,first_name,last_name,group_name\n")  # header only
    upload.name = "tiny.csv"

    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/tenant/import/students/",
        {
            "file": upload,
            "academic_year": str(year.id),
            "dry_run": "true",
        },
        format="multipart",
    )

    assert resp.status_code == 400
    assert "حجم" not in str(resp.data)  # size cap was NOT triggered