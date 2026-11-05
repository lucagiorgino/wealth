from unittest.mock import AsyncMock

from app.api import health
from app.db.postgres import DatabaseUnavailable


def test_liveness_does_not_require_external_services(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readiness_reports_missing_database(client):
    response = client.get("/ready")
    assert response.status_code == 503
    assert response.json() == {"detail": "Database is unavailable"}


def test_readiness_reports_connected_database(client, monkeypatch):
    monkeypatch.setattr(health, "check_database", AsyncMock())
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_readiness_reports_connection_failure(client, monkeypatch):
    monkeypatch.setattr(
        health, "check_database", AsyncMock(side_effect=DatabaseUnavailable("failed"))
    )
    assert client.get("/ready").status_code == 503
