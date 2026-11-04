"""spec #30/#33: Assessment is independent of Course/QuestionBank, pulls
questions from the bank (APPROVED only), and targets students via its
own OR-across-rows rule set."""

import pytest
from django.db import IntegrityError, transaction

from apps.assessments.models import AssessmentTarget

from .conftest import login_as
from .factories import (
    AssessmentFactory,
    GradeFactory,
    QuestionBankFactory,
    QuestionFactory,
    TeacherUserFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def test_owner_can_create_a_draft_assessment(api_client):
    owner = UserFactory(role="OWNER")
    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/assessments/", {"title": "Biology Midterm", "assessment_type": "MIDTERM"}, format="json"
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["status"] == "DRAFT"


def test_teacher_can_create_an_assessment(api_client):
    teacher = TeacherUserFactory()
    client = login_as(api_client, teacher)
    resp = client.post(
        "/api/v1/assessments/", {"title": "Pop Quiz", "assessment_type": "QUIZ"}, format="json"
    )
    assert resp.status_code == 201, resp.data


def test_student_cannot_create_an_assessment(api_client):
    student = UserFactory(role="STUDENT")
    client = login_as(api_client, student)
    resp = client.post("/api/v1/assessments/", {"title": "Nope", "assessment_type": "QUIZ"}, format="json")
    assert resp.status_code == 403


def test_can_link_an_approved_question(api_client):
    bank = QuestionBankFactory()
    owner = UserFactory(tenant=bank.tenant, role="OWNER")
    assessment = AssessmentFactory(tenant=bank.tenant)
    question = QuestionFactory(bank=bank, tenant=bank.tenant, approved=True)

    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/assessment-questions/",
        {"assessment": str(assessment.id), "question": str(question.id), "order": 1},
        format="json",
    )
    assert resp.status_code == 201, resp.data


def test_cannot_link_a_pending_question(api_client):
    bank = QuestionBankFactory()
    owner = UserFactory(tenant=bank.tenant, role="OWNER")
    assessment = AssessmentFactory(tenant=bank.tenant)
    question = QuestionFactory(bank=bank, tenant=bank.tenant)  # defaults to PENDING

    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/assessment-questions/",
        {"assessment": str(assessment.id), "question": str(question.id), "order": 1},
        format="json",
    )
    assert resp.status_code == 400


def test_cannot_link_the_same_question_twice(api_client):
    bank = QuestionBankFactory()
    owner = UserFactory(tenant=bank.tenant, role="OWNER")
    assessment = AssessmentFactory(tenant=bank.tenant)
    question = QuestionFactory(bank=bank, tenant=bank.tenant, approved=True)

    client = login_as(api_client, owner)
    first = client.post(
        "/api/v1/assessment-questions/",
        {"assessment": str(assessment.id), "question": str(question.id), "order": 1},
        format="json",
    )
    assert first.status_code == 201
    second = client.post(
        "/api/v1/assessment-questions/",
        {"assessment": str(assessment.id), "question": str(question.id), "order": 2},
        format="json",
    )
    assert second.status_code == 400


def test_can_add_a_grade_target(api_client):
    grade = GradeFactory()
    owner = UserFactory(tenant=grade.tenant, role="OWNER")
    assessment = AssessmentFactory(tenant=grade.tenant)

    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/assessment-targets/",
        {"assessment": str(assessment.id), "target_type": "GRADE", "grade": str(grade.id)},
        format="json",
    )
    assert resp.status_code == 201, resp.data


def test_target_requires_the_matching_field(api_client):
    owner = UserFactory(role="OWNER")
    assessment = AssessmentFactory(tenant=owner.tenant)
    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/assessment-targets/",
        {"assessment": str(assessment.id), "target_type": "GRADE"},  # grade missing
        format="json",
    )
    assert resp.status_code == 400


def test_target_rejects_extra_fields_for_its_type(api_client):
    grade = GradeFactory()
    owner = UserFactory(tenant=grade.tenant, role="OWNER")
    assessment = AssessmentFactory(tenant=grade.tenant)
    student = UserFactory(tenant=grade.tenant, role="STUDENT")
    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/assessment-targets/",
        {
            "assessment": str(assessment.id),
            "target_type": "GRADE",
            "grade": str(grade.id),
            "student": str(student.id),  # not allowed alongside GRADE
        },
        format="json",
    )
    assert resp.status_code == 400


def test_db_constraint_blocks_malformed_target_even_bypassing_the_serializer():
    """The constraint is the real guarantee — prove it via direct ORM writes."""
    assessment = AssessmentFactory()
    with pytest.raises(IntegrityError), transaction.atomic():
        AssessmentTarget.objects.create(
            tenant=assessment.tenant,
            assessment=assessment,
            target_type=AssessmentTarget.TargetType.GRADE,
            grade=None,  # required for GRADE
        )


def test_question_from_another_tenant_cannot_be_linked(api_client):
    bank = QuestionBankFactory()
    owner = UserFactory(tenant=bank.tenant, role="OWNER")
    assessment = AssessmentFactory(tenant=bank.tenant)
    foreign_question = QuestionFactory(approved=True)  # independent tenant

    client = login_as(api_client, owner)
    resp = client.post(
        "/api/v1/assessment-questions/",
        {"assessment": str(assessment.id), "question": str(foreign_question.id), "order": 1},
        format="json",
    )
    assert resp.status_code == 400
