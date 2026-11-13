import pytest

from apps.assessments.models import AssessmentTarget
from apps.assessments.services import estimate_reach

from .factories import (
    AssessmentFactory,
    EnrollmentFactory,
    GroupFactory,
    StudentUserFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def _enroll(group):
    s = StudentUserFactory(tenant=group.tenant)
    EnrollmentFactory(
        tenant=group.tenant, student=s, group=group, academic_year=group.academic_year
    )
    return s


def test_no_targets_zero():
    a = AssessmentFactory()
    assert estimate_reach(a) == 0


def test_tenant_target_counts_all_enrolled():
    group = GroupFactory()
    s1 = _enroll(group)
    s2 = _enroll(group)
    a = AssessmentFactory(tenant=group.tenant)
    AssessmentTarget.objects.create(tenant=group.tenant, assessment=a, target_type="TENANT")
    assert estimate_reach(a) == 2


def test_grade_target_counts_only_that_grade():
    group_a = GroupFactory()
    group_b = GroupFactory(tenant=group_a.tenant)  # different grade
    _enroll(group_a)
    _enroll(group_b)
    a = AssessmentFactory(tenant=group_a.tenant)
    AssessmentTarget.objects.create(
        tenant=group_a.tenant, assessment=a, target_type="GRADE", grade=group_a.grade
    )
    assert estimate_reach(a) == 1


def test_group_target_counts_only_that_group():
    group_a = GroupFactory()
    group_b = GroupFactory(
        grade=group_a.grade, academic_year=group_a.academic_year, tenant=group_a.tenant
    )
    _enroll(group_a)
    _enroll(group_b)
    a = AssessmentFactory(tenant=group_a.tenant)
    AssessmentTarget.objects.create(
        tenant=group_a.tenant, assessment=a, target_type="GROUP", group=group_a
    )
    assert estimate_reach(a) == 1


def test_student_dup_in_multiple_targets_counted_once():
    group_a = GroupFactory()
    s = _enroll(group_a)
    a = AssessmentFactory(tenant=group_a.tenant)
    AssessmentTarget.objects.create(
        tenant=group_a.tenant, assessment=a, target_type="GROUP", group=group_a
    )
    AssessmentTarget.objects.create(
        tenant=group_a.tenant, assessment=a, target_type="STUDENT", student=s
    )
    assert estimate_reach(a) == 1


def test_reach_endpoint(api_client):
    from .conftest import login_as

    group = GroupFactory()
    _enroll(group)
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    a = AssessmentFactory(tenant=group.tenant)
    AssessmentTarget.objects.create(
        tenant=group.tenant, assessment=a, target_type="GRADE", grade=group.grade
    )

    client = login_as(api_client, owner)
    resp = client.get(f"/api/v1/assessments/{a.id}/reach/")
    assert resp.status_code == 200
    assert resp.data["students"] == 1
