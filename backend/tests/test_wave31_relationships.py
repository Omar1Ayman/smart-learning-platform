"""Wave 31 — Course.term, Enrollment.term, aggregation endpoints."""

import pytest

from apps.academics.models import Course
from apps.people.models import Enrollment

from .conftest import login_as
from .factories import (
    AcademicYearFactory,
    CourseFactory,
    EnrollmentFactory,
    GradeFactory,
    GroupFactory,
    StudentUserFactory,
    SubjectFactory,
    TenantFactory,
    TermFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


# ============================================================================
# Course.term + Course.academic_year
# ============================================================================


def test_course_with_year_without_term_is_valid():
    course = CourseFactory()
    assert course.academic_year is not None
    assert course.term is None


def test_course_with_year_only():
    tenant = TenantFactory()
    year = AcademicYearFactory(tenant=tenant)
    subject = SubjectFactory(tenant=tenant)
    grade = GradeFactory(tenant=tenant)
    course = Course.objects.create(
        tenant=tenant,
        subject=subject,
        grade=grade,
        name="Math",
        academic_year=year,
    )
    assert course.academic_year_id == year.id
    assert course.term is None


def test_course_with_year_and_term():
    tenant = TenantFactory()
    year = AcademicYearFactory(tenant=tenant)
    term = TermFactory(tenant=tenant, academic_year=year)
    subject = SubjectFactory(tenant=tenant)
    grade = GradeFactory(tenant=tenant)
    course = Course.objects.create(
        tenant=tenant,
        subject=subject,
        grade=grade,
        name="Math",
        academic_year=year,
        term=term,
    )
    assert course.term_id == term.id


def test_term_requires_academic_year():
    """A term cannot be set without a matching year — DB CHECK."""
    from django.db import IntegrityError, transaction

    tenant = TenantFactory()
    year = AcademicYearFactory(tenant=tenant)
    term = TermFactory(tenant=tenant, academic_year=year)
    subject = SubjectFactory(tenant=tenant)
    grade = GradeFactory(tenant=tenant)

    with pytest.raises(IntegrityError), transaction.atomic():
        Course.objects.create(tenant=tenant, subject=subject, grade=grade, name="Math", term=term)


def test_course_term_must_belong_to_year(api_client):
    """API validation — term.year must match course.year."""
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    year_a = AcademicYearFactory(tenant=tenant)
    year_b = AcademicYearFactory(tenant=tenant)
    term_of_b = TermFactory(tenant=tenant, academic_year=year_b)
    subject = SubjectFactory(tenant=tenant)
    grade = GradeFactory(tenant=tenant)

    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/courses/",
        {
            "subject": str(subject.id),
            "grade": str(grade.id),
            "name": "Mismatched",
            "academic_year": str(year_a.id),
            "term": str(term_of_b.id),
        },
        format="json",
    )
    assert r.status_code == 400
    assert "term" in str(r.data)


def test_can_have_year_only_and_term_specific_courses_with_same_name(api_client):
    """A year-only and a term-specific course can coexist for the same year."""
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    year = AcademicYearFactory(tenant=tenant)
    term = TermFactory(tenant=tenant, academic_year=year)
    subject = SubjectFactory(tenant=tenant)
    grade = GradeFactory(tenant=tenant)

    client = login_as(api_client, owner)

    # Year-only
    r1 = client.post(
        "/api/v1/courses/",
        {
            "subject": str(subject.id),
            "grade": str(grade.id),
            "academic_year": str(year.id),
            "name": "Math",
        },
        format="json",
    )
    assert r1.status_code == 201, r1.data

    # Specific
    r2 = client.post(
        "/api/v1/courses/",
        {
            "subject": str(subject.id),
            "grade": str(grade.id),
            "name": "Math",
            "academic_year": str(year.id),
            "term": str(term.id),
        },
        format="json",
    )
    assert r2.status_code == 201, r2.data


def test_cannot_duplicate_same_year_only_course(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    year = AcademicYearFactory(tenant=tenant)
    subject = SubjectFactory(tenant=tenant)
    grade = GradeFactory(tenant=tenant)
    Course.objects.create(
        tenant=tenant,
        subject=subject,
        grade=grade,
        name="Math",
        academic_year=year,
    )

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
    assert r.status_code == 400


# ============================================================================
# Enrollment.term
# ============================================================================


def test_enrollment_without_term_is_full_year():
    group = GroupFactory()
    enrollment = EnrollmentFactory(
        tenant=group.tenant, group=group, academic_year=group.academic_year
    )
    assert enrollment.term is None


def test_enrollment_with_term():
    group = GroupFactory()
    term = TermFactory(tenant=group.tenant, academic_year=group.academic_year)
    enrollment = EnrollmentFactory(
        tenant=group.tenant,
        group=group,
        academic_year=group.academic_year,
        term=term,
    )
    assert enrollment.term_id == term.id


def test_student_can_be_enrolled_in_two_different_terms(api_client):
    """Mid-year transfer — same student, same year, different terms."""
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    year = AcademicYearFactory(tenant=tenant)
    year.activate()
    term1 = TermFactory(tenant=tenant, academic_year=year, name="Term 1")
    term2 = TermFactory(tenant=tenant, academic_year=year, name="Term 2")
    grade = GradeFactory(tenant=tenant)
    group_a = GroupFactory(tenant=tenant, grade=grade, academic_year=year, name="A")
    group_b = GroupFactory(tenant=tenant, grade=grade, academic_year=year, name="B")
    student = StudentUserFactory(tenant=tenant)

    client = login_as(api_client, owner)

    r1 = client.post(
        "/api/v1/enrollments/",
        {"student": str(student.id), "group": str(group_a.id), "term": str(term1.id)},
        format="json",
    )
    assert r1.status_code == 201, r1.data

    r2 = client.post(
        "/api/v1/enrollments/",
        {"student": str(student.id), "group": str(group_b.id), "term": str(term2.id)},
        format="json",
    )
    assert r2.status_code == 201, r2.data


def test_cannot_enroll_same_term_twice(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    year = AcademicYearFactory(tenant=tenant)
    year.activate()
    term = TermFactory(tenant=tenant, academic_year=year)
    grade = GradeFactory(tenant=tenant)
    group_a = GroupFactory(tenant=tenant, grade=grade, academic_year=year)
    group_b = GroupFactory(tenant=tenant, grade=grade, academic_year=year)
    student = StudentUserFactory(tenant=tenant)
    Enrollment.objects.create(
        tenant=tenant,
        student=student,
        group=group_a,
        academic_year=year,
        term=term,
    )

    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/enrollments/",
        {"student": str(student.id), "group": str(group_b.id), "term": str(term.id)},
        format="json",
    )
    assert r.status_code == 400


def test_enrollment_term_must_match_group_year(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    year_a = AcademicYearFactory(tenant=tenant)
    year_a.activate()
    year_b = AcademicYearFactory(tenant=tenant)
    term_of_b = TermFactory(tenant=tenant, academic_year=year_b)
    grade = GradeFactory(tenant=tenant)
    group_a = GroupFactory(tenant=tenant, grade=grade, academic_year=year_a)
    student = StudentUserFactory(tenant=tenant)

    client = login_as(api_client, owner)
    r = client.post(
        "/api/v1/enrollments/",
        {"student": str(student.id), "group": str(group_a.id), "term": str(term_of_b.id)},
        format="json",
    )
    assert r.status_code == 400
    assert "term" in str(r.data)


# ============================================================================
# Aggregation endpoints
# ============================================================================


def test_course_detail_aggregation(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    course = CourseFactory(tenant=tenant)

    client = login_as(api_client, owner)
    r = client.get(f"/api/v1/courses/{course.id}/detail/")
    assert r.status_code == 200
    assert "course" in r.data
    assert "chapters" in r.data
    assert "teachers" in r.data
    assert "groups" in r.data
    assert "assessments" in r.data
    assert "content" in r.data


def test_grade_detail_aggregation(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    grade = GradeFactory(tenant=tenant)
    CourseFactory(tenant=tenant, grade=grade)

    client = login_as(api_client, owner)
    r = client.get(f"/api/v1/grades/{grade.id}/detail/")
    assert r.status_code == 200
    assert "grade" in r.data
    assert "courses" in r.data
    assert "groups" in r.data
    assert "teachers" in r.data
    assert "summary" in r.data


def test_stage_detail_aggregation(api_client):
    grade = GradeFactory()  # tenant inherited from grade.stage.tenant
    owner = UserFactory(tenant=grade.tenant, role="OWNER")
    stage = grade.stage

    client = login_as(api_client, owner)
    r = client.get(f"/api/v1/stages/{stage.id}/detail/")
    assert r.status_code == 200
    assert "stage" in r.data
    assert "grades" in r.data
    assert "summary" in r.data
