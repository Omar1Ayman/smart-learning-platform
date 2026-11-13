"""Wave 1 security fixes specific to the assessment builder — closing
student access to assessment-questions/targets, preventing cross-teacher
edits, and locking published assessments."""

import pytest

from apps.assessments.models import Assessment, AssessmentQuestion

from .conftest import login_as
from .factories import (
    AssessmentFactory,
    QuestionBankFactory,
    QuestionFactory,
    TeacherUserFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def _link(assessment, approved=True):
    bank = QuestionBankFactory(tenant=assessment.tenant)
    question = QuestionFactory(
        bank=bank, tenant=assessment.tenant, approved=approved, created_by=assessment.created_by
    )
    return AssessmentQuestion.objects.create(
        tenant=assessment.tenant, assessment=assessment, question=question, order=1
    )


# ---------- STUDENT is blocked entirely ----------


def test_student_cannot_list_assessment_questions(api_client):
    assessment = AssessmentFactory()
    _link(assessment)
    student = UserFactory(tenant=assessment.tenant, role="STUDENT")

    client = login_as(api_client, student)
    resp = client.get(f"/api/v1/assessment-questions/?assessment={assessment.id}")
    assert resp.status_code == 403


def test_student_cannot_list_assessment_targets(api_client):
    assessment = AssessmentFactory()
    student = UserFactory(tenant=assessment.tenant, role="STUDENT")

    client = login_as(api_client, student)
    resp = client.get(f"/api/v1/assessment-targets/?assessment={assessment.id}")
    assert resp.status_code == 403


# ---------- Cross-teacher isolation ----------


def test_teacher_cannot_add_question_to_another_teachers_draft(api_client):
    owner = TeacherUserFactory()
    teacher_a = TeacherUserFactory(tenant=owner.tenant)
    teacher_b = TeacherUserFactory(tenant=owner.tenant)
    assessment_b = AssessmentFactory(tenant=owner.tenant, created_by=teacher_b)
    bank = QuestionBankFactory(tenant=owner.tenant)
    question = QuestionFactory(bank=bank, tenant=owner.tenant, approved=True)

    client = login_as(api_client, teacher_a)
    resp = client.post(
        "/api/v1/assessment-questions/",
        {"assessment": str(assessment_b.id), "question": str(question.id), "order": 1},
        format="json",
    )
    assert resp.status_code == 403


def test_teacher_can_manage_their_own_draft(api_client):
    teacher = TeacherUserFactory()
    assessment = AssessmentFactory(tenant=teacher.tenant, created_by=teacher)
    bank = QuestionBankFactory(tenant=teacher.tenant)
    question = QuestionFactory(bank=bank, tenant=teacher.tenant, approved=True)

    client = login_as(api_client, teacher)
    resp = client.post(
        "/api/v1/assessment-questions/",
        {"assessment": str(assessment.id), "question": str(question.id), "order": 1},
        format="json",
    )
    assert resp.status_code == 201, resp.data


def test_teacher_cannot_delete_another_teachers_question_link(api_client):
    owner = TeacherUserFactory()
    teacher_a = TeacherUserFactory(tenant=owner.tenant)
    teacher_b = TeacherUserFactory(tenant=owner.tenant)
    assessment_b = AssessmentFactory(tenant=owner.tenant, created_by=teacher_b)
    link = _link(assessment_b)

    client = login_as(api_client, teacher_a)
    resp = client.delete(f"/api/v1/assessment-questions/{link.id}/")
    # 404 because teacher_a's queryset never includes teacher_b's links
    assert resp.status_code in (403, 404)


# ---------- Published assessments are locked ----------


def test_teacher_cannot_add_question_to_published_assessment(api_client):
    teacher = TeacherUserFactory()
    assessment = AssessmentFactory(tenant=teacher.tenant, created_by=teacher)
    assessment.status = Assessment.Status.PUBLISHED
    assessment.save(update_fields=["status"])
    bank = QuestionBankFactory(tenant=teacher.tenant)
    question = QuestionFactory(bank=bank, tenant=teacher.tenant, approved=True)

    client = login_as(api_client, teacher)
    resp = client.post(
        "/api/v1/assessment-questions/",
        {"assessment": str(assessment.id), "question": str(question.id), "order": 1},
        format="json",
    )
    assert resp.status_code == 403
