"""Visibility mirrors Question's pattern (Phase 7): OWNER/ADMIN see all;
TEACHER sees own + PUBLISHED; STUDENT sees only PUBLISHED assessments that
target them, via the lean student-facing serializer."""

import pytest

from apps.assessments.models import AssessmentTarget

from .conftest import login_as
from .factories import (
    AssessmentFactory,
    EnrollmentFactory,
    GroupFactory,
    TeacherUserFactory,
    TenantFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def _publish(assessment):
    assessment.status = "PUBLISHED"
    assessment.save(update_fields=["status"])


def _enrolled_student(group):
    student = UserFactory(tenant=group.tenant, role="STUDENT")
    EnrollmentFactory(
        tenant=group.tenant, student=student, group=group, academic_year=group.academic_year
    )
    return student


def test_student_sees_published_assessment_targeted_to_their_grade(api_client):
    group = GroupFactory()
    student = _enrolled_student(group)
    assessment = AssessmentFactory(tenant=group.tenant)
    AssessmentTarget.objects.create(
        tenant=group.tenant, assessment=assessment, target_type="GRADE", grade=group.grade
    )
    _publish(assessment)

    client = login_as(api_client, student)
    resp = client.get("/api/v1/assessments/")
    assert str(assessment.id) in {row["id"] for row in resp.data["results"]}


def test_student_does_not_see_a_draft_assessment_even_if_targeted(api_client):
    group = GroupFactory()
    student = _enrolled_student(group)
    assessment = AssessmentFactory(tenant=group.tenant)  # stays DRAFT
    AssessmentTarget.objects.create(
        tenant=group.tenant, assessment=assessment, target_type="GRADE", grade=group.grade
    )

    client = login_as(api_client, student)
    assert client.get("/api/v1/assessments/").data["count"] == 0


def test_student_does_not_see_assessment_targeted_to_a_different_grade(api_client):
    group_a = GroupFactory()
    group_b = GroupFactory(tenant=group_a.tenant)  # independent grade
    student = _enrolled_student(group_a)
    assessment = AssessmentFactory(tenant=group_a.tenant)
    AssessmentTarget.objects.create(
        tenant=group_a.tenant, assessment=assessment, target_type="GRADE", grade=group_b.grade
    )
    _publish(assessment)

    client = login_as(api_client, student)
    assert client.get("/api/v1/assessments/").data["count"] == 0


def test_student_sees_tenant_wide_targeted_assessment(api_client):
    # TENANT-type targeting still needs *some* enrollment to establish an
    # academic context at all — same rule Content uses.
    group = GroupFactory()
    student = _enrolled_student(group)
    assessment = AssessmentFactory(tenant=group.tenant)
    AssessmentTarget.objects.create(
        tenant=group.tenant, assessment=assessment, target_type="TENANT"
    )
    _publish(assessment)

    client = login_as(api_client, student)
    assert client.get("/api/v1/assessments/").data["count"] == 1


def test_student_sees_assessment_targeted_to_them_specifically(api_client):
    group = GroupFactory()
    student = _enrolled_student(group)
    assessment = AssessmentFactory(tenant=group.tenant)
    AssessmentTarget.objects.create(
        tenant=group.tenant, assessment=assessment, target_type="STUDENT", student=student
    )
    _publish(assessment)

    client = login_as(api_client, student)
    assert client.get("/api/v1/assessments/").data["count"] == 1


def test_student_response_never_includes_staff_only_fields(api_client):
    group = GroupFactory()
    student = _enrolled_student(group)
    assessment = AssessmentFactory(tenant=group.tenant)
    AssessmentTarget.objects.create(
        tenant=group.tenant, assessment=assessment, target_type="TENANT"
    )
    _publish(assessment)

    client = login_as(api_client, student)
    row = client.get("/api/v1/assessments/").data["results"][0]
    assert "randomize_question_order" not in row
    assert "created_by" not in row
    assert "status" not in row


def test_teacher_sees_own_draft_plus_others_published(api_client):
    tenant = TenantFactory()
    teacher_a = TeacherUserFactory(tenant=tenant)
    teacher_b = TeacherUserFactory(tenant=tenant)
    own_draft = AssessmentFactory(tenant=tenant, created_by=teacher_a)
    others_published = AssessmentFactory(tenant=tenant, created_by=teacher_b)
    _publish(others_published)
    others_draft = AssessmentFactory(tenant=tenant, created_by=teacher_b)

    client = login_as(api_client, teacher_a)
    ids = {row["id"] for row in client.get("/api/v1/assessments/").data["results"]}
    assert str(own_draft.id) in ids
    assert str(others_published.id) in ids
    assert str(others_draft.id) not in ids


def test_admin_cannot_read_another_tenants_assessment(api_client):
    admin_a = UserFactory(tenant=TenantFactory(), role="OWNER")
    other_assessment = AssessmentFactory()  # independent tenant

    client = login_as(api_client, admin_a)
    resp = client.get(f"/api/v1/assessments/{other_assessment.id}/")
    assert resp.status_code in (403, 404)
