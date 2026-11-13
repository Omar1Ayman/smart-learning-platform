"""F-03 regression: UserUpdateSerializer must persist parent contact
fields on STUDENT rows, and reject them on staff rows."""

import pytest

from .conftest import login_as
from .factories import StudentUserFactory, TeacherUserFactory, UserFactory

pytestmark = pytest.mark.django_db


def test_admin_can_update_student_parent_email(api_client):
    tenant = UserFactory(role="OWNER").tenant
    owner = UserFactory(tenant=tenant, role="OWNER")
    student = StudentUserFactory(tenant=tenant)

    client = login_as(api_client, owner)
    r = client.patch(
        f"/api/v1/users/{student.id}/",
        {"parent_email": "parent@example.test", "parent_name": "أحمد"},
        format="json",
    )
    assert r.status_code == 200, r.data
    student.refresh_from_db()
    assert student.parent_email == "parent@example.test"
    assert student.parent_name == "أحمد"


def test_admin_cannot_update_staff_parent_fields(api_client):
    tenant = UserFactory(role="OWNER").tenant
    owner = UserFactory(tenant=tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=tenant)

    client = login_as(api_client, owner)
    r = client.patch(
        f"/api/v1/users/{teacher.id}/",
        {"parent_email": "should-not-persist@example.test"},
        format="json",
    )
    assert r.status_code == 400
    teacher.refresh_from_db()
    assert teacher.parent_email == ""  # unchanged
