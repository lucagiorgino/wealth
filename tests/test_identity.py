from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException

from app.core import auth


@pytest.mark.parametrize("authorization", [None, "Basic credentials", "Bearer"])
def test_identity_rejects_missing_bearer_token(client, authorization):
    headers = {"Authorization": authorization} if authorization else {}
    response = client.get("/api/v1/me", headers=headers)
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert "no-store" in response.headers["cache-control"]


def test_identity_fails_closed_without_auth_configuration(client):
    response = client.get("/api/v1/me", headers={"Authorization": "Bearer invalid"})
    assert response.status_code == 503


def test_identity_sdk_rejects_malformed_token(client, monkeypatch):
    monkeypatch.setenv("AUTH0_DOMAIN", "tenant.example.test")
    monkeypatch.setenv("AUTH0_AUDIENCE", "https://wealth.example.test")
    auth.get_settings.cache_clear()
    response = client.get("/api/v1/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid access token"}


def test_identity_returns_only_verified_subject(client, monkeypatch):
    verify = AsyncMock(return_value={"sub": "auth0|example", "private_claim": "not-returned"})
    monkeypatch.setattr(auth, "get_auth0", Mock(return_value=Mock(require_auth=lambda: verify)))
    response = client.get("/api/v1/me", headers={"Authorization": "Bearer sdk-verified-token"})
    assert response.status_code == 200
    assert response.json() == {"subject": "auth0|example"}
    verify.assert_awaited_once()


@pytest.mark.parametrize("claims", [{}, {"sub": ""}, {"sub": 123}])
def test_identity_rejects_verified_token_without_subject(client, monkeypatch, claims):
    verify = AsyncMock(return_value=claims)
    monkeypatch.setattr(auth, "get_auth0", Mock(return_value=Mock(require_auth=lambda: verify)))
    assert client.get("/api/v1/me", headers={"Authorization": "Bearer token"}).status_code == 401


def test_identity_preserves_sdk_rejection(client, monkeypatch):
    verify = AsyncMock(side_effect=HTTPException(status_code=401, detail="Invalid token"))
    monkeypatch.setattr(auth, "get_auth0", Mock(return_value=Mock(require_auth=lambda: verify)))
    assert client.get("/api/v1/me", headers={"Authorization": "Bearer invalid"}).status_code == 401


def test_identity_surfaces_provider_failure_without_internal_details(client, monkeypatch):
    verify = AsyncMock(side_effect=HTTPException(status_code=500, detail="provider internals"))
    monkeypatch.setattr(auth, "get_auth0", Mock(return_value=Mock(require_auth=lambda: verify)))
    response = client.get("/api/v1/me", headers={"Authorization": "Bearer token"})
    assert response.status_code == 503
    assert response.json() == {"detail": "Authentication service is unavailable"}
