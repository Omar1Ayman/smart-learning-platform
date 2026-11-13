"""
Same recipe as test_tenant_isolation.py / test_academics.py, applied to
the new Course -> Chapter -> Lesson layer: relationship-scoped serializer
fields (a Course's subject/grade must be the caller's own tenant), object
isolation, and role gating.
"""

import pytest
from django.db import IntegrityError, transaction

from apps.academics.models import Chapter, Course, Lesson

from .conftest import login_as
from .factories import (
    ChapterFactory,
    CourseFactory,
    GradeFactory,
    SubjectFactory,
    TenantFactory,
    UserFactory,
    AcademicYearFactory,
    TermFactory
)

pytestmark = pytest.mark.django_db


def test_owner_can_create_course_with_own_tenants_subject_and_grade(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    grade = GradeFactory(stage__tenant=tenant, tenant=tenant)
    subject = SubjectFactory(tenant=tenant)
    year = AcademicYearFactory(tenant=tenant)  # ⬅️ جديد

    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/courses/",
        {
            "grade": str(grade.id),
            "subject": str(subject.id),
            "name": "Biology — First Secondary",
            "academic_year": str(year.id),  # ⬅️ جديد
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data

def test_course_cannot_reference_another_tenants_subject():
    tenant_a = TenantFactory()
    tenant_b = TenantFactory()
    owner_a = UserFactory(tenant=tenant_a, role="OWNER")
    grade_a = GradeFactory(stage__tenant=tenant_a, tenant=tenant_a)
    subject_b = SubjectFactory(tenant=tenant_b)
    year_a = AcademicYearFactory(tenant=tenant_a)  # ⬅️ جديد

    from rest_framework.test import APIClient
    client = login_as(APIClient(), owner_a)
    resp = client.post(
        "/api/v1/courses/",
        {
            "grade": str(grade_a.id),
            "subject": str(subject_b.id),
            "name": "Smuggled",
            "academic_year": str(year_a.id),  # ⬅️ جديد
        },
        format="json",
    )
    assert resp.status_code == 400
def test_chapter_order_is_unique_within_a_course():
    course = CourseFactory()
    ChapterFactory(course=course, tenant=course.tenant, order=1)
    with pytest.raises(IntegrityError), transaction.atomic():
        Chapter.objects.create(tenant=course.tenant, course=course, name="Duplicate order", order=1)


def test_admin_cannot_read_another_tenants_chapter(api_client):
    tenant_a = TenantFactory()
    admin_a = UserFactory(tenant=tenant_a, role="OWNER")
    chapter_b = ChapterFactory()  # builds its own independent tenant
    assert chapter_b.tenant_id != tenant_a.id

    client = login_as(api_client, admin_a)
    resp = client.get(f"/api/v1/chapters/{chapter_b.id}/")
    assert resp.status_code in (403, 404)


def test_student_cannot_create_lesson(api_client):
    course = CourseFactory()
    chapter = ChapterFactory(course=course, tenant=course.tenant)
    student = UserFactory(tenant=course.tenant, role="STUDENT")

    client = login_as(api_client, student)
    resp = client.post(
        "/api/v1/lessons/", {"chapter": str(chapter.id), "name": "Cell structure", "order": 1}, format="json"
    )
    assert resp.status_code == 403
    assert Lesson.objects.count() == 0


def test_admin_cannot_create_lesson_in_draft_year(api_client):
    course = CourseFactory()
    chapter = ChapterFactory(course=course, tenant=course.tenant)
    owner = UserFactory(tenant=course.tenant, role="OWNER")

    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/lessons/",
        {"chapter": str(chapter.id), "name": "Cell structure", "order": 1},
        format="json",
    )

    assert resp.status_code == 403
    assert Lesson.objects.count() == 0



def test_year_only_and_term_specific_courses_can_coexist(api_client):
    """ما قبل migration 0007 كان يسمح بـ generic (بلا year). الآن كل
    course له academic_year. لكن يمكن أن يكون له term أو لا."""
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    year = AcademicYearFactory(tenant=tenant)
    subject = SubjectFactory(tenant=tenant)
    grade = GradeFactory(tenant=tenant)
    term = TermFactory(tenant=tenant, academic_year=year)
    client = login_as(api_client, owner)

    # year-only
    r1 = client.post("/api/v1/courses/", {
        "subject": str(subject.id), "grade": str(grade.id), "name": "Math",
        "academic_year": str(year.id),
    }, format="json")
    assert r1.status_code == 201, r1.data

    # year + term
    r2 = client.post("/api/v1/courses/", {
        "subject": str(subject.id), "grade": str(grade.id), "name": "Math",
        "academic_year": str(year.id), "term": str(term.id),
    }, format="json")
    assert r2.status_code == 201, r2.data


def test_cannot_duplicate_year_only_course(api_client):
    """Same (grade, subject, name, year) without term must still be unique."""
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    year = AcademicYearFactory(tenant=tenant)
    subject = SubjectFactory(tenant=tenant)
    grade = GradeFactory(tenant=tenant)
    Course.objects.create(
        tenant=tenant, subject=subject, grade=grade, name="Math", academic_year=year,
    )
    client = login_as(api_client, owner)
    r = client.post("/api/v1/courses/", {
        "subject": str(subject.id), "grade": str(grade.id), "name": "Math",
        "academic_year": str(year.id),
    }, format="json")
    assert r.status_code == 400

def test_patch_name_does_not_wipe_academic_year(api_client):
    """C-3 regression: PATCHing only `name` must keep `academic_year`/`term`."""
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    year = AcademicYearFactory(tenant=tenant)
    term = TermFactory(tenant=tenant, academic_year=year)
    subject = SubjectFactory(tenant=tenant)
    grade = GradeFactory(tenant=tenant)
    course = Course.objects.create(
        tenant=tenant, subject=subject, grade=grade, name="Math",
        academic_year=year, term=term,
    )
    client = login_as(api_client, owner)
    r = client.patch(f"/api/v1/courses/{course.id}/", {"name": "Math 101"}, format="json")
    assert r.status_code == 200
    course.refresh_from_db()
    assert course.name == "Math 101"
    assert course.academic_year_id == year.id  # ← كان بيتـ null قبل الإصلاح
    assert course.term_id == term.id