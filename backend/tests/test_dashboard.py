"""Wave 16 — dashboard aggregation endpoints."""

import pytest
from django.utils import timezone

from apps.assessments.models import AssessmentTarget
from apps.exam_engine.models import ExamAttempt
from apps.questions.models import Question

from .conftest import login_as
from .factories import (
    AssessmentFactory,
    EnrollmentFactory,
    GroupFactory,
    QuestionBankFactory,
    QuestionFactory,
    StudentUserFactory,
    TeacherUserFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


# ---------- Admin ----------

def test_admin_dashboard_returns_metrics(api_client):
    tenant = UserFactory(role="OWNER").tenant
    owner = UserFactory(tenant=tenant, role="OWNER")
    StudentUserFactory(tenant=tenant)
    TeacherUserFactory(tenant=tenant)

    client = login_as(api_client, owner)
    resp = client.get("/api/v1/dashboard/admin/")
    assert resp.status_code == 200
    assert resp.data["metrics"]["total_students"] >= 1
    assert resp.data["metrics"]["total_teachers"] >= 1
    assert len(resp.data["chart"]) == 7  # 7-day series with zeros filled


def test_teacher_cannot_access_admin_dashboard(api_client):
    teacher = TeacherUserFactory()
    client = login_as(api_client, teacher)
    resp = client.get("/api/v1/dashboard/admin/")
    assert resp.status_code == 403


def test_student_cannot_access_admin_dashboard(api_client):
    student = StudentUserFactory()
    client = login_as(api_client, student)
    resp = client.get("/api/v1/dashboard/admin/")
    assert resp.status_code == 403


# ---------- Teacher ----------

def test_teacher_dashboard_counts_only_their_students(api_client):
    group = GroupFactory()
    teacher_a = TeacherUserFactory(tenant=group.tenant)
    teacher_b = TeacherUserFactory(tenant=group.tenant)
    from .factories import CourseFactory
    from apps.people.models import TeacherAssignment

    course = CourseFactory(grade=group.grade, tenant=group.tenant)
    assignment = TeacherAssignment.objects.create(
        tenant=group.tenant, teacher=teacher_a, course=course
    )
    assignment.groups.set([group])

    EnrollmentFactory(group=group, tenant=group.tenant, academic_year=group.academic_year)
    EnrollmentFactory(group=group, tenant=group.tenant, academic_year=group.academic_year)

    client = login_as(api_client, teacher_a)
    resp = client.get("/api/v1/dashboard/teacher/")
    assert resp.status_code == 200
    assert resp.data["metrics"]["my_students"] == 2


# ---------- Student ----------

def test_student_dashboard_shows_upcoming_assessments(api_client):
    group = GroupFactory()
    student = StudentUserFactory(tenant=group.tenant)
    EnrollmentFactory(
        tenant=group.tenant, student=student, group=group, academic_year=group.academic_year
    )
    assessment = AssessmentFactory(
        tenant=group.tenant,
        status="PUBLISHED",
        ends_at=timezone.now() + timezone.timedelta(days=7),
    )
    AssessmentTarget.objects.create(
        tenant=group.tenant, assessment=assessment, target_type="GRADE", grade=group.grade
    )

    client = login_as(api_client, student)
    resp = client.get("/api/v1/dashboard/student/")
    assert resp.status_code == 200
    assert resp.data["metrics"]["upcoming_assessments"] == 1
    assert resp.data["upcoming"][0]["title"] == assessment.title


def test_student_dashboard_shows_recent_results(api_client):
    group = GroupFactory()
    student = StudentUserFactory(tenant=group.tenant)
    EnrollmentFactory(
        tenant=group.tenant, student=student, group=group, academic_year=group.academic_year
    )
    assessment = AssessmentFactory(tenant=group.tenant, status="PUBLISHED")
    ExamAttempt.objects.create(
        tenant=group.tenant,
        assessment=assessment,
        student=student,
        status="GRADED",
        max_score=10,
        score=8,
        is_passed=True,
        submitted_at=timezone.now(),
    )

    client = login_as(api_client, student)
    resp = client.get("/api/v1/dashboard/student/")
    assert len(resp.data["recent_results"]) == 1
    assert resp.data["recent_results"][0]["percentage"] == 80.0