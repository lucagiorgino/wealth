import calendar
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime

import psycopg

from app.db.occurrences import OCCURRENCES, WALLET_MOVEMENTS
from app.db.postgres import database_connection


def next_month(month: date) -> date:
    return date(month.year + (month.month == 12), month.month % 12 + 1, 1)


def month_end(month: date) -> date:
    return month.replace(day=calendar.monthrange(month.year, month.month)[1])


async def lock_owner(connection, subject: str) -> None:
    await connection.execute(
        "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
        (f"asset-month-close:{subject}",),
    )


async def project_holdings(connection, subject: str, checkpoints: list[date | None], as_of: date):
    cursor = await connection.execute(
        f"""
        WITH periods AS (
            SELECT cutoff, ordinality::int - 1 AS period
            FROM unnest(%s::date[]) WITH ORDINALITY AS p(cutoff, ordinality)
        ), definitions AS (
            SELECT * FROM transactions WHERE owner_subject = %s
        ), occurrences AS ({OCCURRENCES}), movements AS ({WALLET_MOVEMENTS})
        SELECT w.id, w.name, 'cash' AS asset_group, w.currency, 'wallet' AS source,
            true AS active, p.period, CASE WHEN p.cutoff IS NULL THEN NULL
                ELSE COALESCE(s.amount, w.initial_amount) + COALESCE(sum(m.amount), 0) END AS amount
        FROM wallets w CROSS JOIN periods p
        LEFT JOIN asset_balance_snapshots s ON s.owner_subject = w.owner_subject
            AND s.source = 'wallet' AND s.source_id = w.id AND s.currency = w.currency
            AND s.month = date_trunc('month', p.cutoff)::date - interval '1 month'
        LEFT JOIN asset_snapshot_state st ON st.owner_subject = w.owner_subject
        LEFT JOIN movements m ON m.wallet_id = w.id AND m.movement_date <= p.cutoff
            AND ((s.amount IS NULL AND (st.through_month IS NULL
                OR st.through_month < date_trunc('month', p.cutoff)::date - interval '1 month'))
                OR m.movement_date >= date_trunc('month', p.cutoff)::date)
        WHERE w.owner_subject = %s
        GROUP BY w.id, p.period, p.cutoff, s.amount, st.through_month
        UNION ALL
        SELECT a.id, a.name, a.asset_group, a.currency, 'asset', true, p.period, v.amount
        FROM assets a CROSS JOIN periods p
        LEFT JOIN LATERAL (
            SELECT amount FROM asset_valuations
            WHERE asset_id = a.id AND owner_subject = %s AND date <= p.cutoff
            ORDER BY date DESC LIMIT 1
        ) v ON true
        WHERE a.owner_subject = %s
        ORDER BY currency, asset_group, name, id, period
        """,
        (checkpoints, subject, *(as_of,) * 4, subject, subject, subject),
    )
    return list(await cursor.fetchall())


async def ensure_snapshots(connection, subject: str, as_of: date, *, bootstrap: bool):
    cursor = await connection.execute(
        "SELECT started_month, through_month FROM asset_snapshot_state "
        "WHERE owner_subject = %s FOR UPDATE",
        (subject,),
    )
    state = await cursor.fetchone()
    initializing = state is None
    if initializing:
        if not bootstrap:
            return None
        cursor = await connection.execute(
            "SELECT min(origin) AS origin FROM ("
            "SELECT min(date) AS origin FROM transactions WHERE owner_subject = %s UNION ALL "
            "SELECT min(date) FROM asset_valuations WHERE owner_subject = %s UNION ALL "
            "SELECT min((created_at AT TIME ZONE 'UTC')::date) FROM wallets "
            "WHERE owner_subject = %s) dates",
            (subject, subject, subject),
        )
        origin = (await cursor.fetchone())["origin"]
        if origin is None:
            return None
        origin = min(origin, as_of)
        first = date(origin.year - 1, 12, 1) if origin.year > 1 else date(1, 1, 1)
        await connection.execute(
            "INSERT INTO asset_snapshot_state(owner_subject, started_month) VALUES (%s, %s)",
            (subject, first),
        )
        state = {"started_month": first, "through_month": None}
    current = as_of.replace(day=1)
    month = next_month(state["through_month"]) if state["through_month"] else state["started_month"]
    while month < current:
        # Seed old history together; subsequent closes must carry the previous frozen balance.
        months = [month]
        if initializing:
            while len(months) < 36 and next_month(months[-1]) < current:
                months.append(next_month(months[-1]))
        rows = await project_holdings(connection, subject, [month_end(m) for m in months], as_of)
        async with connection.cursor() as cursor:
            await cursor.executemany(
                "INSERT INTO asset_balance_snapshots "
                "(owner_subject, source, source_id, currency, month, name, asset_group, amount) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                [
                    (
                        subject,
                        row["source"],
                        row["id"],
                        row["currency"],
                        months[row["period"]],
                        row["name"],
                        row["asset_group"],
                        row["amount"],
                    )
                    for row in rows
                ],
            )
        state["through_month"] = months[-1]
        await connection.execute(
            "UPDATE asset_snapshot_state SET through_month = %s WHERE owner_subject = %s",
            (state["through_month"], subject),
        )
        month = next_month(months[-1])
    return state


@asynccontextmanager
async def financial_connection(subject: str) -> AsyncIterator[psycopg.AsyncConnection]:
    async with database_connection() as connection:
        await lock_owner(connection, subject)
        await ensure_snapshots(connection, subject, datetime.now(UTC).date(), bootstrap=False)
        yield connection


async def annual_holdings(subject: str, checkpoints: list[date | None], as_of: date):
    async with database_connection() as connection:
        await lock_owner(connection, subject)
        state = await ensure_snapshots(connection, subject, as_of, bootstrap=True)
        current = as_of.replace(day=1)
        available = [
            cutoff is not None
            and state is not None
            and state["started_month"] <= cutoff.replace(day=1) <= current
            for cutoff in checkpoints
        ]
        cursor = await connection.execute(
            """
            WITH periods AS (
                SELECT cutoff, ordinality::int - 1 AS period
                FROM unnest(%s::date[]) WITH ORDINALITY AS p(cutoff, ordinality)
            )
            SELECT s.source_id AS id, s.name, s.asset_group, s.currency, s.source,
                p.period, s.amount,
                CASE WHEN s.source = 'wallet' THEN EXISTS (
                    SELECT 1 FROM wallets w WHERE w.id = s.source_id
                    AND w.owner_subject = s.owner_subject AND w.currency = s.currency
                ) ELSE EXISTS (
                    SELECT 1 FROM assets a WHERE a.id = s.source_id
                    AND a.owner_subject = s.owner_subject AND a.currency = s.currency
                ) END AS active
            FROM asset_balance_snapshots s JOIN periods p
                ON s.month = date_trunc('month', p.cutoff)::date
            WHERE s.owner_subject = %s AND p.cutoff < %s
            ORDER BY p.period
            """,
            (checkpoints, subject, current),
        )
        rows = list(await cursor.fetchall())
        live = [
            cutoff if cutoff and cutoff.replace(day=1) == current else None
            for cutoff in checkpoints
        ]
        if any(live) or not any(available):
            projected = await project_holdings(connection, subject, live, as_of)
            rows.extend(row for row in projected if live[row["period"]] or not any(available))
        return rows, available


async def close_due_snapshots(as_of: date | None = None) -> int:
    as_of = as_of or datetime.now(UTC).date()
    async with database_connection() as connection:
        cursor = await connection.execute(
            "SELECT owner_subject FROM wallets UNION SELECT owner_subject FROM assets "
            "UNION SELECT owner_subject FROM asset_snapshot_state"
        )
        owners = [row["owner_subject"] for row in await cursor.fetchall()]
    for subject in owners:
        async with database_connection() as connection:
            await lock_owner(connection, subject)
            await ensure_snapshots(connection, subject, as_of, bootstrap=True)
    return len(owners)
