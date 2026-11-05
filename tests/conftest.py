import pytest
from fastapi.testclient import TestClient

from app.core.auth import get_auth0
from app.core.config import get_settings
from app.main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "")
    monkeypatch.setenv("AUTH0_DOMAIN", "")
    monkeypatch.setenv("AUTH0_AUDIENCE", "")
    get_settings.cache_clear()
    get_auth0.cache_clear()
    with TestClient(app) as test_client:
        yield test_client
    get_settings.cache_clear()
    get_auth0.cache_clear()
