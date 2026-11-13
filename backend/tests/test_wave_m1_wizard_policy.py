"""Wave M1 (Milestone 1, Batch 4) — S-05 regression.

The wizard's Step 4 (Schedule) must persist `late_entry_minutes` and
`entry_cutoff_minutes` when the user submits. These were fully supported
in the backend but had no UI, so they could only be set via the API.
"""

import pytest

from apps.assessments.models import Assessment

from .conftest import login_as
from .factories import AssessmentFactory, UserFactory

pytestmark = pytest.mark.django_db


def test_patch_assessment_persists_late_entry_minutes(api_client):
    owner = UserFactory(role="OWNER")
    assessment = AssessmentFactory(tenant=owner.tenant, status="DRAFT")

    client = login_as(api_client, owner)
    r = client.patch(
        f"/api/v1/assessments/{assessment.id}/",
        {"late_entry_minutes": 30},
        format="json",
    )
    assert r.status_code == 200, r.data
    assessment.refresh_from_db()
    assert assessment.late_entry_minutes == 30


def test_patch_assessment_persists_entry_cutoff_minutes(api_client):
    owner = UserFactory(role="OWNER")
    assessment = AssessmentFactory(tenant=owner.tenant, status="DRAFT")

    client = login_as(api_client, owner)
    r = client.patch(
        f"/api/v1/assessments/{assessment.id}/",
        {"entry_cutoff_minutes": 10},
        format="json",
    )
    assert r.status_code == 200, r.data
    assessment.refresh_from_db()
    assert assessment.entry_cutoff_minutes == 10


def test_patch_assessment_clears_late_entry_minutes(api_client):
    """Passing null clears the field (wizard's "leave blank" path)."""
    owner = UserFactory(role="OWNER")
    assessment = AssessmentFactory(
        tenant=owner.tenant, status="DRAFT", late_entry_minutes=30
    )

    client = login_as(api_client, owner)
    r = client.patch(
        f"/api/v1/assessments/{assessment.id}/",
        {"late_entry_minutes": None},
        format="json",
    )
    assert r.status_code == 200, r.data
    assessment.refresh_from_db()
    assert assessment.late_entry_minutes is None


def test_assessment_response_includes_policy_fields(api_client):
    """The wizard's GET must return these fields so the form can hydrate."""
    owner = UserFactory(role="OWNER")
    assessment = AssessmentFactory(
        tenant=owner.tenant,
        status="DRAFT",
        late_entry_minutes=30,
        entry_cutoff_minutes=10,
    )

    client = login_as(api_client, owner)
    r = client.get(f"/api/v1/assessments/{assessment.id}/")
    assert r.status_code == 200
    assert r.data["late_entry_minutes"] == 30
    assert r.data["entry_cutoff_minutes"] == 10