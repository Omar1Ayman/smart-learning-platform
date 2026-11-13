"""spec #25: Preview -> Validation -> Confirmation -> Atomic Transaction."""

import pytest

from apps.people.models import Enrollment

from .conftest import login_as
from .factories import AcademicYearFactory, EnrollmentFactory, GroupFactory, UserFactory

pytestmark = pytest.mark.django_db


def _promote(client, target_year, items, dry_run=False):
    return client.post(
        "/api/v1/enrollments/promote/",
        {
            "target_academic_year": str(target_year.id),
            "dry_run": dry_run,
            "items": items,
        },
        format="json",
    )


def test_dry_run_validates_but_creates_nothing(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    enrollment = EnrollmentFactory(group=group, tenant=group.tenant, academic_year=group.academic_year)
    target_year = AcademicYearFactory(tenant=group.tenant, name="Next Year")
    group.academic_year.activate()
    target_year.activate()
    target_group = GroupFactory(grade=group.grade, academic_year=target_year, tenant=group.tenant)

    client = login_as(api_client, owner)
    before_count = Enrollment.objects.count()
    resp = _promote(
        client,
        target_year,
        [{"enrollment": str(enrollment.id), "action": "PROMOTE", "target_group": str(target_group.id)}],
        dry_run=True,
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["dry_run"] is True
    assert Enrollment.objects.count() == before_count  # nothing written


def test_promote_creates_new_enrollment_and_keeps_the_old_one(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    enrollment = EnrollmentFactory(group=group, tenant=group.tenant, academic_year=group.academic_year)
    target_year = AcademicYearFactory(tenant=group.tenant, name="Next Year")
    group.academic_year.activate()
    target_year.activate()
    target_group = GroupFactory(grade=group.grade, academic_year=target_year, tenant=group.tenant)

    client = login_as(api_client, owner)
    resp = _promote(
        client,
        target_year,
        [{"enrollment": str(enrollment.id), "action": "PROMOTE", "target_group": str(target_group.id)}],
    )
    assert resp.status_code == 201, resp.data

    enrollment.refresh_from_db()
    assert enrollment.status == Enrollment.Status.COMPLETED
    new_id = resp.data["results"][0]["new_enrollment"]
    new_enrollment = Enrollment.objects.get(id=new_id)
    assert new_enrollment.academic_year_id == target_year.id
    assert new_enrollment.student_id == enrollment.student_id


def test_retrying_promotion_does_not_create_a_duplicate_enrollment(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    enrollment = EnrollmentFactory(
        group=group, tenant=group.tenant, academic_year=group.academic_year
    )
    target_year = AcademicYearFactory(tenant=group.tenant, name="Next Year")
    group.academic_year.activate()
    target_year.activate()
    target_group = GroupFactory(
        grade=group.grade,
        academic_year=target_year,
        tenant=group.tenant,
    )
    client = login_as(api_client, owner)
    items = [
        {
            "enrollment": str(enrollment.id),
            "action": "PROMOTE",
            "target_group": str(target_group.id),
        }
    ]

    first = _promote(client, target_year, items)
    enrollment_count_after_first = Enrollment.objects.count()
    retry = _promote(client, target_year, items)

    assert first.status_code == 201, first.data
    assert retry.status_code == 400
    assert Enrollment.objects.count() == enrollment_count_after_first
    enrollment.refresh_from_db()
    assert enrollment.status == Enrollment.Status.COMPLETED


def test_graduate_marks_status_without_creating_a_new_enrollment(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    enrollment = EnrollmentFactory(group=group, tenant=group.tenant, academic_year=group.academic_year)
    target_year = AcademicYearFactory(tenant=group.tenant, name="Next Year")
    group.academic_year.activate()
    target_year.activate()

    client = login_as(api_client, owner)
    before_count = Enrollment.objects.count()
    resp = _promote(client, target_year, [{"enrollment": str(enrollment.id), "action": "GRADUATE"}])
    assert resp.status_code == 201, resp.data

    enrollment.refresh_from_db()
    assert enrollment.status == Enrollment.Status.GRADUATED
    assert Enrollment.objects.count() == before_count  # no new row


def test_transfer_marks_old_enrollment_transferred(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    enrollment = EnrollmentFactory(group=group, tenant=group.tenant, academic_year=group.academic_year)
    target_year = AcademicYearFactory(tenant=group.tenant, name="Next Year")
    group.academic_year.activate()
    target_year.activate()
    target_group = GroupFactory(grade=group.grade, academic_year=target_year, tenant=group.tenant)

    client = login_as(api_client, owner)
    resp = _promote(
        client,
        target_year,
        [{"enrollment": str(enrollment.id), "action": "TRANSFER", "target_group": str(target_group.id)}],
    )
    assert resp.status_code == 201, resp.data
    enrollment.refresh_from_db()
    assert enrollment.status == Enrollment.Status.TRANSFERRED


def test_rejects_when_student_already_has_an_enrollment_in_target_year(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    enrollment = EnrollmentFactory(group=group, tenant=group.tenant, academic_year=group.academic_year)
    target_year = AcademicYearFactory(tenant=group.tenant, name="Next Year")
    group.academic_year.activate()
    target_year.activate()
    target_group = GroupFactory(grade=group.grade, academic_year=target_year, tenant=group.tenant)
    # student already has *some* enrollment in the target year
    EnrollmentFactory(
        student=enrollment.student, group=target_group, tenant=group.tenant, academic_year=target_year
    )

    client = login_as(api_client, owner)
    resp = _promote(
        client,
        target_year,
        [{"enrollment": str(enrollment.id), "action": "PROMOTE", "target_group": str(target_group.id)}],
    )
    assert resp.status_code == 400


def test_one_bad_item_rolls_back_the_whole_batch(api_client):
    """The core atomicity guarantee spec #25 asks for: a batch of two
    promotions where the second is invalid must leave *both* untouched,
    not just skip the bad one."""
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    good_enrollment = EnrollmentFactory(group=group, tenant=group.tenant, academic_year=group.academic_year)
    bad_enrollment = EnrollmentFactory(group=group, tenant=group.tenant, academic_year=group.academic_year)
    target_year = AcademicYearFactory(tenant=group.tenant, name="Next Year")
    group.academic_year.activate()
    target_year.activate()
    target_group = GroupFactory(grade=group.grade, academic_year=target_year, tenant=group.tenant)
    # bad_enrollment's student already has a target-year enrollment -> invalid
    EnrollmentFactory(
        student=bad_enrollment.student, group=target_group, tenant=group.tenant, academic_year=target_year
    )

    client = login_as(api_client, owner)
    before_count = Enrollment.objects.count()
    resp = _promote(
        client,
        target_year,
        [
            {
                "enrollment": str(good_enrollment.id),
                "action": "PROMOTE",
                "target_group": str(target_group.id),
            },
            {"enrollment": str(bad_enrollment.id), "action": "PROMOTE", "target_group": str(target_group.id)},
        ],
    )
    assert resp.status_code == 400
    assert Enrollment.objects.count() == before_count  # nothing committed, not even the good one


def test_student_cannot_call_promote(api_client):
    group = GroupFactory()
    enrollment = EnrollmentFactory(group=group, tenant=group.tenant, academic_year=group.academic_year)
    target_year = AcademicYearFactory(tenant=group.tenant, name="Next Year")
    group.academic_year.activate()
    target_year.activate()

    client = login_as(api_client, enrollment.student)
    resp = _promote(client, target_year, [{"enrollment": str(enrollment.id), "action": "GRADUATE"}])
    assert resp.status_code == 403


def test_promotion_requires_active_target_year(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    enrollment = EnrollmentFactory(
        group=group, tenant=group.tenant, academic_year=group.academic_year
    )
    target_year = AcademicYearFactory(tenant=group.tenant, name="Next Year")
    target_group = GroupFactory(
        grade=group.grade, academic_year=target_year, tenant=group.tenant
    )

    client = login_as(api_client, owner)
    resp = _promote(
        client,
        target_year,
        [
            {
                "enrollment": str(enrollment.id),
                "action": "PROMOTE",
                "target_group": str(target_group.id),
            }
        ],
    )

    assert resp.status_code == 403
    enrollment.refresh_from_db()
    assert enrollment.status == Enrollment.Status.ACTIVE


def test_promotion_cannot_change_archived_source_enrollment(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    enrollment = EnrollmentFactory(
        group=group, tenant=group.tenant, academic_year=group.academic_year
    )
    group.academic_year.activate()
    group.academic_year.close()
    target_year = AcademicYearFactory(tenant=group.tenant, name="Next Year")
    target_year.activate()

    client = login_as(api_client, owner)
    resp = _promote(
        client,
        target_year,
        [{"enrollment": str(enrollment.id), "action": "GRADUATE"}],
    )

    assert resp.status_code == 403
    enrollment.refresh_from_db()
    assert enrollment.status == Enrollment.Status.ACTIVE


def test_promote_marks_old_enrollment_completed(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    enrollment = EnrollmentFactory(group=group, tenant=group.tenant, academic_year=group.academic_year)
    target_year = AcademicYearFactory(tenant=group.tenant, name="Next Year")
    group.academic_year.activate()
    target_year.activate()
    target_group = GroupFactory(grade=group.grade, academic_year=target_year, tenant=group.tenant)

    client = login_as(api_client, owner)
    resp = _promote(
        client,
        target_year,
        [{"enrollment": str(enrollment.id), "action": "PROMOTE", "target_group": str(target_group.id)}],
    )
    assert resp.status_code == 201, resp.data
    enrollment.refresh_from_db()
    assert enrollment.status == Enrollment.Status.COMPLETED


def test_repeat_marks_old_enrollment_completed(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    enrollment = EnrollmentFactory(group=group, tenant=group.tenant, academic_year=group.academic_year)
    target_year = AcademicYearFactory(tenant=group.tenant, name="Next Year")
    group.academic_year.activate()
    target_year.activate()
    target_group = GroupFactory(grade=group.grade, academic_year=target_year, tenant=group.tenant)

    client = login_as(api_client, owner)
    resp = _promote(
        client,
        target_year,
        [{"enrollment": str(enrollment.id), "action": "REPEAT", "target_group": str(target_group.id)}],
    )
    assert resp.status_code == 201, resp.data
    enrollment.refresh_from_db()
    assert enrollment.status == Enrollment.Status.COMPLETED


def test_cannot_promote_an_already_graduated_enrollment(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    enrollment = EnrollmentFactory(group=group, tenant=group.tenant, academic_year=group.academic_year)
    enrollment.status = Enrollment.Status.GRADUATED
    enrollment.save(update_fields=["status"])
    target_year = AcademicYearFactory(tenant=group.tenant, name="Next Year")
    group.academic_year.activate()
    target_year.activate()
    target_group = GroupFactory(grade=group.grade, academic_year=target_year, tenant=group.tenant)

    client = login_as(api_client, owner)
    resp = _promote(
        client,
        target_year,
        [{"enrollment": str(enrollment.id), "action": "PROMOTE", "target_group": str(target_group.id)}],
    )
    assert resp.status_code == 400


def test_cannot_promote_a_suspended_enrollment(api_client):
    group = GroupFactory()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    enrollment = EnrollmentFactory(group=group, tenant=group.tenant, academic_year=group.academic_year)
    enrollment.status = Enrollment.Status.SUSPENDED
    enrollment.save(update_fields=["status"])
    target_year = AcademicYearFactory(tenant=group.tenant, name="Next Year")
    group.academic_year.activate()
    target_year.activate()
    target_group = GroupFactory(grade=group.grade, academic_year=target_year, tenant=group.tenant)

    client = login_as(api_client, owner)
    resp = _promote(
        client,
        target_year,
        [{"enrollment": str(enrollment.id), "action": "PROMOTE", "target_group": str(target_group.id)}],
    )
    assert resp.status_code == 400