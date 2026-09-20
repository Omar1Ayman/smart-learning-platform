import pytest
from rest_framework.test import APIClient

from .factories import DEFAULT_TEST_PASSWORD


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
