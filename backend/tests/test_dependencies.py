"""Wave 33 — data integrity: blockers, warnings, setup-status, orphans."""

import pytest

from apps.people.models import TeacherAssignment

from .conftest import login_as
from .factories import (
    AcademicYearFactory,
    CourseFactory,
    EnrollmentFactory,
    GradeFactory,
    GroupFactory,
    StudentUserFactory,
    TeacherUserFactory,
    TenantFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


# ============================================================================
# Blocking rules — Enrollment
# ============================================================================


def test_cannot_enroll_non_student_as_student(api_client):
    group = GroupFactory()
    group.academic_year.activate()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=group.tenant)  # WRONG role

    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/enrollments/",
        {"student": str(teacher.id), "group": str(group.id)},
        format="json",
    )
    assert r.status_code == 400
    assert "student" in str(r.data)


# ============================================================================
# Blocking rules — TeacherAssignment
# ============================================================================


def test_cannot_assign_non_teacher_as_teacher(api_client):
    course = CourseFactory()
    course.academic_year.activate()
    owner = UserFactory(tenant=course.tenant, role="OWNER")
    student = StudentUserFactory(tenant=course.tenant)

    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/teacher-assignments/",
        {"teacher": str(student.id), "course": str(course.id)},
        format="json",
    )
    assert r.status_code == 400
    assert "teacher" in str(r.data)


# ============================================================================
# Warnings — Enrollment without teacher
# ============================================================================


def test_enrollment_success_warns_when_group_has_no_teacher(api_client):
    group = GroupFactory()  # No TeacherAssignment for this group
    group.academic_year.activate()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    student = StudentUserFactory(tenant=group.tenant)

    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/enrollments/",
        {"student": str(student.id), "group": str(group.id)},
        format="json",
    )
    assert r.status_code == 201, r.data
    # Succeeded, but warned
    assert "_warnings" in r.data
    assert "group" in r.data["_warnings"]
    assert "معلم" in r.data["_warnings"]["group"][0]


def test_enrollment_with_teacher_no_warning(api_client):
    group = GroupFactory()
    group.academic_year.activate()
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=group.tenant)
    course = CourseFactory(tenant=group.tenant, grade=group.grade)
    ta = TeacherAssignment.objects.create(tenant=group.tenant, teacher=teacher, course=course)
    ta.groups.set([group])
    student = StudentUserFactory(tenant=group.tenant)

    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/enrollments/",
        {"student": str(student.id), "group": str(group.id)},
        format="json",
    )
    assert r.status_code == 201
    # No group warning
    assert "group" not in r.data.get("_warnings", {})


# ============================================================================
# Warnings — Course in empty grade
# ============================================================================


def test_course_creation_warns_when_grade_has_no_groups(api_client):
    grade = GradeFactory()  # No groups in this grade
    owner = UserFactory(tenant=grade.tenant, role="OWNER")
    from .factories import SubjectFactory

    subject = SubjectFactory(tenant=grade.tenant)
    year = AcademicYearFactory(tenant=grade.tenant)

    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/courses/",
        {
            "subject": str(subject.id),
            "grade": str(grade.id),
            "academic_year": str(year.id),
            "name": "Math",
        },
        format="json",
    )
    assert r.status_code == 201, r.data
    assert "_warnings" in r.data
    assert "grade" in r.data["_warnings"]


def test_course_creation_no_warning_when_grade_has_groups(api_client):
    group = GroupFactory()  # A group exists in grade
    owner = UserFactory(tenant=group.tenant, role="OWNER")
    from .factories import SubjectFactory

    subject = SubjectFactory(tenant=group.tenant)

    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/courses/",
        {
            "subject": str(subject.id),
            "grade": str(group.grade.id),
            "academic_year": str(group.academic_year.id),
            "name": "Math",
        },
        format="json",
    )
    assert r.status_code == 201
    assert "grade" not in r.data.get("_warnings", {})


# ============================================================================
# Warnings — TeacherAssignment on chapter-less course
# ============================================================================


def test_teacher_assignment_warns_when_course_has_no_chapters(api_client):
    course = CourseFactory()  # No chapters
    course.academic_year.activate()
    owner = UserFactory(tenant=course.tenant, role="OWNER")
    teacher = TeacherUserFactory(tenant=course.tenant)

    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/teacher-assignments/",
        {"teacher": str(teacher.id), "course": str(course.id)},
        format="json",
    )
    assert r.status_code == 201, r.data
    assert "_warnings" in r.data
    assert "course" in r.data["_warnings"]


# ============================================================================
# Setup status endpoint
# ============================================================================


def test_setup_status_empty_tenant(api_client):
    owner = UserFactory(role="OWNER")
    client = login_as(api_client, owner)
    r = client.get("/api/v1/setup-status/")
    assert r.status_code == 200
    assert r.data["complete"] is False
    # First step should be academic_year (nothing blocks it)
    assert r.data["next_action"]["key"] == "academic_year"


def test_setup_status_blocks_grade_until_stage_exists(api_client):
    owner = UserFactory(role="OWNER")
    client = login_as(api_client, owner)
    r = client.get("/api/v1/setup-status/")

    steps = {s["key"]: s for s in r.data["steps"]}
    assert steps["stage"]["done"] is False
    assert steps["grade"]["blocked_by"] == "stage"
    assert steps["grade"]["action_url"] is None  # can't act yet


def test_setup_status_complete_when_required_steps_done(api_client):
    from .factories import (
        AcademicYearFactory,
        ChapterFactory,
        CourseFactory,
        GradeFactory,
        GroupFactory,
        StageFactory,
        SubjectFactory,
    )

    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")

    year = AcademicYearFactory(tenant=tenant)
    stage = StageFactory(tenant=tenant)
    grade = GradeFactory(tenant=tenant, stage=stage)
    group = GroupFactory(tenant=tenant, grade=grade, academic_year=year)
    subject = SubjectFactory(tenant=tenant)
    course = CourseFactory(tenant=tenant, grade=grade, subject=subject)
    ChapterFactory(tenant=tenant, course=course)
    teacher = TeacherUserFactory(tenant=tenant)
    ta = TeacherAssignment.objects.create(tenant=tenant, teacher=teacher, course=course)
    ta.groups.set([group])
    student = StudentUserFactory(tenant=tenant)
    EnrollmentFactory(tenant=tenant, student=student, group=group, academic_year=year)

    client = login_as(api_client, owner)
    r = client.get("/api/v1/setup-status/")
    assert r.status_code == 200
    assert r.data["complete"] is True
    assert r.data["next_action"] is None


# ============================================================================
# check_orphans command (smoke)
# ============================================================================


def test_check_orphans_clean_data_returns_success(capsys):
    from django.core.management import call_command

    TenantFactory()  # empty tenant, no orphans
    call_command("check_orphans")
    captured = capsys.readouterr()
    assert "No orphans" in captured.out
