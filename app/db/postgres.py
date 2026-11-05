import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import psycopg
from psycopg.rows import dict_row

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class DatabaseUnavailable(RuntimeError):
    pass


@asynccontextmanager
async def database_connection() -> AsyncIterator[psycopg.AsyncConnection]:
    database_url = get_settings().database_url.get_secret_value()
    if not database_url:
        logger.error("DATABASE_URL must be configured")
        raise DatabaseUnavailable("Database is not configured")
    try:
        async with await psycopg.AsyncConnection.connect(
            database_url, connect_timeout=3, row_factory=dict_row
        ) as connection:
            yield connection
    except psycopg.Error as exc:
        logger.error("PostgreSQL operation failed (%s)", type(exc).__name__)
        raise DatabaseUnavailable("Database is unavailable") from None


async def check_database() -> None:
    async with database_connection() as connection:
        await connection.execute("SELECT 1")
