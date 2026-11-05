from datetime import date
from uuid import UUID

from app.db.occurrences import OCCURRENCES
from app.db.postgres import database_connection
from app.schemas.wallets import Wallet, WalletCreate, WalletList
from app.services.wallet_icons import InvalidWalletIcon


class WalletNotFound(Exception):
    pass


class WalletInUse(Exception):
    pass


class WalletCurrencyInUse(Exception):
    pass


async def wallet_in_use(connection, subject: str, wallet_id: UUID) -> bool:
    cursor = await connection.execute(
        "SELECT EXISTS(SELECT 1 FROM transactions WHERE owner_subject = %s "
        "AND (source_wallet_id = %s OR destination_wallet_id = %s)) AS used",
        (subject, wallet_id, wallet_id),
    )
    return (await cursor.fetchone())["used"]


async def wallet_page(
    connection,
    subject: str,
    page: int,
    page_size: int,
    as_of: date,
    wallet_id: UUID | None = None,
) -> list[Wallet]:
    cursor = await connection.execute(
        f"""
        WITH selected_wallets AS (
            SELECT id, name, colour, icon, type, favicon_png, initial_amount, currency, created_at
            FROM wallets WHERE owner_subject = %s AND (%s::uuid IS NULL OR id = %s)
            ORDER BY created_at, id LIMIT %s OFFSET %s
        ), definitions AS (
            SELECT t.* FROM transactions t WHERE t.owner_subject = %s
            AND (t.source_wallet_id IN (SELECT id FROM selected_wallets)
                 OR t.destination_wallet_id IN (SELECT id FROM selected_wallets))
        ), occurrences AS ({OCCURRENCES}), movements AS (
            SELECT source_wallet_id AS wallet_id,
                CASE WHEN type = 'income' THEN amount ELSE -amount END AS amount
            FROM occurrences WHERE occurrence_date <= %s
            UNION ALL
            SELECT destination_wallet_id AS wallet_id, amount
            FROM occurrences WHERE type = 'transfer' AND occurrence_date <= %s
        ), totals AS (
            SELECT wallet_id, sum(amount) AS amount FROM movements GROUP BY wallet_id
        )
        SELECT w.*, w.initial_amount + COALESCE(t.amount, 0) AS current_amount,
            %s::date AS balance_as_of
        FROM selected_wallets w LEFT JOIN totals t ON t.wallet_id = w.id
        ORDER BY w.created_at, w.id
        """,
        (subject, wallet_id, wallet_id, page_size, (page - 1) * page_size, subject, *(as_of,) * 7),
    )
    return [Wallet.model_validate(row) for row in await cursor.fetchall()]


async def create_wallet(
    owner_subject: str, data: WalletCreate, as_of: date, image: bytes | None = None
) -> Wallet:
    async with database_connection() as connection:
        await connection.execute(
            "INSERT INTO users (subject) VALUES (%s) ON CONFLICT (subject) DO NOTHING",
            (owner_subject,),
        )
        cursor = await connection.execute(
            """
            INSERT INTO wallets
                (owner_subject, name, colour, icon, initial_amount, currency, type, favicon_png)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, name, colour, icon, initial_amount, currency, type, favicon_png,
                created_at, initial_amount AS current_amount, %s::date AS balance_as_of
            """,
            (
                owner_subject,
                data.name,
                data.colour,
                data.icon,
                data.initial_amount,
                data.currency,
                data.type,
                image,
                as_of,
            ),
        )
        return Wallet.model_validate(await cursor.fetchone())


async def list_wallets(owner_subject: str, page: int, page_size: int, as_of: date) -> WalletList:
    async with database_connection() as connection:
        await connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        cursor = await connection.execute(
            "SELECT count(*) AS total FROM wallets WHERE owner_subject = %s",
            (owner_subject,),
        )
        totals = await cursor.fetchone()
        return WalletList(
            wallets=await wallet_page(connection, owner_subject, page, page_size, as_of),
            page=page,
            page_size=page_size,
            total=totals["total"],
        )


async def update_wallet(
    subject: str, wallet_id: UUID, data: WalletCreate, as_of: date, image: bytes | None = None
) -> Wallet:
    async with database_connection() as connection:
        cursor = await connection.execute(
            "SELECT currency, favicon_png FROM wallets "
            "WHERE id = %s AND owner_subject = %s FOR UPDATE",
            (wallet_id, subject),
        )
        existing = await cursor.fetchone()
        if existing is None:
            raise WalletNotFound
        if data.icon == "custom" and image is None:
            image = existing["favicon_png"]
            if image is None:
                raise InvalidWalletIcon
        if existing["currency"] != data.currency and await wallet_in_use(
            connection, subject, wallet_id
        ):
            raise WalletCurrencyInUse
        await connection.execute(
            "UPDATE wallets SET name = %s, colour = %s, icon = %s, initial_amount = %s, "
            "currency = %s, type = %s, favicon_png = %s WHERE id = %s AND owner_subject = %s",
            (
                data.name,
                data.colour,
                data.icon,
                data.initial_amount,
                data.currency,
                data.type,
                image,
                wallet_id,
                subject,
            ),
        )
        return (await wallet_page(connection, subject, 1, 1, as_of, wallet_id))[0]


async def delete_wallet(subject: str, wallet_id: UUID) -> None:
    async with database_connection() as connection:
        cursor = await connection.execute(
            "SELECT id FROM wallets WHERE id = %s AND owner_subject = %s FOR UPDATE",
            (wallet_id, subject),
        )
        if await cursor.fetchone() is None:
            raise WalletNotFound
        if await wallet_in_use(connection, subject, wallet_id):
            raise WalletInUse
        await connection.execute(
            "DELETE FROM wallets WHERE id = %s AND owner_subject = %s", (wallet_id, subject)
        )
