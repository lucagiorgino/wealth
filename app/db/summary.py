from datetime import date
from decimal import Decimal
from uuid import UUID

from app.db.occurrences import OCCURRENCES
from app.db.postgres import database_connection
from app.schemas.summary import (
    CategoryExpenses,
    CurrencyExpenses,
    ExpenseSummary,
    SubcategoryExpenses,
)


async def expense_summary(subject: str, year: int, as_of: date) -> ExpenseSummary:
    expenses, _, _ = await annual_summaries(subject, year, as_of)
    return expenses


async def annual_summaries(
    subject: str, year: int, as_of: date
) -> tuple[ExpenseSummary, ExpenseSummary, dict[str, list[Decimal]]]:
    start = date(year, 1, 1)
    horizon = min(as_of, date(year, 12, 31))
    monthly_sums = ", ".join(
        f"COALESCE(sum(amount) FILTER (WHERE EXTRACT(MONTH FROM occurrence_date) = {month}), 0)"
        for month in range(1, 13)
    )
    net_sums = ", ".join(
        "COALESCE(sum(CASE WHEN type = 'income' THEN amount ELSE -amount END) "
        f"FILTER (WHERE EXTRACT(MONTH FROM occurrence_date) = {month}), 0)"
        for month in range(1, 13)
    )
    async with database_connection() as connection:
        await connection.execute("SET TRANSACTION READ ONLY")
        cursor = await connection.execute(
            f"""
            WITH definitions AS (
                SELECT t.*, w.currency, c.name AS category_name,
                    s.name AS subcategory_name
                FROM transactions t
                JOIN wallets w
                    ON (w.id, w.owner_subject) = (t.source_wallet_id, t.owner_subject)
                JOIN categories c
                    ON (c.id, c.owner_subject) = (t.category_id, t.owner_subject)
                LEFT JOIN subcategories s
                    ON (s.id, s.category_id, s.owner_subject) =
                       (t.subcategory_id, t.category_id, t.owner_subject)
                WHERE t.owner_subject = %s AND t.type IN ('expense', 'income')
                    AND t.date <= %s AND %s::date <= %s::date
            ), occurrences AS (
                {OCCURRENCES}
            )
            SELECT type, currency, category_id, category_name, subcategory_id, subcategory_name,
                GROUPING(type) AS combined_total,
                GROUPING(category_id) AS currency_total,
                GROUPING(subcategory_id) AS category_total,
                ARRAY[{monthly_sums}] AS months, sum(amount) AS total,
                ARRAY[{net_sums}] AS net_months
            FROM occurrences WHERE occurrence_date BETWEEN %s AND %s
            GROUP BY GROUPING SETS (
                (currency),
                (type, currency),
                (type, currency, category_id, category_name),
                (type, currency, category_id, category_name, subcategory_id, subcategory_name)
            )
            ORDER BY currency, combined_total DESC, type, currency_total DESC,
                category_name, category_id, category_total DESC,
                subcategory_name NULLS FIRST, subcategory_id
            """,
            (subject, horizon, start, horizon, horizon, horizon, horizon, horizon, start, horizon),
        )
        rows = await cursor.fetchall()

    families: dict[str, dict[str, CurrencyExpenses]] = {"expense": {}, "income": {}}
    categories: dict[tuple[str, UUID], CategoryExpenses] = {}
    net_months = {}
    for row in rows:
        totals = {"months": row["months"], "total": row["total"]}
        currency = row["currency"]
        if row["combined_total"]:
            net_months[currency] = row["net_months"]
            continue
        currencies = families[row["type"]]
        if row["currency_total"]:
            currencies[currency] = CurrencyExpenses(currency=currency, categories=[], **totals)
        elif row["category_total"]:
            category = CategoryExpenses(
                id=row["category_id"], name=row["category_name"], subcategories=[], **totals
            )
            categories[currency, category.id] = category
            currencies[currency].categories.append(category)
        else:
            categories[currency, row["category_id"]].subcategories.append(
                SubcategoryExpenses(
                    id=row["subcategory_id"],
                    name=(
                        "Without subcategory"
                        if row["subcategory_id"] is None
                        else row["subcategory_name"]
                    ),
                    **totals,
                )
            )
    expenses, incomes = [
        ExpenseSummary(year=year, as_of=as_of, currencies=list(families[kind].values()))
        for kind in ("expense", "income")
    ]
    return expenses, incomes, net_months
