import calendar
import json
from datetime import date

from app.db.occurrences import OCCURRENCES
from app.db.postgres import database_connection
from app.schemas.summary import ExpenseComparisonInput


async def comparison_totals(subject: str, data: ExpenseComparisonInput, as_of: date) -> list[dict]:
    periods = []
    for index, period in enumerate(data.periods):
        start = date(period.year, period.month or 1, 1)
        end = date(
            period.end_year or period.year,
            period.month or 12,
            calendar.monthrange(period.year, period.month or 12)[1],
        )
        divisor = period.end_year - period.year + 1 if data.kind == "average" else 1
        periods.append(
            {
                "index": index,
                "start": start.isoformat(),
                "end": min(end, as_of).isoformat(),
                "divisor": divisor,
            }
        )
    horizon = max(date.fromisoformat(period["end"]) for period in periods)
    async with database_connection() as connection:
        await connection.execute("SET TRANSACTION READ ONLY")
        cursor = await connection.execute(
            f"""
            WITH periods AS (
                SELECT * FROM jsonb_to_recordset(%s::jsonb)
                    AS p(index int, start date, "end" date, divisor int)
            ), definitions AS (
                SELECT t.*, w.currency, c.name AS category_name
                FROM transactions t
                JOIN wallets w
                    ON (w.id, w.owner_subject) = (t.source_wallet_id, t.owner_subject)
                JOIN categories c
                    ON (c.id, c.owner_subject) = (t.category_id, t.owner_subject)
                WHERE t.owner_subject = %s AND t.type = 'expense' AND t.date <= %s
            ), occurrences AS (
                {OCCURRENCES}
            )
            SELECT p.index, o.currency, o.category_id, o.category_name,
                GROUPING(o.category_id) AS currency_total,
                -- Round the exact ratio once; numeric division can otherwise round twice.
                CASE WHEN %s = 'average' THEN sign(sum(o.amount)) * (
                    div(abs(sum(o.amount)) * 1000000000000000000, p.divisor)
                    + CASE WHEN mod(abs(sum(o.amount)) * 1000000000000000000, p.divisor) * 2
                        >= p.divisor THEN 1 ELSE 0 END
                    ) * 0.000000000000000001
                    ELSE sum(o.amount) END AS amount
            FROM occurrences o JOIN periods p ON o.occurrence_date BETWEEN p.start AND p."end"
            GROUP BY GROUPING SETS (
                (p.index, p.divisor, o.currency),
                (p.index, p.divisor, o.currency, o.category_id, o.category_name)
            )
            ORDER BY o.currency, currency_total DESC, o.category_name, o.category_id, p.index
            """,
            (json.dumps(periods), subject, horizon, horizon, horizon, horizon, horizon, data.kind),
        )
        return await cursor.fetchall()
