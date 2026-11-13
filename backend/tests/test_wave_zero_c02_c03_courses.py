"""Wave Zero — C-2 + C-3: Course uniqueness and PATCH behavior.

C-2: The uniqueness constraint used to be `condition=Q(term__isnull=True)`,
which conflated "generic" (year & term null) with "year-only" (year set,
term null), blocking a school from having both a generic "Math" AND a
"Math 2025/26" year-only course. Fixed by three partial uniques (generic /
year-only / term-specific).

C-3: `CourseSerializer.to_internal_value()` used to force-fill missing
`academic_year` and `term` with None, meaning a PATCH that only changed
`name` would silently null out year and term. Fixed by removing the
override entirely.

Fix history (test): the fixture used to create the Term against a DIFFERENT
AcademicYear than the course's, so CourseSerializer.validate() correctly
rejected it with "الترم المختار لا ينتمي للسنة الدراسية المحددة". That was
a test-fixture bug — the production code was right. The term is now
created against the same year the course uses.
"""

import pytest

from apps.academics.models import Course

from .conftest import login_as
from .factories import (
    AcademicYearFactory,
    GradeFactory,
    SubjectFactory,
    TenantFactory,
    TermFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def _setup_course_context():
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    year = AcademicYearFactory(tenant=tenant)
    return {
        "tenant": tenant,
        "owner": owner,
        "subject": SubjectFactory(tenant=tenant),
        "grade": GradeFactory(tenant=tenant),
        "year": year,
        # Term MUST belong to the same year — earlier version used
        # AcademicYearFactory() which silently created a second year,
        # causing C-3's PATCH to fail validation legitimately.
        "term": TermFactory(tenant=tenant, academic_year=year),
    }


# ---- C-2: generic + year-only coexistence ----


def test_year_only_and_term_specific_courses_can_coexist(api_client):
    """A year-only and a term-specific course with the same name can coexist."""
    ctx = _setup_course_context()
    client = login_as(api_client, ctx["owner"])

    # 1) Year-only
    r1 = client.post(
        "/api/v1/courses/",
        {
            "subject": str(ctx["subject"].id),
            "grade": str(ctx["grade"].id),
            "name": "Math",
            "academic_year": str(ctx["year"].id),
        },
        format="json",
    )
    assert r1.status_code == 201

    # 2) Term-specific
    r2 = client.post(
        "/api/v1/courses/",
        {
            "subject": str(ctx["subject"].id),
            "grade": str(ctx["grade"].id),
            "name": "Math",
            "academic_year": str(ctx["year"].id),
            "term": str(ctx["term"].id),
        },
        format="json",
    )
    assert r2.status_code == 201, r2.data

    assert Course.objects.filter(name="Math", tenant=ctx["tenant"]).count() == 2


def test_cannot_duplicate_year_only_course(api_client):
    """Same year-only combination twice must still be rejected."""
    ctx = _setup_course_context()
    Course.objects.create(
        tenant=ctx["tenant"],
        subject=ctx["subject"],
        grade=ctx["grade"],
        name="Math",
        academic_year=ctx["year"],
    )
    client = login_as(api_client, ctx["owner"])
    r = client.post(
        "/api/v1/courses/",
        {
            "subject": str(ctx["subject"].id),
            "grade": str(ctx["grade"].id),
            "name": "Math",
            "academic_year": str(ctx["year"].id),
        },
        format="json",
    )
    assert r.status_code == 400


# ---- C-3: PATCH preserves year/term ----


def test_patch_name_does_not_wipe_academic_year_or_term(api_client):
    """C-3: a PATCH submitting only `name` used to null out year and term
    via the removed to_internal_value override."""
    ctx = _setup_course_context()
    course = Course.objects.create(
        tenant=ctx["tenant"],
        subject=ctx["subject"],
        grade=ctx["grade"],
        name="Math",
        academic_year=ctx["year"],
        term=ctx["term"],
    )
    client = login_as(api_client, ctx["owner"])

    r = client.patch(
        f"/api/v1/courses/{course.id}/",
        {"name": "Math 101"},
        format="json",
    )
    assert r.status_code == 200, r.data

    course.refresh_from_db()
    assert course.name == "Math 101"
    assert course.academic_year_id == ctx["year"].id
    assert course.term_id == ctx["term"].id
