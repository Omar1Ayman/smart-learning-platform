from io import StringIO

import pytest
from django.core.cache import cache
from django.core.management import call_command
from rest_framework.test import APIClient

from .factories import DEFAULT_TEST_PASSWORD


@pytest.fixture(autouse=True)
def _clear_cache_between_tests():
    """ScopedRateThrottle persists counters in Django's cache. Without an
    explicit clear between tests, a test that intentionally exhausts a
    throttle would leak that state into the next test and cause spurious
    429s. Autouse means every test gets a clean cache."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def _seed_billing_plans(db):
    call_command("seed_plans", verbosity=0, stdout=StringIO())


@pytest.fixture(autouse=True)
def _use_in_memory_email_backend(settings):
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"


@pytest.fixture
def api_client():
    return APIClient()


def login_as(client, user, password=DEFAULT_TEST_PASSWORD):
    """Logs in via the real /auth/login/ endpoint (not a shortcut like
    force_authenticate) so tests exercise the actual JWT issuance path,
    and attaches the returned access token to the client."""
    resp = client.post("/api/v1/auth/login/", {"email": user.email, "password": password}, format="json")
    assert resp.status_code == 200, resp.data
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}")
    return client


def enable_pro_features(tenant):
    from apps.billing.services import assign_plan

    return assign_plan(tenant, "pro", status="ACTIVE")


def make_teacher_in_scope_of(attempt, teacher):
    """S-6 helper — Wave Zero.

    After the S-6 fix, a TEACHER can only access an attempt's grading
    endpoints if either:
      (a) they are the assessment's `created_by`, OR
      (b) they have a TeacherAssignment matching the question bank's
          (subject, grade).

    Old tests that create a random TeacherUserFactory and expect to hit
    `/grading/` now 404. This helper makes option (a) explicit — the
    teacher becomes the assessment's creator — which is the realistic
    scenario "teacher grades their own assessment".

    Usage:
        teacher = TeacherUserFactory(tenant=group.tenant)
        make_teacher_in_scope_of(attempt, teacher)
        client = login_as(api_client, teacher)
        r = client.get(f"/api/v1/attempts/{attempt.id}/grading/")
    """
    attempt.assessment.created_by = teacher
    attempt.assessment.save(update_fields=["created_by"])