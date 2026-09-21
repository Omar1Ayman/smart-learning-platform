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
)

pytestmark = pytest.mark.django_db


def test_owner_can_create_course_with_own_tenants_subject_and_grade(api_client):
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    grade = GradeFactory(stage__tenant=tenant, tenant=tenant)
    subject = SubjectFactory(tenant=tenant)

    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/courses/",
        {"grade": str(grade.id), "subject": str(subject.id), "name": "Biology — First Secondary"},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert Course.objects.get(id=resp.data["id"]).tenant_id == tenant.id


def test_course_cannot_reference_another_tenants_subject():
    """Layer 5 (relationship permission) for the new models: a foreign
    tenant's Subject id must not be a valid choice, exactly like Term ->
    AcademicYear was tested earlier."""
    tenant_a = TenantFactory()
    tenant_b = TenantFactory()
    owner_a = UserFactory(tenant=tenant_a, role="OWNER")
    grade_a = GradeFactory(stage__tenant=tenant_a, tenant=tenant_a)
    subject_b = SubjectFactory(tenant=tenant_b)

    from rest_framework.test import APIClient

    client = login_as(APIClient(), owner_a)
    resp = client.post(
        "/api/v1/courses/",
        {"grade": str(grade_a.id), "subject": str(subject_b.id), "name": "Smuggled"},
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
