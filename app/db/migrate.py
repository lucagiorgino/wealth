import asyncio
import logging
from pathlib import Path

from app.db.postgres import DatabaseUnavailable, database_connection

logger = logging.getLogger(__name__)


async def migrate() -> None:
    async with database_connection() as connection:
        await connection.execute("SELECT pg_advisory_xact_lock(5745414)")
        await connection.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version text PRIMARY KEY,
                applied_at timestamptz NOT NULL DEFAULT now()
            )
            """
        )
        cursor = await connection.execute("SELECT version FROM schema_migrations")
        applied = {row["version"] for row in await cursor.fetchall()}
        for path in sorted(Path(__file__).with_name("migrations").glob("*.sql")):
            if path.name in applied:
                continue
            await connection.execute(path.read_text(encoding="utf-8"))
            await connection.execute(
                "INSERT INTO schema_migrations (version) VALUES (%s)", (path.name,)
            )
            logger.info("Applied migration %s", path.name)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    try:
        asyncio.run(migrate())
    except DatabaseUnavailable:
        logger.error("Database migration failed")
        raise SystemExit(1) from None
