from datetime import date
from uuid import UUID

from app.db.occurrences import OCCURRENCES
from app.db.postgres import database_connection
from app.schemas.assets import AssetCreate, AssetPosition, AssetValuationInput


class AssetNotFound(Exception):
    pass


async def create_asset(subject: str, data: AssetCreate) -> AssetPosition:
    async with database_connection() as connection:
        await connection.execute(
            "INSERT INTO users (subject) VALUES (%s) ON CONFLICT (subject) DO NOTHING", (subject,)
        )
        cursor = await connection.execute(
            "INSERT INTO assets (owner_subject, name, asset_group, currency) "
            "VALUES (%s, %s, %s, %s) "
            "RETURNING id, name, asset_group, currency",
            (subject, data.name, data.asset_group, data.currency),
        )
        position = AssetPosition.model_validate(await cursor.fetchone())
        await connection.execute(
            "INSERT INTO asset_valuations (asset_id, owner_subject, date, amount) "
            "VALUES (%s, %s, %s, %s)",
            (position.id, subject, data.date, data.amount),
        )
        return position


async def save_valuation(subject: str, asset_id: UUID, data: AssetValuationInput) -> None:
    async with database_connection() as connection:
        cursor = await connection.execute(
            "SELECT id FROM assets WHERE id = %s AND owner_subject = %s FOR UPDATE",
            (asset_id, subject),
        )
        if await cursor.fetchone() is None:
            raise AssetNotFound
        await connection.execute(
            "INSERT INTO asset_valuations (asset_id, owner_subject, date, amount) "
            "VALUES (%s, %s, %s, %s) ON CONFLICT (asset_id, date) "
            "DO UPDATE SET amount = EXCLUDED.amount",
            (asset_id, subject, data.date, data.amount),
        )


async def delete_asset(subject: str, asset_id: UUID) -> None:
    async with database_connection() as connection:
        cursor = await connection.execute(
            "DELETE FROM assets WHERE id = %s AND owner_subject = %s RETURNING id",
            (asset_id, subject),
        )
        if await cursor.fetchone() is None:
            raise AssetNotFound


async def annual_holdings(subject: str, checkpoints: list[date | None], as_of: date) -> list[dict]:
    async with database_connection() as connection:
        await connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        cursor = await connection.execute(
            f"""
            WITH periods AS (
                SELECT cutoff, ordinality::int - 1 AS period
                FROM unnest(%s::date[]) WITH ORDINALITY AS p(cutoff, ordinality)
            ), definitions AS (
                SELECT * FROM transactions WHERE owner_subject = %s
            ), occurrences AS ({OCCURRENCES}), movements AS (
                SELECT source_wallet_id AS wallet_id, occurrence_date,
                    CASE WHEN type = 'income' THEN amount ELSE -amount END AS amount
                FROM occurrences WHERE occurrence_date <= %s
                UNION ALL
                SELECT destination_wallet_id, occurrence_date, amount
                FROM occurrences WHERE type = 'transfer' AND occurrence_date <= %s
            )
            SELECT w.id, w.name, 'cash' AS asset_group, w.currency, 'wallet' AS source,
                p.period, CASE WHEN p.cutoff IS NULL THEN NULL
                    ELSE w.initial_amount + COALESCE(sum(m.amount), 0) END AS amount
            FROM wallets w CROSS JOIN periods p
            LEFT JOIN movements m ON m.wallet_id = w.id AND m.occurrence_date <= p.cutoff
            WHERE w.owner_subject = %s
            GROUP BY w.id, p.period, p.cutoff
            UNION ALL
            SELECT a.id, a.name, a.asset_group, a.currency, 'asset', p.period, v.amount
            FROM assets a CROSS JOIN periods p
            LEFT JOIN LATERAL (
                SELECT amount FROM asset_valuations
                WHERE asset_id = a.id AND owner_subject = %s AND date <= p.cutoff
                ORDER BY date DESC LIMIT 1
            ) v ON true
            WHERE a.owner_subject = %s
            ORDER BY currency, asset_group, name, id, period
            """,
            (checkpoints, subject, *(as_of,) * 6, subject, subject, subject),
        )
        return list(await cursor.fetchall())
