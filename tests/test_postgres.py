import asyncio
import os

import psycopg
import pytest

from app.core.config import get_settings
from app.db.postgres import DatabaseUnavailable, check_database


def test_database_failure_does_not_expose_connection_string(monkeypatch, caplog):
    async def unavailable(*args, **kwargs):
        raise psycopg.OperationalError("connection string with private credentials")

    monkeypatch.setenv("DATABASE_URL", "postgresql://example:private@localhost/wealth")
    get_settings.cache_clear()
    monkeypatch.setattr(psycopg.AsyncConnection, "connect", unavailable)
    try:
        with pytest.raises(DatabaseUnavailable, match="Database is unavailable"):
            asyncio.run(check_database())
        assert "private" not in caplog.text
        assert "OperationalError" in caplog.text
    finally:
        get_settings.cache_clear()


@pytest.mark.integration
def test_postgres_readiness(monkeypatch):
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set TEST_DATABASE_URL to a dedicated PostgreSQL test database")
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()
    try:
        asyncio.run(check_database())
    finally:
        get_settings.cache_clear()
