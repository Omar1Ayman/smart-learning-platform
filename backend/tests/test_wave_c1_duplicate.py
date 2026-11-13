"""Wave C1 — duplicate assessment + course regression tests."""

import pytest

from apps.academics.models import Chapter, Course, Lesson
from apps.assessments.models import (
    Assessment,
    AssessmentQuestion,
    AssessmentTarget,
)

from .conftest import login_as
from .factories import (
    AcademicYearFactory,
    AssessmentFactory,
    GradeFactory,
    QuestionBankFactory,
    QuestionFactory,
    SubjectFactory,
    TeacherUserFactory,
    TenantFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Assessment duplicate
# ---------------------------------------------------------------------------


def _make_assessment_with_questions_and_targets(tenant=None, created_by=None):
    """Build an assessment with 2 questions + 1 GRADE target."""
    tenant = tenant or TenantFactory()
    creator = created_by or UserFactory(tenant=tenant, role="OWNER")
    grade = GradeFactory(tenant=tenant)
    bank = QuestionBankFactory(tenant=tenant)

    assessment = AssessmentFactory(
        tenant=tenant,
        title="Final Bio Exam",
        created_by=creator,
    )
    for i in range(1, 3):
        q = QuestionFactory(
            bank=bank,
            tenant=tenant,
            approved=True,
            created_by=creator,
        )
        AssessmentQuestion.objects.create(tenant=tenant, assessment=assessment, question=q, order=i)
    AssessmentTarget.objects.create(
        tenant=tenant,
        assessment=assessment,
        target_type="GRADE",
        grade=grade,
    )
    return tenant, creator, assessment


def test_owner_can_duplicate_assessment(api_client):
    tenant, owner, source = _make_assessment_with_questions_and_targets()
    client = login_as(api_client, owner)

    r = client.post(f"/api/v1/assessments/{source.id}/duplicate/")
    assert r.status_code == 201, r.data

    copy = Assessment.objects.get(id=r.data["id"])
    assert copy.id != source.id
    assert copy.title == "Final Bio Exam (نسخة)"
    assert copy.status == Assessment.Status.DRAFT
    assert copy.tenant_id == tenant.id
    assert copy.created_by_id == owner.id
    # Questions + targets copied.
    assert copy.assessment_questions.count() == 2
    assert copy.targets.count() == 1


def test_duplicate_twice_creates_numbered_suffix(api_client):
    tenant, owner, source = _make_assessment_with_questions_and_targets()
    client = login_as(api_client, owner)

    r1 = client.post(f"/api/v1/assessments/{source.id}/duplicate/")
    assert r1.status_code == 201
    assert r1.data["title"] == "Final Bio Exam (نسخة)"

    r2 = client.post(f"/api/v1/assessments/{source.id}/duplicate/")
    assert r2.status_code == 201
    assert r2.data["title"] == "Final Bio Exam (نسخة 2)"


def test_duplicate_does_not_copy_published_status(api_client):
    """Even if the source is PUBLISHED, the copy starts as DRAFT so the
    teacher must explicitly review + publish it themselves."""
    tenant, owner, source = _make_assessment_with_questions_and_targets()
    source.status = Assessment.Status.PUBLISHED
    source.save(update_fields=["status"])

    client = login_as(api_client, owner)
    r = client.post(f"/api/v1/assessments/{source.id}/duplicate/")
    assert r.status_code == 201
    copy = Assessment.objects.get(id=r.data["id"])
    assert copy.status == Assessment.Status.DRAFT


def test_teacher_can_duplicate_own_assessment(api_client):
    tenant = TenantFactory()
    teacher = TeacherUserFactory(tenant=tenant)
    _tenant, _creator, source = _make_assessment_with_questions_and_targets(
        tenant=tenant, created_by=teacher
    )

    client = login_as(api_client, teacher)
    r = client.post(f"/api/v1/assessments/{source.id}/duplicate/")
    assert r.status_code == 201


def test_student_cannot_duplicate_assessment(api_client):
    tenant, _owner, source = _make_assessment_with_questions_and_targets()
    student = UserFactory(tenant=tenant, role="STUDENT")
    client = login_as(api_client, student)
    r = client.post(f"/api/v1/assessments/{source.id}/duplicate/")
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Course duplicate
# ---------------------------------------------------------------------------


def _make_course_with_chapters_and_lessons(tenant=None):
    tenant = tenant or TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")
    year = AcademicYearFactory(tenant=tenant)
    course = Course.objects.create(
        tenant=tenant,
        subject=SubjectFactory(tenant=tenant),
        grade=GradeFactory(tenant=tenant),
        name="Biology — First Secondary",
        academic_year=year,
    )
    for ch_idx in range(1, 3):
        chapter = Chapter.objects.create(
            tenant=tenant, course=course, name=f"Chapter {ch_idx}", order=ch_idx
        )
        for l_idx in range(1, 3):
            Lesson.objects.create(
                tenant=tenant,
                chapter=chapter,
                name=f"Lesson {ch_idx}.{l_idx}",
                order=l_idx,
            )
    return tenant, owner, course


def test_owner_can_duplicate_course_with_tree(api_client):
    tenant, owner, source = _make_course_with_chapters_and_lessons()
    client = login_as(api_client, owner)

    r = client.post(f"/api/v1/courses/{source.id}/duplicate/")
    assert r.status_code == 201, r.data

    copy = Course.objects.get(id=r.data["id"])
    assert copy.id != source.id
    assert copy.name == "Biology — First Secondary (نسخة)"
    assert copy.subject_id == source.subject_id
    assert copy.grade_id == source.grade_id

    # 2 chapters، each with 2 lessons — full tree copied.
    chapters = list(copy.chapters.order_by("order"))
    assert len(chapters) == 2
    for ch in chapters:
        assert ch.lessons.count() == 2


def test_course_duplicate_respects_unique_constraint(api_client):
    """A duplicate that would collide on (grade, subject, name, year, term)
    must get a numeric suffix automatically — not 400."""
    tenant, owner, source = _make_course_with_chapters_and_lessons()
    client = login_as(api_client, owner)

    r1 = client.post(f"/api/v1/courses/{source.id}/duplicate/")
    assert r1.status_code == 201
    assert r1.data["name"] == "Biology — First Secondary (نسخة)"

    r2 = client.post(f"/api/v1/courses/{source.id}/duplicate/")
    assert r2.status_code == 201
    assert r2.data["name"] == "Biology — First Secondary (نسخة 2)"


def test_course_duplicate_does_not_copy_teacher_assignments(api_client):
    """Per design — a duplicate course has no teacher assignments؛ an
    admin must explicitly assign teachers to the new course."""
    from apps.people.models import TeacherAssignment

    tenant, owner, source = _make_course_with_chapters_and_lessons()
    teacher = TeacherUserFactory(tenant=tenant)
    TeacherAssignment.objects.create(tenant=tenant, teacher=teacher, course=source)
    assert TeacherAssignment.objects.filter(course=source).count() == 1

    client = login_as(api_client, owner)
    r = client.post(f"/api/v1/courses/{source.id}/duplicate/")
    assert r.status_code == 201

    copy = Course.objects.get(id=r.data["id"])
    assert TeacherAssignment.objects.filter(course=copy).count() == 0


def test_teacher_cannot_duplicate_course(api_client):
    """IsAdminForWriteActions restricts course writes to OWNER/ADMIN."""
    tenant, _owner, source = _make_course_with_chapters_and_lessons()
    teacher = TeacherUserFactory(tenant=tenant)
    client = login_as(api_client, teacher)
    r = client.post(f"/api/v1/courses/{source.id}/duplicate/")
    assert r.status_code == 403
