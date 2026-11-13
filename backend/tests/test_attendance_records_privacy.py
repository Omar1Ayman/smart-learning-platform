import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.attendance.models import AttendanceRecord, AttendanceSession

from .conftest import login_as
from .factories import (
    EnrollmentFactory,
    GroupFactory,
    StudentUserFactory,
    TeacherUserFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def _session_with_two_students():
    group = GroupFactory()
    student = StudentUserFactory(tenant=group.tenant, email="student-a@test.example")
    peer = StudentUserFactory(tenant=group.tenant, email="student-b@test.example")
    teacher = TeacherUserFactory(tenant=group.tenant)

    for enrolled_student in (student, peer):
        EnrollmentFactory(
            tenant=group.tenant,
            student=enrolled_student,
            group=group,
            academic_year=group.academic_year,
            status="ACTIVE",
        )

    session = AttendanceSession.objects.create(
        tenant=group.tenant,
        group=group,
        teacher=teacher,
        date=timezone.localdate(),
        start_time="09:00",
        end_time="10:00",
        status=AttendanceSession.Status.OPEN,
    )
    own_record = AttendanceRecord.objects.create(
        tenant=group.tenant,
        session=session,
        student=student,
        status="PRESENT",
        notes="private own note",
    )
    peer_record = AttendanceRecord.objects.create(
        tenant=group.tenant,
        session=session,
        student=peer,
        status="ABSENT",
        notes="private peer note",
    )
    return session, student, peer, teacher, own_record, peer_record


def test_student_attendance_records_include_only_their_safe_record(api_client):
    session, student, peer, _teacher, own_record, _peer_record = _session_with_two_students()
    client = login_as(api_client, student)

    response = client.get(f"/api/v1/attendance/sessions/{session.id}/records/")

    assert response.status_code == 200
    assert len(response.data) == 1
    record = response.data[0]
    assert record["id"] == str(own_record.id)
    assert "student" not in record
    assert "student_email" not in record
    assert "student_name" not in record
    assert "marked_by" not in record
    assert "notes" not in record
    assert str(peer.id) not in str(response.data)
    assert peer.email not in str(response.data)
    assert "private peer note" not in str(response.data)


def test_staff_can_still_read_the_attendance_roster(api_client):
    session, _student, peer, teacher, _own_record, peer_record = _session_with_two_students()
    client = login_as(api_client, teacher)

    response = client.get(f"/api/v1/attendance/sessions/{session.id}/records/")

    assert response.status_code == 200
    assert len(response.data) == 2
    assert any(item["id"] == str(peer_record.id) for item in response.data)
    assert any(str(item["student"]) == str(peer.id) for item in response.data)


def test_parent_cannot_read_attendance_roster(api_client):
    session, _student, _peer, _teacher, _own_record, _peer_record = _session_with_two_students()
    parent = UserFactory(tenant=session.tenant, role=User.Role.PARENT)
    client = login_as(api_client, parent)

    response = client.get(f"/api/v1/attendance/sessions/{session.id}/records/")

    assert response.status_code in {403, 404}
