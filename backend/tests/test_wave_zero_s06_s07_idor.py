"""Wave Zero — S-6 + S-7 IDOR fixes.

S-6 (AttemptViewSet.grading + grade_essay): a TEACHER used to see every
attempt in the tenant. Fixed: teacher is scoped to assessments they
created, or assessments whose linked questions come from a bank matching
their TeacherAssignment (subject, grade). Per-question scope on
grade_essay additionally prevents a teacher from grading an out-of-scope
question on an attempt they can reach.

S-7 (StudentDetailView): any TEACHER used to see any STUDENT's full
profile. Fixed: teacher is scoped to students with an ACTIVE enrollment
in a group/grade they are assigned to.

Related: TeacherDetailView used to block teachers from their own profile.
Fixed to allow self-service.
"""

from decimal import Decimal

import pytest

from apps.assessments.models import AssessmentQuestion, AssessmentTarget
from apps.exam_engine.models import AttemptAnswer, ExamAttempt
from apps.people.models import TeacherAssignment
from apps.questions.models import Question

from .conftest import login_as
from .factories import (
    AcademicYearFactory,
    AssessmentFactory,
    CourseFactory,
    EnrollmentFactory,
    GradeFactory,
    GroupFactory,
    QuestionBankFactory,
    QuestionFactory,
    StageFactory,
    StudentUserFactory,
    SubjectFactory,
    TeacherUserFactory,
    TenantFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _build_tenant_with_two_subjects():
    """One tenant, two teachers, two subjects (Math + Bio), each teacher
    assigned to their own subject+grade course. Two students, one per
    grade — so we can test both "same subject different grade" and
    "same grade different subject" boundaries."""
    tenant = TenantFactory()
    owner = UserFactory(tenant=tenant, role="OWNER")

    year = AcademicYearFactory(tenant=tenant)
    stage = StageFactory(tenant=tenant)
    grade_1 = GradeFactory(tenant=tenant, stage=stage, name="Grade 1")
    grade_2 = GradeFactory(tenant=tenant, stage=stage, name="Grade 2")

    math = SubjectFactory(tenant=tenant, name="Math")
    bio = SubjectFactory(tenant=tenant, name="Bio")

    course_math_g1 = CourseFactory(tenant=tenant, subject=math, grade=grade_1, name="Math G1")
    course_bio_g1 = CourseFactory(tenant=tenant, subject=bio, grade=grade_1, name="Bio G1")
    course_math_g2 = CourseFactory(tenant=tenant, subject=math, grade=grade_2, name="Math G2")

    teacher_math = TeacherUserFactory(tenant=tenant, email="math@test.com")
    teacher_bio = TeacherUserFactory(tenant=tenant, email="bio@test.com")

    TeacherAssignment.objects.create(tenant=tenant, teacher=teacher_math, course=course_math_g1)
    TeacherAssignment.objects.create(tenant=tenant, teacher=teacher_bio, course=course_bio_g1)

    group_math_g1 = GroupFactory(tenant=tenant, grade=grade_1, academic_year=year)
    group_math_g2 = GroupFactory(tenant=tenant, grade=grade_2, academic_year=year)

    student_g1 = StudentUserFactory(tenant=tenant, email="s1@test.com")
    EnrollmentFactory(tenant=tenant, student=student_g1, group=group_math_g1, academic_year=year)
    student_g2 = StudentUserFactory(tenant=tenant, email="s2@test.com")
    EnrollmentFactory(tenant=tenant, student=student_g2, group=group_math_g2, academic_year=year)

    return {
        "tenant": tenant,
        "owner": owner,
        "year": year,
        "grade_1": grade_1,
        "grade_2": grade_2,
        "math": math,
        "bio": bio,
        "teacher_math": teacher_math,
        "teacher_bio": teacher_bio,
        "course_math_g1": course_math_g1,
        "student_g1": student_g1,
        "student_g2": student_g2,
    }


def _make_published_assessment_with_question(tenant, subject, grade, teacher):
    """One QUESTION bank matching (subject, grade), one MCQ question
    linked to a PUBLISHED assessment targeting that grade."""
    assessment = AssessmentFactory(tenant=tenant, status="PUBLISHED", created_by=teacher)
    bank = QuestionBankFactory(tenant=tenant, subject=subject, grade=grade)
    question = QuestionFactory(
        bank=bank,
        tenant=tenant,
        question_type=Question.QuestionType.ESSAY,
        approved=True,
        created_by=teacher,
        points="5.00",
    )
    AssessmentQuestion.objects.create(
        tenant=tenant, assessment=assessment, question=question, order=1
    )
    AssessmentTarget.objects.create(
        tenant=tenant, assessment=assessment, target_type="GRADE", grade=grade
    )
    return assessment, question


def _make_attempt_with_essay(tenant, assessment, student, question):
    """A SUBMITTED attempt with a pending essay answer."""
    attempt = ExamAttempt.objects.create(
        tenant=tenant,
        assessment=assessment,
        student=student,
        attempt_number=1,
        status=ExamAttempt.Status.SUBMITTED,
        question_order=[str(question.id)],
        option_order={},
        max_score=Decimal("5.00"),
        score=Decimal("0"),
    )
    AttemptAnswer.objects.create(
        tenant=tenant,
        attempt=attempt,
        question=question,
        text_answer="Essay answer here.",
        awarded_points=None,
    )
    return attempt


# ---------------------------------------------------------------------------
# S-6: AttemptViewSet.grading + grade_essay IDOR
# ---------------------------------------------------------------------------


def test_teacher_can_view_attempt_in_own_subject_grade(api_client):
    """Sanity: teacher in Math-G1 can see an attempt on a Math-G1 assessment."""
    ctx = _build_tenant_with_two_subjects()
    assessment, question = _make_published_assessment_with_question(
        ctx["tenant"], ctx["math"], ctx["grade_1"], teacher=ctx["owner"]
    )
    attempt = _make_attempt_with_essay(ctx["tenant"], assessment, ctx["student_g1"], question)

    client = login_as(api_client, ctx["teacher_math"])
    r = client.get(f"/api/v1/attempts/{attempt.id}/grading/")
    assert r.status_code == 200, r.data


def test_teacher_cannot_view_attempt_in_other_subject_same_grade(api_client):
    """S-6 core: Math-G1 teacher must NOT see a Bio-G1 attempt."""
    ctx = _build_tenant_with_two_subjects()
    assessment, question = _make_published_assessment_with_question(
        ctx["tenant"], ctx["bio"], ctx["grade_1"], teacher=ctx["owner"]
    )
    attempt = _make_attempt_with_essay(ctx["tenant"], assessment, ctx["student_g1"], question)

    client = login_as(api_client, ctx["teacher_math"])
    r = client.get(f"/api/v1/attempts/{attempt.id}/grading/")
    # 404 because the attempt is outside the teacher's queryset, not 403 —
    # attacker learns nothing about whether the ID exists.
    assert r.status_code in (403, 404), r.data


def test_teacher_cannot_view_attempt_same_subject_different_grade(api_client):
    """S-6 boundary: Math-G1 teacher must NOT see a Math-G2 attempt."""
    ctx = _build_tenant_with_two_subjects()
    assessment, question = _make_published_assessment_with_question(
        ctx["tenant"], ctx["math"], ctx["grade_2"], teacher=ctx["owner"]
    )
    attempt = _make_attempt_with_essay(ctx["tenant"], assessment, ctx["student_g2"], question)

    client = login_as(api_client, ctx["teacher_math"])
    r = client.get(f"/api/v1/attempts/{attempt.id}/grading/")
    assert r.status_code in (403, 404), r.data


def test_teacher_can_view_attempt_on_own_created_assessment(api_client):
    """A teacher always has access to attempts on assessments they created,
    even if the linked question's bank has no subject/grade set."""
    ctx = _build_tenant_with_two_subjects()
    teacher = ctx["teacher_math"]
    # Assessment created by the teacher themselves — even if the bank
    # metadata doesn't match perfectly, `created_by` is the discriminator.
    assessment, question = _make_published_assessment_with_question(
        ctx["tenant"], ctx["math"], ctx["grade_1"], teacher=teacher
    )
    attempt = _make_attempt_with_essay(ctx["tenant"], assessment, ctx["student_g1"], question)

    client = login_as(api_client, teacher)
    r = client.get(f"/api/v1/attempts/{attempt.id}/grading/")
    assert r.status_code == 200, r.data


def test_teacher_cannot_grade_essay_outside_question_scope(api_client):
    """S-6 second-tier: even if a teacher CAN reach the attempt (because
    they own it), they can only grade questions in their teaching scope.
    Here the assessment is owned by OWNER (not the teacher), but the
    attempt is reachable because the teacher's scope matches the
    attempt's assessment — so a direct question-scope check must fire.
    """
    ctx = _build_tenant_with_two_subjects()
    # Mixed assessment: created by OWNER, but contains a BIO-G1 question.
    # The Math teacher's scope only covers Math-G1, so the assessment
    # itself is only reachable if some question matches. Let's make the
    # assessment have TWO questions — one Math-G1, one Bio-G1.
    assessment = AssessmentFactory(
        tenant=ctx["tenant"], status="PUBLISHED", created_by=ctx["owner"]
    )
    math_bank = QuestionBankFactory(tenant=ctx["tenant"], subject=ctx["math"], grade=ctx["grade_1"])
    bio_bank = QuestionBankFactory(tenant=ctx["tenant"], subject=ctx["bio"], grade=ctx["grade_1"])
    math_q = QuestionFactory(
        bank=math_bank,
        tenant=ctx["tenant"],
        question_type=Question.QuestionType.ESSAY,
        approved=True,
        created_by=ctx["owner"],
        points="5.00",
    )
    bio_q = QuestionFactory(
        bank=bio_bank,
        tenant=ctx["tenant"],
        question_type=Question.QuestionType.ESSAY,
        approved=True,
        created_by=ctx["owner"],
        points="5.00",
    )
    AssessmentQuestion.objects.create(
        tenant=ctx["tenant"], assessment=assessment, question=math_q, order=1
    )
    AssessmentQuestion.objects.create(
        tenant=ctx["tenant"], assessment=assessment, question=bio_q, order=2
    )
    AssessmentTarget.objects.create(
        tenant=ctx["tenant"],
        assessment=assessment,
        target_type="GRADE",
        grade=ctx["grade_1"],
    )
    attempt = _make_attempt_with_essay(ctx["tenant"], assessment, ctx["student_g1"], math_q)
    # Add a second answer for bio_q (also pending).
    AttemptAnswer.objects.create(
        tenant=ctx["tenant"],
        attempt=attempt,
        question=bio_q,
        text_answer="Bio answer.",
        awarded_points=None,
    )

    # Math teacher CAN reach the attempt (assessment has a Math-G1 question).
    client = login_as(api_client, ctx["teacher_math"])
    r_view = client.get(f"/api/v1/attempts/{attempt.id}/grading/")
    assert r_view.status_code == 200, r_view.data

    # But they must NOT be able to grade the BIO question.
    r_grade = client.post(
        f"/api/v1/attempts/{attempt.id}/grade_essay/",
        {"question": str(bio_q.id), "awarded_points": "5.00", "is_correct": True},
        format="json",
    )
    assert r_grade.status_code == 403, r_grade.data

    # And they CAN grade the Math question (sanity).
    r_grade_math = client.post(
        f"/api/v1/attempts/{attempt.id}/grade_essay/",
        {"question": str(math_q.id), "awarded_points": "5.00", "is_correct": True},
        format="json",
    )
    assert r_grade_math.status_code == 200, r_grade_math.data


def test_owner_can_grade_any_question(api_client):
    """Sanity: OWNER is not restricted by subject scope."""
    ctx = _build_tenant_with_two_subjects()
    assessment, question = _make_published_assessment_with_question(
        ctx["tenant"], ctx["bio"], ctx["grade_1"], teacher=ctx["teacher_bio"]
    )
    attempt = _make_attempt_with_essay(ctx["tenant"], assessment, ctx["student_g1"], question)

    client = login_as(api_client, ctx["owner"])
    r = client.post(
        f"/api/v1/attempts/{attempt.id}/grade_essay/",
        {"question": str(question.id), "awarded_points": "5.00", "is_correct": True},
        format="json",
    )
    assert r.status_code == 200, r.data


# ---------------------------------------------------------------------------
# S-7: StudentDetailView IDOR
# ---------------------------------------------------------------------------


def test_teacher_can_view_student_in_own_scope(api_client):
    """Sanity: Math-G1 teacher can see Math-G1's student."""
    ctx = _build_tenant_with_two_subjects()
    client = login_as(api_client, ctx["teacher_math"])
    r = client.get(f"/api/v1/students/{ctx['student_g1'].id}/")
    assert r.status_code == 200, r.data


def test_teacher_cannot_view_student_out_of_scope(api_client):
    """S-7 core: Math-G1 teacher must NOT see Math-G2's student."""
    ctx = _build_tenant_with_two_subjects()
    client = login_as(api_client, ctx["teacher_math"])
    r = client.get(f"/api/v1/students/{ctx['student_g2'].id}/")
    assert r.status_code == 403, r.data


def test_student_can_view_own_profile(api_client):
    """Sanity: student sees themselves."""
    ctx = _build_tenant_with_two_subjects()
    client = login_as(api_client, ctx["student_g1"])
    r = client.get(f"/api/v1/students/{ctx['student_g1'].id}/")
    assert r.status_code == 200, r.data


def test_student_cannot_view_other_student(api_client):
    """Sanity: student A cannot see student B (unchanged behavior)."""
    ctx = _build_tenant_with_two_subjects()
    client = login_as(api_client, ctx["student_g1"])
    r = client.get(f"/api/v1/students/{ctx['student_g2'].id}/")
    assert r.status_code == 403, r.data


def test_owner_can_view_any_student(api_client):
    """Sanity: OWNER is not restricted."""
    ctx = _build_tenant_with_two_subjects()
    client = login_as(api_client, ctx["owner"])
    for student in (ctx["student_g1"], ctx["student_g2"]):
        r = client.get(f"/api/v1/students/{student.id}/")
        assert r.status_code == 200, r.data


# ---------------------------------------------------------------------------
# Related: TeacherDetailView self-service fix
# ---------------------------------------------------------------------------


def test_teacher_can_view_own_profile(api_client):
    """The teacher should be able to see their own detail — needed by
    /settings/profile to render the teacher-context card."""
    ctx = _build_tenant_with_two_subjects()
    client = login_as(api_client, ctx["teacher_math"])
    r = client.get(f"/api/v1/teachers/{ctx['teacher_math'].id}/")
    assert r.status_code == 200, r.data


def test_teacher_cannot_view_other_teacher_profile(api_client):
    """But not another teacher's."""
    ctx = _build_tenant_with_two_subjects()
    client = login_as(api_client, ctx["teacher_math"])
    r = client.get(f"/api/v1/teachers/{ctx['teacher_bio'].id}/")
    assert r.status_code == 403, r.data


def test_owner_can_view_any_teacher(api_client):
    """Sanity: OWNER sees any teacher."""
    ctx = _build_tenant_with_two_subjects()
    client = login_as(api_client, ctx["owner"])
    for teacher in (ctx["teacher_math"], ctx["teacher_bio"]):
        r = client.get(f"/api/v1/teachers/{teacher.id}/")
        assert r.status_code == 200, r.data
