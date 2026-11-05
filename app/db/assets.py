from uuid import UUID

from app.db.asset_snapshots import annual_holdings as annual_holdings
from app.db.asset_snapshots import financial_connection
from app.schemas.assets import AssetCreate, AssetPosition, AssetValuationInput


class AssetNotFound(Exception):
    pass


async def create_asset(subject: str, data: AssetCreate) -> AssetPosition:
    async with financial_connection(subject) as connection:
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
    async with financial_connection(subject) as connection:
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
    async with financial_connection(subject) as connection:
        cursor = await connection.execute(
            "DELETE FROM assets WHERE id = %s AND owner_subject = %s RETURNING id",
            (asset_id, subject),
        )
        if await cursor.fetchone() is None:
            raise AssetNotFound
