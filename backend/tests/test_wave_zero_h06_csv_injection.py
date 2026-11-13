"""Wave Zero — H-6: CSV injection escape on export.

Before fix: a `first_name` of `=cmd|'/c calc'!A1` would export literally,
executing as a formula when opened in Excel/Sheets. After fix: any cell
starting with = + - @ TAB CR is prefixed with a single quote, forcing
literal-text interpretation per OWASP guidance.
"""

import io
import zipfile

import pytest

from .conftest import login_as
from .factories import TenantFactory, UserFactory

pytestmark = pytest.mark.django_db


def _extract_export(client):
    resp = client.get("/api/v1/tenant/export/")
    assert resp.status_code == 200, resp
    return zipfile.ZipFile(io.BytesIO(resp.content))


def test_formula_injection_in_first_name_is_escaped(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    UserFactory(
        tenant=tenant,
        role="STUDENT",
        first_name="=cmd|'/c calc'!A1",
        email="attacker@test.com",
    )

    client = login_as(api_client, owner)
    zf = _extract_export(client)
    csv_text = zf.read("users.csv").decode("utf-8-sig")

    # The malicious value must be prefixed with a single quote.
    assert "'=cmd|'/c calc'!A1" in csv_text

    # And no cell anywhere may begin with an unescaped formula prefix.
    for line in csv_text.splitlines():
        for cell in line.split(","):
            if cell.startswith("=") or cell.startswith("+") or cell.startswith("@"):
                pytest.fail(f"Unescaped formula cell: {cell!r}")


def test_normal_values_are_not_modified(api_client):
    """Sanity: ordinary names must not get a spurious leading quote."""
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    UserFactory(
        tenant=tenant,
        role="STUDENT",
        first_name="Ahmed",
        email="ahmed@test.com",
    )

    client = login_as(api_client, owner)
    zf = _extract_export(client)
    csv_text = zf.read("users.csv").decode("utf-8-sig")

    assert "Ahmed" in csv_text
    assert "'Ahmed" not in csv_text
