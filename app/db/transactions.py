from datetime import date
from uuid import UUID

from app.db.asset_snapshots import financial_connection
from app.db.occurrences import OCCURRENCES
from app.db.postgres import database_connection
from app.schemas.transactions import (
    Transaction,
    TransactionFilters,
    TransactionInput,
    TransactionList,
    TransactionOccurrence,
    TransactionOptions,
    TransactionSummary,
)
from app.services.transaction_summary import transaction_charts


class TransactionNotFound(Exception):
    pass


class TransactionReferenceNotFound(Exception):
    pass


class TransferCurrencyMismatch(Exception):
    pass


class TransactionCategoryMismatch(Exception):
    pass


async def check_category_kind(connection, subject: str, data: TransactionInput) -> None:
    if data.type == "balance_adjustment":
        return
    cursor = await connection.execute(
        "SELECT kind FROM categories WHERE id = %s AND owner_subject = %s FOR KEY SHARE",
        (data.category_id, subject),
    )
    category = await cursor.fetchone()
    if category is None:
        raise TransactionReferenceNotFound
    expected = "income" if data.type == "income" else "expense"
    if category["kind"] != expected:
        raise TransactionCategoryMismatch


async def check_transfer_currency(connection, subject: str, data: TransactionInput) -> None:
    if data.type != "transfer":
        return
    cursor = await connection.execute(
        "SELECT currency FROM wallets WHERE owner_subject = %s AND id = ANY(%s) "
        "ORDER BY id FOR SHARE",
        (subject, [data.source_wallet_id, data.destination_wallet_id]),
    )
    rows = await cursor.fetchall()
    if len(rows) != 2:
        raise TransactionReferenceNotFound
    if rows[0]["currency"] != rows[1]["currency"]:
        raise TransferCurrencyMismatch


FIELDS = (
    "description",
    "amount",
    "date",
    "type",
    "source_wallet_id",
    "destination_wallet_id",
    "category_id",
    "subcategory_id",
    "recurrence",
    "recurrence_count",
)
RETURNING = "id, created_at, is_pinned, " + ", ".join(FIELDS)


async def insert_transaction(connection, subject: str, data: TransactionInput) -> Transaction:
    await check_category_kind(connection, subject, data)
    await check_transfer_currency(connection, subject, data)
    cursor = await connection.execute(
        f"INSERT INTO transactions (owner_subject, {', '.join(FIELDS)}) "
        f"VALUES (%s, {', '.join(['%s'] * len(FIELDS))}) RETURNING {RETURNING}",
        (subject, *(getattr(data, field) for field in FIELDS)),
    )
    return Transaction.model_validate(await cursor.fetchone())


async def wallet_options(subject: str) -> TransactionOptions:
    async with database_connection() as connection:
        cursor = await connection.execute(
            "SELECT id, name, currency, colour, icon, favicon_png FROM wallets "
            "WHERE owner_subject = %s ORDER BY name, id",
            (subject,),
        )
        return TransactionOptions(wallets=await cursor.fetchall())


async def save_transaction(
    subject: str, data: TransactionInput, transaction_id: UUID | None = None
) -> Transaction:
    async with financial_connection(subject) as connection:
        if transaction_id is not None:
            cursor = await connection.execute(
                "SELECT id FROM transactions WHERE id = %s AND owner_subject = %s FOR UPDATE",
                (transaction_id, subject),
            )
            if await cursor.fetchone() is None:
                raise TransactionNotFound
        if transaction_id is None:
            await check_references(connection, subject, data)
            return await insert_transaction(connection, subject, data)
        return await update_transaction(connection, subject, data, transaction_id)


async def check_references(connection, subject: str, data: TransactionInput) -> None:
    references = [("wallets", data.source_wallet_id)]
    if data.category_id is not None:
        references.append(("categories", data.category_id))
    if data.destination_wallet_id is not None:
        references.append(("wallets", data.destination_wallet_id))
    for table, item_id in references:
        cursor = await connection.execute(
            f"SELECT id FROM {table} WHERE id = %s AND owner_subject = %s FOR KEY SHARE",
            (item_id, subject),
        )
        if await cursor.fetchone() is None:
            raise TransactionReferenceNotFound
    if data.subcategory_id is not None:
        cursor = await connection.execute(
            "SELECT id FROM subcategories WHERE id = %s AND category_id = %s "
            "AND owner_subject = %s FOR KEY SHARE",
            (data.subcategory_id, data.category_id, subject),
        )
        if await cursor.fetchone() is None:
            raise TransactionReferenceNotFound


async def update_transaction(
    connection, subject: str, data: TransactionInput, transaction_id: UUID
) -> Transaction:
    await check_references(connection, subject, data)
    await check_category_kind(connection, subject, data)
    await check_transfer_currency(connection, subject, data)
    cursor = await connection.execute(
        f"UPDATE transactions SET {', '.join(f'{field} = %s' for field in FIELDS)} "
        f"WHERE id = %s AND owner_subject = %s RETURNING {RETURNING}",
        (*(getattr(data, field) for field in FIELDS), transaction_id, subject),
    )
    return Transaction.model_validate(await cursor.fetchone())


async def lock_transactions(connection, subject: str, ids: list[UUID]) -> list[dict]:
    cursor = await connection.execute(
        f"SELECT {RETURNING} FROM transactions WHERE owner_subject = %s AND id = ANY(%s) "
        "ORDER BY id FOR UPDATE",
        (subject, ids),
    )
    rows = await cursor.fetchall()
    if len(rows) != len(ids):
        raise TransactionNotFound
    return rows


async def pin_transactions(connection, subject: str, ids: list[UUID], pinned: bool) -> None:
    await connection.execute(
        "UPDATE transactions SET is_pinned = %s WHERE owner_subject = %s AND id = ANY(%s)",
        (pinned, subject, ids),
    )


async def delete_transactions(subject: str, ids: list[UUID]) -> None:
    async with financial_connection(subject) as connection:
        await lock_transactions(connection, subject, ids)
        await connection.execute(
            "DELETE FROM transactions WHERE owner_subject = %s AND id = ANY(%s)", (subject, ids)
        )


async def get_transaction(subject: str, transaction_id: UUID) -> Transaction:
    async with database_connection() as connection:
        cursor = await connection.execute(
            f"SELECT {RETURNING} FROM transactions WHERE id = %s AND owner_subject = %s",
            (transaction_id, subject),
        )
        row = await cursor.fetchone()
        if row is None:
            raise TransactionNotFound
        return Transaction.model_validate(row)


async def delete_transaction(subject: str, transaction_id: UUID) -> None:
    async with financial_connection(subject) as connection:
        cursor = await connection.execute(
            "DELETE FROM transactions WHERE id = %s AND owner_subject = %s RETURNING id",
            (transaction_id, subject),
        )
        if await cursor.fetchone() is None:
            raise TransactionNotFound


async def list_transactions(
    subject: str, filters: TransactionFilters, as_of: date
) -> TransactionList:
    conditions = ["t.owner_subject = %s"]
    parameters: list[object] = [subject]
    for field in ("type", "category_id", "subcategory_id"):
        value = getattr(filters, field)
        if value is not None:
            conditions.append(f"t.{field} = %s")
            parameters.append(value)
    if filters.wallet_id is not None:
        conditions.append("(t.source_wallet_id = %s OR t.destination_wallet_id = %s)")
        parameters.extend([filters.wallet_id, filters.wallet_id])
    if filters.q:
        conditions.append("strpos(lower(t.description), lower(%s)) > 0")
        parameters.append(filters.q)

    occurrence_conditions = ["(n = 0 OR occurrence_date <= %s)"]
    occurrence_parameters: list[object] = [as_of]
    for field, operator in (("date_from", ">="), ("date_to", "<=")):
        value = getattr(filters, field)
        if value is not None:
            occurrence_conditions.append(f"occurrence_date {operator} %s")
            occurrence_parameters.append(value)
    query = f"""
        WITH definitions AS (
            SELECT t.*, w.name AS source_wallet_name, w.currency,
                d.name AS destination_wallet_name,
                c.name AS category_name, s.name AS subcategory_name
            FROM transactions t
            JOIN wallets w ON (w.id, w.owner_subject) = (t.source_wallet_id, t.owner_subject)
            LEFT JOIN wallets d
                ON (d.id, d.owner_subject) = (t.destination_wallet_id, t.owner_subject)
            LEFT JOIN categories c ON (c.id, c.owner_subject) = (t.category_id, t.owner_subject)
            LEFT JOIN subcategories s
                ON (s.id, s.category_id, s.owner_subject) =
                   (t.subcategory_id, t.category_id, t.owner_subject)
            WHERE {" AND ".join(conditions)}
        ), occurrences AS (
            {OCCURRENCES}
        )
        SELECT * FROM occurrences WHERE {" AND ".join(occurrence_conditions)}
    """
    all_parameters = (*parameters, as_of, as_of, as_of, as_of, *occurrence_parameters)
    async with database_connection() as connection:
        await connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        cursor = await connection.execute(
            f"""
            WITH filtered AS ({query}), currency_totals AS (
                SELECT currency,
                    COALESCE(sum(amount) FILTER (WHERE type = 'income'), 0)::text AS income,
                    COALESCE(sum(amount) FILTER (WHERE type = 'expense'), 0)::text AS expense,
                    COALESCE(sum(amount) FILTER (WHERE type = 'transfer'), 0)::text AS transfer,
                    COALESCE(sum(CASE type WHEN 'income' THEN amount
                        WHEN 'expense' THEN -amount ELSE 0 END), 0)::text AS net
                FROM filtered GROUP BY currency
            ), wallet_totals AS (
                SELECT source_wallet_id AS wallet_id, source_wallet_name AS wallet_name,
                    currency, sum(amount)::text AS amount
                FROM filtered WHERE type = 'expense'
                GROUP BY source_wallet_id, source_wallet_name, currency
            ), category_totals AS (
                SELECT type, category_id, category_name, currency,
                    sum(amount)::text AS amount
                FROM filtered WHERE type IN ('income', 'expense')
                GROUP BY type, category_id, category_name, currency
            )
            SELECT (SELECT count(*) FROM filtered) AS total,
                COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY currency)
                    FROM currency_totals c), '[]'::jsonb) AS currencies,
                COALESCE((SELECT jsonb_agg(to_jsonb(w) ORDER BY wallet_name, wallet_id)
                    FROM wallet_totals w), '[]'::jsonb) AS wallet_expenses,
                COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY category_name, category_id)
                    FROM category_totals c), '[]'::jsonb) AS categories
            """,
            all_parameters,
        )
        totals = await cursor.fetchone()
        cursor = await connection.execute(
            f"{query} ORDER BY is_pinned DESC, occurrence_date DESC, created_at DESC, "
            "id, occurrence_number LIMIT %s OFFSET %s",
            (*all_parameters, filters.page_size, (filters.page - 1) * filters.page_size),
        )
        rows = await cursor.fetchall()
        for row in rows:
            del row["owner_subject"]
            del row["n"]
            del row["category_kind"]
        return TransactionList(
            transactions=[TransactionOccurrence.model_validate(row) for row in rows],
            page=filters.page,
            page_size=filters.page_size,
            total=totals["total"],
            as_of=as_of,
            summary=TransactionSummary(
                currencies=totals["currencies"],
                wallet_expenses=totals["wallet_expenses"],
                charts=transaction_charts(totals["currencies"], totals["categories"]),
            ),
        )
