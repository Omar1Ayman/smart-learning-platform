"""spec #34's 'Review & Publish' step: an assessment must be complete
(questions + targets, all still-approved) before it can go live."""

import pytest

from apps.assessments.models import Assessment, AssessmentQuestion, AssessmentTarget

from .conftest import login_as
from .factories import AssessmentFactory, GradeFactory, QuestionBankFactory, QuestionFactory, UserFactory

pytestmark = pytest.mark.django_db


def _link_question_and_target(assessment):
    bank = QuestionBankFactory(tenant=assessment.tenant)
    question = QuestionFactory(bank=bank, tenant=assessment.tenant, approved=True)
    AssessmentQuestion.objects.create(
        tenant=assessment.tenant, assessment=assessment, question=question, order=1
    )
    grade = GradeFactory(tenant=assessment.tenant)
    AssessmentTarget.objects.create(
        tenant=assessment.tenant, assessment=assessment, target_type="GRADE", grade=grade
    )
    return question


def test_cannot_publish_without_any_questions(api_client):
    owner = UserFactory(role="OWNER")
    assessment = AssessmentFactory(tenant=owner.tenant)
    grade = GradeFactory(tenant=owner.tenant)
    AssessmentTarget.objects.create(
        tenant=owner.tenant, assessment=assessment, target_type="GRADE", grade=grade
    )

    client = login_as(api_client, owner)
    resp = client.post(f"/api/v1/assessments/{assessment.id}/publish/")
    assert resp.status_code == 400
    assessment.refresh_from_db()
    assert assessment.status == Assessment.Status.DRAFT


def test_cannot_publish_without_any_targets(api_client):
    owner = UserFactory(role="OWNER")
    assessment = AssessmentFactory(tenant=owner.tenant)
    bank = QuestionBankFactory(tenant=owner.tenant)
    question = QuestionFactory(bank=bank, tenant=owner.tenant, approved=True)
    AssessmentQuestion.objects.create(tenant=owner.tenant, assessment=assessment, question=question, order=1)

    client = login_as(api_client, owner)
    resp = client.post(f"/api/v1/assessments/{assessment.id}/publish/")
    assert resp.status_code == 400


def test_publish_succeeds_once_complete(api_client):
    owner = UserFactory(role="OWNER")
    assessment = AssessmentFactory(tenant=owner.tenant)
    _link_question_and_target(assessment)

    client = login_as(api_client, owner)
    resp = client.post(f"/api/v1/assessments/{assessment.id}/publish/")
    assert resp.status_code == 200, resp.data
    assessment.refresh_from_db()
    assert assessment.status == Assessment.Status.PUBLISHED
    assert assessment.published_at is not None


def test_cannot_publish_an_already_published_assessment(api_client):
    owner = UserFactory(role="OWNER")
    assessment = AssessmentFactory(tenant=owner.tenant)
    _link_question_and_target(assessment)

    client = login_as(api_client, owner)
    assert client.post(f"/api/v1/assessments/{assessment.id}/publish/").status_code == 200
    assert client.post(f"/api/v1/assessments/{assessment.id}/publish/").status_code == 400


def test_publish_fails_if_a_linked_question_was_since_rejected(api_client):
    owner = UserFactory(role="OWNER")
    assessment = AssessmentFactory(tenant=owner.tenant)
    question = _link_question_and_target(assessment)
    question.review_status = "REJECTED"
    question.save(update_fields=["review_status"])

    client = login_as(api_client, owner)
    resp = client.post(f"/api/v1/assessments/{assessment.id}/publish/")
    assert resp.status_code == 400
