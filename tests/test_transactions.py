import asyncio
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
from uuid import uuid4

import psycopg
import pytest

from app.core.auth import require_identity
from app.core.config import get_settings
from app.db import summary, transaction_imports, transactions, wallets
from app.db.migrate import migrate
from app.db.postgres import DatabaseUnavailable, database_connection
from app.main import app
from app.schemas.summary import ExpenseComparisonInput, ExpenseSummary
from app.schemas.transactions import TransactionFilters
from app.services.import_formats import detect_date_order, normalize_amount, normalize_date
from app.services.summary import (
    chart_aggregates,
    expense_charts,
    expense_comparison,
    money_axis_ticks,
    plot_points,
)
from app.services.transaction_imports import InvalidTransactionCSV, parse_csv

WALLET = {"name": "Everyday", "colour": "#123abc", "icon": "wallet"}
CATEGORY = {"name": "General", "colour": "#123abc", "icon": "house"}
DATA = {
    "description": " Lunch ",
    "amount": "12.1234567890123456789",
    "date": "2026-01-31",
    "type": "expense",
    "source_wallet_id": str(uuid4()),
    "category_id": str(uuid4()),
}


@pytest.mark.parametrize(
    "payload",
    [
        {"ids": [], "changes": {"is_pinned": True}},
        {"ids": [str(uuid4())] * 2, "changes": {"is_pinned": True}},
        {"ids": [str(uuid4()) for _ in range(101)], "changes": {"is_pinned": True}},
        {"ids": [str(uuid4())], "changes": {}},
        {"ids": [str(uuid4())], "changes": {"amount": 1.5}},
        {"ids": [str(uuid4())], "changes": {"description": None}},
        {"ids": [str(uuid4())], "changes": {"is_pinned": "true"}},
        {"ids": [str(uuid4())], "changes": {"date": "2026-01-01T00:00:00"}},
        {"ids": [str(uuid4())], "changes": {"owner_subject": "forged"}},
        {"ids": [str(uuid4())], "changes": {"is_pinned": True}, "owner_subject": "forged"},
    ],
)
def test_bulk_transaction_inputs_are_closed_and_bounded(transaction_client, payload):
    client, _ = transaction_client
    response = client.patch("/api/v1/transactions/bulk", json=payload)
    assert response.status_code == 422
    assert response.headers["cache-control"] == "private, no-store"


@pytest.mark.integration
def test_bulk_transactions_are_atomic_owned_and_validate_each_merged_record(transaction_database):
    client, identity, owners, data, _ = transaction_database
    expense = client.post("/api/v1/transactions", json=data).json()
    income = client.post(
        "/api/v1/transactions", json={**data, "type": "income", **income_reference(client)}
    ).json()
    ids = [expense["id"], income["id"]]
    invalid = client.patch(
        "/api/v1/transactions/bulk", json={"ids": ids, "changes": {"amount": "-2"}}
    )
    assert invalid.status_code == 422
    assert client.get(f"/api/v1/transactions/{expense['id']}").json() == expense
    result = client.patch(
        "/api/v1/transactions/bulk",
        json={
            "ids": ids,
            "changes": {"description": "Together", "amount": "99.000000000000000001"},
        },
    )
    assert result.status_code == 200 and result.json() == {"count": 2}
    for item in ids:
        saved = client.get(f"/api/v1/transactions/{item}").json()
        assert saved["amount"] == "99.000000000000000001"
        assert saved["description"] == "Together"
    identity["sub"] = owners[1]
    for method, payload in [
        ("PATCH", {"ids": ids, "changes": {"is_pinned": True}}),
        ("DELETE", {"ids": ids}),
    ]:
        assert client.request(method, "/api/v1/transactions/bulk", json=payload).status_code == 404
    identity["sub"] = owners[0]
    for method, payload in [
        ("PATCH", {"ids": [ids[0], str(uuid4())], "changes": {"description": "Forbidden"}}),
        ("DELETE", {"ids": [ids[0], str(uuid4())]}),
    ]:
        assert client.request(method, "/api/v1/transactions/bulk", json=payload).status_code == 404
    assert client.get(f"/api/v1/transactions/{ids[0]}").json()["description"] == "Together"
    deleted = client.request("DELETE", "/api/v1/transactions/bulk", json={"ids": ids})
    assert deleted.status_code == 200 and deleted.json() == {"count": 2}
    assert client.get("/api/v1/transactions").json()["total"] == 0


@pytest.mark.integration
def test_bulk_transaction_failure_after_first_write_rolls_back(transaction_database, monkeypatch):
    client, _, _, data, _ = transaction_database
    ids = [client.post("/api/v1/transactions", json=data).json()["id"] for _ in range(2)]
    update = transactions.update_transaction
    calls = 0

    async def failing_update(*args):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise transactions.TransactionCategoryMismatch
        return await update(*args)

    monkeypatch.setattr(transactions, "update_transaction", failing_update)
    assert (
        client.patch(
            "/api/v1/transactions/bulk", json={"ids": ids, "changes": {"description": "Rollback"}}
        ).status_code
        == 422
    )
    assert calls == 2
    for item in ids:
        assert client.get(f"/api/v1/transactions/{item}").json()["description"] == "Lunch"


@pytest.mark.integration
def test_pins_persist_for_series_sort_before_pagination_and_preserve_totals(transaction_database):
    client, _, _, data, _ = transaction_database
    series = client.post(
        "/api/v1/transactions",
        json={**data, "date": "2000-01-31", "recurrence": "monthly", "recurrence_count": 2},
    ).json()
    for day in range(1, 12):
        assert (
            client.post(
                "/api/v1/transactions", json={**data, "date": f"2001-01-{day:02d}"}
            ).status_code
            == 201
        )
    before = client.get("/api/v1/transactions").json()
    assert not series["is_pinned"]
    assert (
        client.patch(
            "/api/v1/transactions/bulk",
            json={"ids": [series["id"]], "changes": {"is_pinned": True}},
        ).status_code
        == 200
    )
    listing = client.get("/api/v1/transactions?page_size=1").json()
    assert listing["transactions"][0]["id"] == series["id"]
    assert listing["transactions"][0]["is_pinned"] is True
    assert listing["summary"] == before["summary"] and listing["total"] == before["total"]
    assert (
        client.put(
            f"/api/v1/transactions/{series['id']}",
            json={**data, "date": "2000-01-31", "recurrence": "monthly", "recurrence_count": 2},
        ).json()["is_pinned"]
        is True
    )
    rows = client.get("/api/v1/transactions?page_size=100").json()["transactions"]
    assert [row["is_pinned"] for row in rows[:3]] == [True, True, False]
    assert (
        client.request(
            "DELETE", "/api/v1/transactions/bulk", json={"ids": [series["id"]]}
        ).status_code
        == 200
    )
    assert client.get("/api/v1/transactions").json()["total"] == 11


def test_signed_plot_points_normalize_by_exact_absolute_magnitude():
    amount = Decimal("-123456789012345678901234567890123456789.123456789012345678")
    points = plot_points(
        [
            ("refund", "Refund", amount),
            ("expense", "Expense", Decimal("1")),
            ("zero", "Zero", Decimal(0)),
        ]
    )
    assert [point.value for point in points] == [-10000, 0, 0]
    assert points[0].amount == amount


@pytest.mark.parametrize(
    ("amounts", "total", "average"),
    [
        ([], "0", "0"),
        (["-0.000000000000000001", "0"], "-0.000000000000000001", "-0.000000000000000001"),
        (["1", "0", "0"], "1", "0.333333333333333333"),
        (
            ["123456789012345678901234567890.123456789012345678", "0.000000000000000001"],
            "123456789012345678901234567890.123456789012345679",
            "61728394506172839450617283945.061728394506172840",
        ),
    ],
)
def test_chart_aggregates_preserve_exact_sums_and_round_average_once(amounts, total, average):
    result = chart_aggregates([Decimal(amount) for amount in amounts])
    assert result == (Decimal(total), Decimal(average))
    assert [
        point.value for point in plot_points([("a", "A", Decimal("-2")), ("b", "B", Decimal("-4"))])
    ] == [-5000, -10000]


def income_reference(client):
    response = client.post(
        "/api/v1/categories", json={**CATEGORY, "name": "Salary", "kind": "income"}
    )
    assert response.status_code == 201
    return {"category_id": response.json()["id"], "subcategory_id": None}


def test_signed_comparison_ranking_includes_absent_zero_periods(monkeypatch):
    missing, present = uuid4(), uuid4()

    async def totals(*args):
        return [
            {"currency": "EUR", "index": 0, "currency_total": 1, "amount": Decimal("-11")},
            {"currency": "EUR", "index": 1, "currency_total": 1, "amount": Decimal("-1")},
            {
                "currency": "EUR",
                "index": 0,
                "currency_total": 0,
                "category_id": missing,
                "category_name": "Z absent",
                "amount": Decimal("-10"),
            },
            *[
                {
                    "currency": "EUR",
                    "index": index,
                    "currency_total": 0,
                    "category_id": present,
                    "category_name": "A both",
                    "amount": Decimal("-1"),
                }
                for index in [0, 1]
            ],
        ]

    monkeypatch.setattr("app.services.summary.comparison_totals", totals)
    result = asyncio.run(
        expense_comparison(
            "owner",
            ExpenseComparisonInput(kind="year", periods=[{"year": 2024}, {"year": 2023}]),
            date(2024, 12, 31),
        )
    )
    assert [category.name for category in result.currencies[0].categories] == ["Z absent", "A both"]
    assert result.currencies[0].categories[0].points[1].amount == 0


@pytest.mark.parametrize("path", ["/api/v1/summary/analysis?year=2024", "/api/v1/summary/compare"])
def test_chart_analysis_is_private_and_database_failures_are_explicit(transaction_client, path):
    client, identity = transaction_client
    data = {"kind": "year", "periods": [{"year": 2024}, {"year": 2023}]}

    def request():
        return client.post(path, json=data) if path.endswith("compare") else client.get(path)

    app.dependency_overrides.pop(require_identity)
    response = request()
    assert response.status_code == 401
    assert response.headers["cache-control"] == "private, no-store"
    app.dependency_overrides[require_identity] = lambda: identity
    assert request().status_code == 503


@pytest.mark.parametrize(
    "data",
    [
        {"kind": "year", "periods": [{"year": 2024}]},
        {"kind": "year", "periods": [{"year": year} for year in range(2010, 2017)]},
        {"kind": "year", "periods": [{"year": 2024}, {"year": 2024}]},
        {"kind": "year", "periods": [{"year": True}, {"year": 2023}]},
        {"kind": "month", "periods": [{"year": 2024}, {"year": 2023}]},
        {"kind": "month", "periods": [{"year": 2024, "month": 13}, {"year": 2023, "month": 1}]},
        {"kind": "year", "periods": [{"year": 2024, "month": 1}, {"year": 2023}]},
        {"kind": "average", "periods": [{"year": 0}, {"year": 2023}]},
        {"kind": "year", "periods": [{"year": 2024, "owner_subject": "forged"}, {"year": 2023}]},
        {"kind": "year", "periods": [{"year": 2024}, {"year": 2023}], "owner_subject": "forged"},
        {"kind": "year", "periods": [{"year": 9999}, {"year": 2023}]},
        {"kind": "mixed", "periods": [{"year": 2024}, {"year": 2023}]},
        {"kind": "average", "periods": [{"year": 2024}, {"year": 2023}]},
        {
            "kind": "average",
            "periods": [{"year": 2024, "end_year": 2023}, {"year": 2022, "end_year": 2023}],
        },
        {
            "kind": "average",
            "periods": [{"year": 2024, "end_year": 9999}, {"year": 2022, "end_year": 2023}],
        },
        {
            "kind": "average",
            "periods": [{"year": 2024, "end_year": True}, {"year": 2022, "end_year": 2023}],
        },
        {
            "kind": "average",
            "periods": [{"year": 2022, "end_year": 2023}, {"year": 2022, "end_year": 2023}],
        },
        {"kind": "year", "periods": [{"year": 2024, "end_year": 2024}, {"year": 2023}]},
    ],
)
def test_comparison_refuses_invalid_duplicate_mixed_or_future_periods(transaction_client, data):
    client, _ = transaction_client
    assert client.post("/api/v1/summary/compare", json=data).status_code == 422


def test_chart_geometry_preserves_exact_amounts_and_order_beyond_decimal_context_precision():
    low, high = "12345678901234567890.123456789012345678", "12345678901234567890.123456789012345679"
    result = ExpenseSummary.model_validate(
        {
            "year": 2024,
            "as_of": "2024-02-29",
            "currencies": [
                {
                    "currency": "EUR",
                    "months": [high, "0.000000000000000001", *(["0"] * 10)],
                    "total": high,
                    "categories": [
                        {
                            "id": uuid4(),
                            "name": name,
                            "total": amount,
                            "months": [amount, *(["0"] * 11)],
                            "subcategories": [],
                        }
                        for name, amount in [
                            ("A", low),
                            ("Z", high),
                            *[(f"Other {n}", "1") for n in range(12)],
                        ]
                    ],
                }
            ],
        }
    )
    chart = expense_charts(
        result,
        ExpenseSummary(year=result.year, as_of=result.as_of, currencies=[]),
        {"EUR": [amount.copy_negate() for amount in result.currencies[0].months]},
    )[0]
    assert len(chart.ranking) == 10 and chart.ranking[0].label == "Z"
    assert chart.ranking[0].amount == Decimal(high) and chart.ranking[0].value == 10000
    assert len(chart.trend) == 12 and chart.trend[1].amount == Decimal("1E-18")
    assert chart.trend[1].value == 0
    assert chart.trend[-1].key == "12" and chart.trend[-1].label == "Dec"
    assert chart.ranking_sum == Decimal("24691357802469135788.246913578024691357")
    assert chart.ranking_average == Decimal("2469135780246913578.824691357802469136")
    assert chart.totals.net == Decimal("-12345678901234567890.123456789012345680")
    assert chart.cashflow_ticks[-1].amount == Decimal(high)
    assert chart.cashflow_ticks[1].amount == Decimal("6172839450617283945.0617283945061728395")
    assert chart.cashflow_ticks[-1].label == "1.23e+19"


@pytest.mark.parametrize("maximum", ["0", "1234.56", "0.000000000000000001", "1E+100"])
def test_money_axis_ticks_keep_exact_signed_scale_and_readable_numeric_labels(maximum):
    ticks = money_axis_ticks(Decimal(maximum), True)
    extent = Decimal(maximum) or Decimal(1)
    assert [tick.value for tick in ticks] == [-10000, -5000, 0, 5000, 10000]
    assert [tick.amount for tick in ticks] == [
        extent.copy_negate(),
        extent / -2,
        Decimal(0),
        extent / 2,
        extent,
    ]
    assert all(Decimal(tick.label).is_finite() and "%" not in tick.label for tick in ticks)
    if maximum == "1234.56":
        assert [tick.label for tick in ticks] == ["-1230", "-617", "0", "617", "1230"]
    assert money_axis_ticks(Decimal(maximum), False) == ticks[2:]


@pytest.mark.integration
def test_comparison_uses_one_owned_due_occurrence_snapshot_with_exact_sums_and_rounded_averages(
    transaction_database,
):
    client, identity, owners, data, destination = transaction_database
    high = "12345678901234567890.123456789012345678"
    income = income_reference(client)
    for change in [
        {"date": "2024-01-31", "amount": "2", "recurrence": "monthly", "recurrence_count": 3},
        {"date": "2024-01-01", "amount": high},
        {"date": "2024-02-01", "amount": "0.000000000000000001"},
        {"date": "2023-01-01", "amount": "1"},
        {"date": "2024-03-01", "amount": "999"},
        {"date": "2024-01-01", "amount": "999", "type": "income", **income},
        {
            "date": "2024-01-01",
            "amount": "999",
            "type": "transfer",
            "destination_wallet_id": destination,
        },
    ]:
        assert client.post("/api/v1/transactions", json={**data, **change}).status_code == 201
    dollars = client.post(
        "/api/v1/wallets", json={**WALLET, "name": "Dollars", "currency": "USD"}
    ).json()
    assert (
        client.post(
            "/api/v1/transactions",
            json={**data, "amount": "0.1", "date": "2024-02-01", "source_wallet_id": dollars["id"]},
        ).status_code
        == 201
    )
    identity["sub"] = owners[1]
    foreign_wallet = client.post("/api/v1/wallets", json=WALLET).json()
    foreign_category = client.post("/api/v1/categories", json=CATEGORY).json()
    assert (
        client.post(
            "/api/v1/transactions",
            json={
                **data,
                "amount": "9999",
                "date": "2024-01-01",
                "source_wallet_id": foreign_wallet["id"],
                "category_id": foreign_category["id"],
                "subcategory_id": None,
            },
        ).status_code
        == 201
    )
    identity["sub"] = owners[0]

    def report(kind, periods, horizon=date(2024, 2, 29)):
        return asyncio.run(
            expense_comparison(
                owners[0], ExpenseComparisonInput(kind=kind, periods=periods), horizon
            )
        )

    result = report(
        "month",
        [{"year": 2024, "month": 1}, {"year": 2024, "month": 2}, {"year": 2023, "month": 2}],
    )
    assert [item.currency for item in result.currencies] == ["EUR", "USD"]
    eur, usd = result.currencies
    assert [point.amount for point in eur.totals] == [
        Decimal("12345678901234567892.123456789012345678"),
        Decimal("2.000000000000000001"),
        Decimal(0),
    ]
    assert [point.amount for point in usd.totals] == [Decimal(0), Decimal("0.1"), Decimal(0)]
    assert str(eur.categories[0].id) == data["category_id"]
    assert eur.categories[0].points[0].value == 10000
    yearly = report("year", [{"year": 2024}, {"year": 2023}])
    assert yearly.currencies[0].totals[0].amount == Decimal(
        "12345678901234567894.123456789012345679"
    )
    averaged = report(
        "average", [{"year": 2023, "end_year": 2024}, {"year": 2021, "end_year": 2023}]
    )
    assert [period.months for period in averaged.periods] == [14, 36]
    assert [period.years for period in averaged.periods] == [2, 3]
    assert averaged.currencies[0].totals[0].amount == Decimal(
        "6172839450617283947.561728394506172840"
    )
    assert averaged.currencies[0].totals[1].amount == Decimal("0.333333333333333333")
    assert averaged.currencies[1].totals[0].amount == Decimal("0.050000000000000000")
    assert "owner_subject" not in averaged.model_dump_json()
    response = client.post(
        "/api/v1/summary/compare",
        json={"kind": "year", "periods": [{"year": 2024}, {"year": 2023}]},
    )
    assert response.status_code == 200 and response.headers["cache-control"] == "private, no-store"
    assert isinstance(response.json()["currencies"][0]["totals"][0]["amount"], str)
    assert client.get("/api/v1/summary/analysis?year=2024").status_code == 200


@pytest.mark.integration
def test_empty_comparisons_do_not_provision_users(transaction_database):
    _, _, owners, _, _ = transaction_database
    data = ExpenseComparisonInput(kind="year", periods=[{"year": 2024}, {"year": 2023}])
    assert asyncio.run(expense_comparison(owners[1], data, date(2024, 2, 29))).currencies == []

    async def count():
        async with database_connection() as connection:
            cursor = await connection.execute(
                "SELECT count(*) AS count FROM users WHERE subject = %s", (owners[1],)
            )
            return (await cursor.fetchone())["count"]

    assert asyncio.run(count()) == 0


@pytest.mark.integration
@pytest.mark.parametrize(
    ("amount", "horizon", "start", "expected"),
    [
        (
            "123456789012345678901234567890123456789",
            date(2024, 1, 1),
            2012,
            "10288065751028806575102880657510288065.750000000000000000",
        ),
        ("0.00000000000000000099", date(2023, 2, 28), 2022, "0.000000000000000000"),
        ("0.000000000000000001", date(2023, 2, 28), 2022, "0.000000000000000001"),
        (
            "-123456789012345678901234567890123456789",
            date(2024, 1, 1),
            2012,
            "-10288065751028806575102880657510288065.750000000000000000",
        ),
        ("-0.00000000000000000099", date(2023, 2, 28), 2022, "0"),
        ("-0.000000000000000001", date(2023, 2, 28), 2022, "-0.000000000000000001"),
    ],
)
def test_yearly_averages_round_once_without_losing_integer_precision(
    transaction_database, amount, horizon, start, expected
):
    client, _, owners, data, _ = transaction_database
    assert (
        client.post(
            "/api/v1/transactions", json={**data, "amount": amount, "date": "2023-01-01"}
        ).status_code
        == 201
    )
    request = ExpenseComparisonInput(
        kind="average",
        periods=[{"year": start, "end_year": 2023}, {"year": 2010, "end_year": 2011}],
    )
    result = asyncio.run(expense_comparison(owners[0], request, horizon))
    assert result.currencies[0].totals[0].amount == Decimal(expected)


def test_expense_summary_is_private_and_database_failure_is_not_empty(client, transaction_client):
    client, identity = transaction_client
    app.dependency_overrides.pop(require_identity)
    response = client.get("/api/v1/summary?year=2024")
    assert response.status_code == 401
    assert response.headers["cache-control"] == "private, no-store"
    app.dependency_overrides[require_identity] = lambda: identity
    response = client.get("/api/v1/summary?year=2024")
    assert response.status_code == 503
    assert response.json() == {"detail": "Database is unavailable"}
    assert response.headers["cache-control"] == "private, no-store"


@pytest.mark.parametrize(
    "query", ["", "?year=0", "?year=10000", "?year=invalid", "?year=2024&owner_subject=forged"]
)
def test_expense_summary_rejects_invalid_queries(transaction_client, query):
    client, _ = transaction_client
    assert client.get("/api/v1/summary" + query).status_code == 422


@pytest.mark.integration
def test_annual_income_tables_and_cashflow_share_exact_owned_due_occurrences(transaction_database):
    client, identity, owners, data, destination = transaction_database
    income = income_reference(client)
    child = client.post(
        f"/api/v1/categories/{income['category_id']}/subcategories",
        json={**CATEGORY, "name": "Income detail"},
    ).json()
    high = "12345678901234567890.123456789012345678"
    recurring = {
        **data,
        **income,
        "subcategory_id": child["id"],
        "type": "income",
        "amount": high,
        "date": "2024-01-31",
        "recurrence": "monthly",
        "recurrence_count": 3,
    }
    saved = client.post("/api/v1/transactions", json=recurring)
    assert saved.status_code == 201
    for change in [
        {"date": "2024-01-01", "amount": "-0.000000000000000001"},
        {"date": "2024-02-01", "amount": "200"},
        {"date": "2024-03-01", "amount": "999", "type": "income", **income},
        {
            "date": "2024-01-01",
            "amount": "999",
            "type": "transfer",
            "destination_wallet_id": destination,
        },
    ]:
        assert client.post("/api/v1/transactions", json={**data, **change}).status_code == 201
    dollars = client.post(
        "/api/v1/wallets", json={**WALLET, "name": "Income dollars", "currency": "USD"}
    ).json()
    assert (
        client.post(
            "/api/v1/transactions",
            json={
                **data,
                **income,
                "type": "income",
                "date": "2024-02-01",
                "amount": "0.1",
                "source_wallet_id": dollars["id"],
            },
        ).status_code
        == 201
    )
    identity["sub"] = owners[1]
    foreign_wallet = client.post("/api/v1/wallets", json=WALLET).json()
    foreign_income = income_reference(client)
    assert (
        client.post(
            "/api/v1/transactions",
            json={
                **data,
                **foreign_income,
                "type": "income",
                "date": "2024-01-01",
                "amount": "9999",
                "source_wallet_id": foreign_wallet["id"],
            },
        ).status_code
        == 201
    )
    identity["sub"] = owners[0]

    def report():
        return asyncio.run(summary.annual_summaries(owners[0], 2024, date(2024, 2, 29)))

    expenses, incomes, nets = report()
    assert [item.currency for item in expenses.currencies] == ["EUR"]
    assert [item.currency for item in incomes.currencies] == ["EUR", "USD"]
    eur = incomes.currencies[0]
    assert eur.months == [Decimal(high), Decimal(high), *([Decimal(0)] * 10)]
    assert eur.total == Decimal("24691357802469135780.246913578024691356")
    assert str(eur.categories[0].subcategories[0].id) == child["id"]
    assert eur.categories[0].subcategories[0].total == eur.total
    assert nets["EUR"][:2] == [
        Decimal("12345678901234567890.123456789012345679"),
        Decimal("12345678901234567690.123456789012345678"),
    ]
    charts = expense_charts(expenses, incomes, nets)
    assert charts[0].income_trend[0].value == 10000
    assert charts[0].trend[0].amount == Decimal("-1E-18")
    assert charts[0].net_trend[0].amount == nets["EUR"][0]
    assert len(charts[0].net_trend) == 12 and charts[0].net_trend[-1].amount == 0
    assert charts[0].totals.expenses == Decimal("199.999999999999999999")
    assert charts[0].totals.income == eur.total
    assert charts[0].totals.net == Decimal("24691357802469135580.246913578024691357")
    assert charts[0].ranking_sum == charts[0].ranking_average == charts[0].totals.expenses
    assert charts[1].ranking == [] and all(point.amount == 0 for point in charts[1].trend)
    assert charts[1].income_trend[1].value == charts[1].net_trend[1].value == 10000
    response = client.get("/api/v1/summary/analysis?year=2024")
    assert response.status_code == 200 and response.headers["cache-control"] == "private, no-store"
    assert response.json()["income_summary"]["currencies"][0]["total"] == (
        "37037036703703704669.370370367037037034"
    )
    assert "owner_subject" not in response.text
    assert (
        client.put(
            f"/api/v1/transactions/{saved.json()['id']}", json={**recurring, "amount": "0.1"}
        ).status_code
        == 200
    )
    assert report()[1].currencies[0].total == Decimal("0.2")
    assert report()[2]["EUR"][:2] == [Decimal("0.100000000000000001"), Decimal("-199.9")]
    signed_net = expense_charts(*report())[0].net_trend
    assert signed_net[0].value > 0 and signed_net[1].value == -10000
    assert client.delete(f"/api/v1/transactions/{saved.json()['id']}").status_code == 204
    assert [item.currency for item in report()[1].currencies] == ["USD"]


@pytest.mark.integration
def test_annual_expenses_are_exact_hierarchical_owner_scoped_and_due_only(transaction_database):
    client, identity, owners, data, destination = transaction_database
    high = "12345678901234567890.123456789012345678"
    income = income_reference(client)
    saved = client.post(
        "/api/v1/transactions", json={**data, "date": "2024-01-01", "amount": high}
    ).json()
    for change in [
        {"amount": "0.000000000000000001", "date": "2024-01-01", "subcategory_id": None},
        {"amount": "2.5", "date": "2023-12-31", "recurrence": "monthly", "recurrence_count": 4},
        {"amount": "999", "date": "2024-03-01"},
        {"amount": "999", "date": "9999-12-31"},
        {"amount": "999", "date": "2024-01-01", "type": "income", **income},
        {
            "amount": "999",
            "date": "2024-01-01",
            "type": "transfer",
            "destination_wallet_id": destination,
        },
    ]:
        assert client.post("/api/v1/transactions", json={**data, **change}).status_code == 201
    travel = client.post("/api/v1/categories", json={**CATEGORY, "name": "Travel"}).json()
    assert (
        client.post(
            "/api/v1/transactions",
            json={
                **data,
                "date": "2024-02-01",
                "amount": "4",
                "category_id": travel["id"],
                "subcategory_id": None,
            },
        ).status_code
        == 201
    )
    usd = client.post(
        "/api/v1/wallets", json={**WALLET, "name": "Dollars", "currency": "USD"}
    ).json()
    assert (
        client.post(
            "/api/v1/transactions",
            json={
                **data,
                "date": "2024-02-01",
                "amount": "0.025",
                "source_wallet_id": usd["id"],
            },
        ).status_code
        == 201
    )
    identity["sub"] = owners[1]
    foreign_wallet = client.post("/api/v1/wallets", json=WALLET).json()
    foreign_category = client.post("/api/v1/categories", json=CATEGORY).json()
    assert (
        client.post(
            "/api/v1/transactions",
            json={
                **data,
                "date": "2024-01-01",
                "amount": "9999",
                "source_wallet_id": foreign_wallet["id"],
                "category_id": foreign_category["id"],
                "subcategory_id": None,
            },
        ).status_code
        == 201
    )
    identity["sub"] = owners[0]

    def report(year=2024):
        return asyncio.run(summary.expense_summary(owners[0], year, date(2024, 2, 29))).model_dump(
            mode="json"
        )

    result = report()
    assert result["year"] == 2024 and result["as_of"] == "2024-02-29"
    eur, dollars = result["currencies"]
    assert [item["currency"] for item in result["currencies"]] == ["EUR", "USD"]
    assert eur["months"] == ["12345678901234567892.623456789012345679", "6.5", *(["0"] * 10)]
    assert eur["total"] == "12345678901234567899.123456789012345679"
    general, travel_total = eur["categories"]
    assert general["id"] == data["category_id"]
    assert general["total"] == "12345678901234567895.123456789012345679"
    direct, child = general["subcategories"]
    assert direct["id"] is None and direct["name"] == "Without subcategory"
    assert Decimal(direct["total"]) == Decimal("0.000000000000000001")
    assert child["id"] == data["subcategory_id"]
    assert child["total"] == "12345678901234567895.123456789012345678"
    assert travel_total["total"] == "4"
    assert dollars["total"] == "0.025" and dollars["months"][1] == "0.025"
    assert dollars["categories"][0]["id"] == general["id"]
    assert report(1)["currencies"] == [] and report(9999)["currencies"] == []
    response = client.get("/api/v1/summary?year=2024")
    assert response.status_code == 200 and response.headers["cache-control"] == "private, no-store"
    assert response.json()["currencies"][0]["months"][0] == eur["months"][0]
    assert "owner_subject" not in response.text
    assert (
        client.put(
            f"/api/v1/transactions/{saved['id']}",
            json={
                **data,
                "date": "2024-01-01",
                "amount": "0.1",
            },
        ).status_code
        == 200
    )
    assert report()["currencies"][0]["total"] == "9.100000000000000001"
    assert client.delete(f"/api/v1/transactions/{saved['id']}").status_code == 204
    assert report()["currencies"][0]["total"] == "9.000000000000000001"


@pytest.mark.integration
@pytest.mark.parametrize(
    ("start", "frequency", "count", "horizon", "expected"),
    [
        ("2024-01-31", "monthly", 2, date(2024, 2, 29), "4"),
        ("2023-12-31", "monthly", 3, date(2024, 12, 31), "4"),
        ("2020-02-29", "annually", None, date(2024, 2, 28), None),
        ("2020-02-29", "annually", None, date(2024, 2, 29), "2"),
        ("2023-12-28", "weekly", 4, date(2024, 1, 14), "4"),
        ("2023-12-28", "weekly", 1, date(2024, 1, 14), None),
    ],
)
def test_annual_expenses_share_anchored_recurrence(
    transaction_database, start, frequency, count, horizon, expected
):
    client, _, owners, data, _ = transaction_database
    assert (
        client.post(
            "/api/v1/transactions",
            json={
                **data,
                "amount": "2",
                "date": start,
                "recurrence": frequency,
                "recurrence_count": count,
            },
        ).status_code
        == 201
    )
    result = asyncio.run(summary.expense_summary(owners[0], 2024, horizon))
    if expected is None:
        assert result.currencies == []
    else:
        assert str(result.currencies[0].total) == expected


@pytest.mark.integration
def test_empty_summary_does_not_provision_users(transaction_database):
    _, _, owners, _, _ = transaction_database
    result = asyncio.run(summary.expense_summary(owners[1], 2024, date(2024, 12, 31)))
    assert result.currencies == []
    expenses, incomes, nets = asyncio.run(
        summary.annual_summaries(owners[1], 2024, date(2024, 12, 31))
    )
    assert expenses.currencies == incomes.currencies == [] and nets == {}

    async def user_count():
        async with database_connection() as connection:
            cursor = await connection.execute(
                "SELECT count(*) AS count FROM users WHERE subject = %s", (owners[1],)
            )
            return (await cursor.fetchone())["count"]

    assert asyncio.run(user_count()) == 0


@pytest.mark.integration
def test_wallet_balances_are_exact_due_only_and_follow_mutations(transaction_database):
    client, _, owners, data, destination = transaction_database
    source = data["source_wallet_id"]
    initial = "12345678901234567890.123456789012345678"
    assert (
        client.put(
            f"/api/v1/wallets/{source}", json={**WALLET, "initial_amount": initial}
        ).status_code
        == 200
    )
    income = client.post(
        "/api/v1/transactions",
        json={
            **data,
            **income_reference(client),
            "type": "income",
            "amount": "0.000000000000000001",
            "date": "2026-01-01",
        },
    ).json()
    expense = client.post(
        "/api/v1/transactions", json={**data, "amount": "2", "date": "2026-01-01"}
    ).json()
    transfer = client.post(
        "/api/v1/transactions",
        json={
            **data,
            "amount": "3",
            "type": "transfer",
            "destination_wallet_id": destination,
            "date": "2026-01-01",
        },
    ).json()
    assert (
        client.post(
            "/api/v1/transactions", json={**data, "amount": "999", "date": "9999-12-31"}
        ).status_code
        == 201
    )

    def balances():
        result = asyncio.run(wallets.list_wallets(owners[0], 1, 100, date(2026, 1, 31)))
        return {str(wallet.id): str(wallet.current_amount) for wallet in result.wallets}

    assert balances() == {source: "12345678901234567885.123456789012345679", destination: "3"}
    assert (
        client.put(
            f"/api/v1/transactions/{expense['id']}",
            json={**data, "amount": "4", "date": "2026-01-01"},
        ).status_code
        == 200
    )
    assert balances()[source] == "12345678901234567883.123456789012345679"
    assert client.delete(f"/api/v1/transactions/{transfer['id']}").status_code == 204
    assert balances()[destination] == "0"
    assert balances()[source] == "12345678901234567886.123456789012345679"
    assert client.delete(f"/api/v1/wallets/{source}").status_code == 409
    assert (
        client.put(f"/api/v1/wallets/{source}", json={**WALLET, "currency": "USD"}).status_code
        == 409
    )
    updated = client.put(f"/api/v1/wallets/{source}", json={**WALLET, "initial_amount": "10"})
    assert updated.status_code == 200
    assert updated.json()["current_amount"] == "6.000000000000000001"
    assert client.delete(f"/api/v1/transactions/{income['id']}").status_code == 204


@pytest.mark.integration
@pytest.mark.parametrize(
    ("start", "frequency", "count", "horizon", "expected"),
    [
        ("2026-01-31", "monthly", None, date(2026, 4, 29), "6"),
        ("2026-01-31", "monthly", None, date(2026, 4, 30), "8"),
        ("2026-01-31", "monthly", 2, date(2026, 4, 30), "4"),
        ("2024-02-29", "annually", None, date(2028, 2, 28), "8"),
        ("2024-02-29", "annually", None, date(2028, 2, 29), "10"),
        ("2026-01-01", "weekly", None, date(2026, 1, 20), "6"),
        ("2026-02-01", "weekly", None, date(2026, 1, 31), "0"),
    ],
)
def test_wallet_balances_share_anchored_recurrence(
    transaction_database, start, frequency, count, horizon, expected
):
    client, _, owners, data, destination = transaction_database
    assert (
        client.post(
            "/api/v1/transactions",
            json={
                **data,
                "amount": "2",
                "date": start,
                "type": "transfer",
                "destination_wallet_id": destination,
                "recurrence": frequency,
                "recurrence_count": count,
            },
        ).status_code
        == 201
    )
    result = asyncio.run(wallets.list_wallets(owners[0], 1, 1, horizon))
    assert len(result.wallets) == 1 and result.total == 2
    assert str(result.wallets[0].current_amount) == ("-" + expected if expected != "0" else "0")
    assert result.wallets[0].balance_as_of == horizon
    second = asyncio.run(wallets.list_wallets(owners[0], 2, 1, horizon))
    assert str(second.wallets[0].current_amount) == expected


@pytest.mark.integration
def test_wallet_transfer_currency_and_reference_protection(transaction_database):
    client, _, _, data, destination = transaction_database
    assert (
        client.put(f"/api/v1/wallets/{destination}", json={**WALLET, "currency": "USD"}).status_code
        == 200
    )
    transfer = {**data, "type": "transfer", "destination_wallet_id": destination}
    response = client.post("/api/v1/transactions", json=transfer)
    assert response.status_code == 422
    assert response.json() == {"detail": "Transfers require wallets with the same currency"}
    assert client.get("/api/v1/transactions").json()["total"] == 0
    expense = client.post("/api/v1/transactions", json=data).json()
    assert client.put(f"/api/v1/transactions/{expense['id']}", json=transfer).status_code == 422
    assert client.get(f"/api/v1/transactions/{expense['id']}").json()["type"] == "expense"
    assert (
        client.put(f"/api/v1/wallets/{destination}", json={**WALLET, "currency": "EUR"}).status_code
        == 200
    )
    assert client.post("/api/v1/transactions", json=transfer).status_code == 201
    for wallet_id in [data["source_wallet_id"], destination]:
        response = client.delete(f"/api/v1/wallets/{wallet_id}")
        assert response.status_code == 409
        assert response.json() == {"detail": "Wallet is used by transactions"}
        assert "no-store" in response.headers["cache-control"]


@pytest.mark.integration
def test_csv_currency_mismatch_is_a_row_error_and_confirmation_writes_nothing(transaction_database):
    client, _, _, data, destination = transaction_database
    request = csv_request(data)
    request["rows"][0]["overrides"] = {
        "type": "transfer",
        "destination_wallet_id": destination,
        "category_id": "New category",
    }
    path = "/api/v1/transactions/import"
    report = client.post(path + "/validate", json=request).json()
    request["approved_creations"] = [item["id"] for item in report["creations"]]
    assert (
        client.put(f"/api/v1/wallets/{destination}", json={**WALLET, "currency": "USD"}).status_code
        == 200
    )
    report = client.post(path + "/validate", json=request).json()
    assert report["invalid"] == 1
    assert report["rows"][0]["errors"]["destination_wallet_id"] == (
        "Transfers require wallets with the same currency."
    )
    assert client.post(path + "/confirm", json=request).status_code == 422
    assert client.get("/api/v1/transactions").json()["total"] == 0
    assert len(client.get("/api/v1/categories").json()["categories"]) == 1


@pytest.fixture
def transaction_client(client, monkeypatch):
    identity = {"sub": f"test-transaction-{uuid4()}"}
    monkeypatch.setitem(app.dependency_overrides, require_identity, lambda: identity)
    return client, identity


@pytest.fixture
def transaction_database(transaction_client, monkeypatch):
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set TEST_DATABASE_URL to a dedicated PostgreSQL test database")
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()
    asyncio.run(migrate())
    client, identity = transaction_client
    owners = [identity["sub"], f"test-transaction-{uuid4()}"]
    wallet = client.post("/api/v1/wallets", json=WALLET).json()
    destination = client.post("/api/v1/wallets", json={**WALLET, "name": "Savings"}).json()
    category = client.post("/api/v1/categories", json=CATEGORY).json()
    child = client.post(f"/api/v1/categories/{category['id']}/subcategories", json=CATEGORY).json()
    data = {
        **DATA,
        "source_wallet_id": wallet["id"],
        "category_id": category["id"],
        "subcategory_id": child["id"],
    }
    yield client, identity, owners, data, destination["id"]

    async def cleanup():
        async with database_connection() as connection:
            await connection.execute("DELETE FROM users WHERE subject = ANY(%s)", (owners,))

    try:
        asyncio.run(cleanup())
    finally:
        get_settings.cache_clear()


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", ""),
        ("get", "/options"),
        ("patch", "/bulk"),
        ("delete", "/bulk"),
        ("post", ""),
        ("get", f"/{uuid4()}"),
        ("put", f"/{uuid4()}"),
        ("delete", f"/{uuid4()}"),
        ("post", "/import/upload"),
        ("post", "/import/validate"),
        ("post", "/import/confirm"),
    ],
)
def test_transaction_authentication(client, method, path):
    response = getattr(client, method)(f"/api/v1/transactions{path}")
    assert response.status_code == 401
    assert "no-store" in response.headers["cache-control"]


@pytest.mark.parametrize(
    "change",
    [
        {"description": None},
        {"description": "x" * 501},
        {"amount": 1.2},
        {"amount": True},
        {"amount": "0"},
        {"amount": "-1", "type": "income"},
        {"amount": "NaN"},
        {"amount": "Infinity"},
        {"amount": None},
        {"date": "2026-02-30"},
        {"date": "2026-01-01T00:00:00"},
        {"date": 12345},
        {"type": "other"},
        {"type": "transfer"},
        {"type": "transfer", "destination_wallet_id": DATA["source_wallet_id"]},
        {"destination_wallet_id": str(uuid4())},
        {"source_wallet_id": "invalid"},
        {"category_id": None},
        {"recurrence": "daily"},
        {"recurrence_count": 2},
        {"recurrence": "weekly", "recurrence_count": 0},
        {"recurrence": "weekly", "recurrence_count": 10001},
        {"recurrence": "weekly", "recurrence_count": True},
        {"recurrence": "weekly", "recurrence_count": "3"},
        {"owner_subject": "forged"},
    ],
)
def test_transaction_input_refusals(transaction_client, change):
    client, _ = transaction_client
    for method, path in [("post", ""), ("put", f"/{uuid4()}")]:
        response = getattr(client, method)("/api/v1/transactions" + path, json={**DATA, **change})
        assert response.status_code == 422


@pytest.mark.parametrize(
    "query",
    [
        "page=0",
        "page=2147483648",
        "page_size=101",
        "page_size=0",
        "type=other",
        "wallet_id=invalid",
        "category_id=invalid",
        "date_from=2026-02-30",
        "date_from=2026-02-01&date_to=2026-01-01",
        "q=" + "x" * 501,
        "owner_subject=forged",
    ],
)
def test_transaction_filter_refusals(transaction_client, query):
    client, _ = transaction_client
    assert client.get("/api/v1/transactions?" + query).status_code == 422


def test_transaction_database_errors_are_explicit(transaction_client):
    client, _ = transaction_client
    for response in [
        client.get("/api/v1/transactions"),
        client.get("/api/v1/transactions/options"),
        client.get(f"/api/v1/transactions/{uuid4()}"),
        client.post("/api/v1/transactions", json=DATA),
        client.put(f"/api/v1/transactions/{uuid4()}", json=DATA),
        client.delete(f"/api/v1/transactions/{uuid4()}"),
    ]:
        assert response.status_code == 503
        assert "no-store" in response.headers["cache-control"]


def csv_request(data):
    fields = ["description", "amount", "date", "type", "source_wallet_id", "category_id"]
    content = (",".join(fields) + "\n" + ",".join(str(data[field]) for field in fields)).encode()
    return {**parse_csv(content).model_dump(mode="json"), "defaults": {}, "import_id": str(uuid4())}


@pytest.mark.integration
@pytest.mark.parametrize("description", [None, "", "   "])
def test_optional_transaction_description_create_edit_and_list(transaction_database, description):
    client, _, _, data, _ = transaction_database
    payload = {key: value for key, value in data.items() if key != "description"}
    if description is not None:
        payload["description"] = description
    created = client.post("/api/v1/transactions", json=payload)
    assert created.status_code == 201 and created.json()["description"] == ""
    path = f"/api/v1/transactions/{created.json()['id']}"
    assert client.get(path).json()["description"] == ""
    assert client.put(path, json=data).json()["description"] == "Lunch"
    updated = client.put(path, json=payload)
    assert updated.status_code == 200 and updated.json()["description"] == ""
    assert client.get("/api/v1/transactions").json()["transactions"][0]["description"] == ""


@pytest.mark.integration
@pytest.mark.parametrize("description", [None, "", "   "])
def test_csv_description_can_be_unmapped_or_blank(transaction_database, description):
    client, _, _, data, _ = transaction_database
    request = csv_request(data)
    if description is None:
        del request["mapping"]["description"]
    else:
        request["rows"][0]["values"][0] = description
    path = "/api/v1/transactions/import"
    report = client.post(path + "/validate", json=request).json()
    assert report["invalid"] == 0
    assert report["rows"][0]["transaction"]["description"] == ""
    confirmed = client.post(path + "/confirm", json=request)
    assert confirmed.status_code == 201
    assert client.get("/api/v1/transactions").json()["transactions"][0]["description"] == ""


def test_csv_parser_handles_quotes_bom_delimiters_and_ambiguous_headers():
    document = parse_csv(
        '\ufeffmemo;amount;data;wallet;category\n"Hello;\nworld";1.23;2026-01-01;Everyday;Food\n'.encode()
    )
    assert document.mapping["description"] == 0
    assert document.mapping["date"] == 2
    assert document.rows[0].values[0] == "Hello;\nworld"
    assert document.rows[0].included is True
    duplicate = parse_csv(b"memo,description,amount\nHello,world,1")
    assert duplicate.mapping["description"] is None
    ragged = parse_csv(b"description,amount,date\nGood,1,2026-01-01\nBad,2")
    assert len(ragged.rows[1].values) == 2
    tab = parse_csv(b"memo\tamount\nHello\t1.2", "\t")
    assert tab.rows[0].values == ["Hello", "1.2"]


@pytest.mark.parametrize(
    "content",
    [
        b"",
        b"\xef\xbb\xbf",
        b" \r\n",
        b"header\n",
        b"\xff\nx",
        b"memo\n\x00",
        b'memo,amount\n"unclosed,1',
        b"memo\n" + b"x" * 1001,
        (b"memo\n" + b"x\n" * 501),
        (b",".join([b"header"] * 33) + b"\nx"),
        b"memo\n" + b"x" * (512 * 1024),
    ],
)
def test_csv_parser_rejects_invalid_and_oversized_files(content):
    with pytest.raises(InvalidTransactionCSV):
        parse_csv(content)


def test_csv_api_bounds_and_malformed_requests(transaction_client):
    client, _ = transaction_client
    path = "/api/v1/transactions/import"
    assert (
        client.post(
            path + "/upload", content=b"memo\nhello", headers={"Content-Type": "text/csv"}
        ).status_code
        == 200
    )
    assert client.post(path + "/upload", content=b"memo\nhello").status_code == 415
    assert (
        client.post(
            path + "/upload", content=b"x" * (512 * 1024 + 1), headers={"Content-Type": "text/csv"}
        ).status_code
        == 413
    )
    assert (
        client.post(
            path + "/upload",
            content=b"memo\nhello",
            headers={"Content-Type": "text/csv"},
            params={"delimiter": "|"},
        ).status_code
        == 422
    )
    for suffix in ["/validate", "/confirm"]:
        assert (
            client.post(
                path + suffix, content=b"{", headers={"Content-Type": "application/json"}
            ).status_code
            == 422
        )
        assert (
            client.post(
                path + suffix,
                content=b" " * (2 * 1024 * 1024 + 1),
                headers={"Content-Type": "application/json"},
            ).status_code
            == 413
        )
    request = csv_request(DATA)
    assert client.post(path + "/validate", json=request).status_code == 503
    for changes in [
        {"owner_subject": "forged"},
        {"mapping": {"description": True}},
        {"mapping": {"amount": 0, "description": 0}},
        {"mapping": {"date": 31}},
    ]:
        assert client.post(path + "/confirm", json={**request, **changes}).status_code == 422
    bad = {**request, "rows": [{**request["rows"][0], "overrides": {"owner_subject": "forged"}}]}
    assert client.post(path + "/confirm", json=bad).status_code == 422


@pytest.mark.integration
def test_csv_review_exclusion_exact_values_and_safe_confirmation(transaction_database):
    client, identity, owners, data, destination = transaction_database
    request = csv_request(data)
    request["rows"].append(
        {
            **request["rows"][0],
            "number": 3,
            "values": ["Bad", "", "2026-02-30", "expense", "Everyday", "General"],
        }
    )
    path = "/api/v1/transactions/import"
    report = client.post(path + "/validate", json=request).json()
    assert report["selected"] == 2 and report["invalid"] == 1
    assert "amount" in report["rows"][1]["errors"]
    assert "date" in report["rows"][1]["errors"]
    assert client.get("/api/v1/transactions").json()["total"] == 0
    refusal = client.post(path + "/confirm", json=request)
    assert refusal.status_code == 422 and refusal.json()["validation"]["invalid"] == 1
    assert client.get("/api/v1/transactions").json()["total"] == 0
    request["rows"][1]["included"] = False
    report = client.post(path + "/validate", json=request).json()
    assert report["invalid"] == 0 and report["selected"] == 1
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(
            executor.map(lambda _: client.post(path + "/confirm", json=request), range(2))
        )
    assert all(result.status_code == 201 and result.json()["imported"] == 1 for result in results)
    listing = client.get("/api/v1/transactions").json()
    assert listing["total"] == 1
    assert listing["transactions"][0]["amount"] == data["amount"]
    request["rows"][0]["overrides"]["description"] = "Changed"
    assert client.post(path + "/confirm", json=request).status_code == 409
    identity["sub"] = owners[1]
    assert client.post(path + "/confirm", json=request).status_code == 422
    assert client.get("/api/v1/transactions").json()["total"] == 0


@pytest.mark.integration
def test_csv_manual_mapping_defaults_overrides_and_ownership(transaction_database):
    client, _, _, data, destination = transaction_database
    request = {
        **parse_csv(b"Bank note,Money,When\nTransfer,12.000000000000000001,2026-01-31").model_dump(
            mode="json"
        ),
        "mapping": {"description": 0, "amount": 1, "date": 2},
        "defaults": {
            "type": "transfer",
            "source_wallet_id": "Everyday",
            "destination_wallet_id": destination,
            "category_id": "General",
        },
        "import_id": str(uuid4()),
    }
    path = "/api/v1/transactions/import"
    report = client.post(path + "/validate", json=request).json()
    assert report["invalid"] == 0
    assert report["rows"][0]["transaction"]["source_wallet_id"] == data["source_wallet_id"]
    # Nonunique wallet names must be resolved explicitly, never guessed.
    client.post("/api/v1/wallets", json=WALLET)
    report = client.post(path + "/validate", json=request).json()
    assert "source_wallet_id" in report["rows"][0]["errors"]
    request["rows"][0]["overrides"] = {
        "source_wallet_id": data["source_wallet_id"],
        "category_id": data["category_id"],
        "subcategory_id": data["subcategory_id"],
        "recurrence": "monthly",
        "recurrence_count": "2",
    }
    assert client.post(path + "/validate", json=request).json()["invalid"] == 0
    assert client.post(path + "/confirm", json=request).json()["imported"] == 1
    item = client.get("/api/v1/transactions").json()["transactions"][0]
    assert item["recurrence_count"] == 2 and item["destination_wallet_id"] == destination
    for changes in [
        {"subcategory_id": str(uuid4())},
        {"source_wallet_id": str(uuid4())},
        {"amount": "1e999999"},
        {"recurrence_count": "1.5"},
    ]:
        candidate = {
            **request,
            "import_id": str(uuid4()),
            "rows": [
                {**request["rows"][0], "overrides": {**request["rows"][0]["overrides"], **changes}}
            ],
        }
        assert client.post(path + "/confirm", json=candidate).status_code == 422


@pytest.mark.integration
def test_csv_revalidates_references_and_rolls_back_mid_batch(transaction_database, monkeypatch):
    client, _, _, data, _ = transaction_database
    request = csv_request(data)
    request["rows"].append({**request["rows"][0], "number": 3})
    original = transaction_imports.insert_transaction
    calls = 0

    async def fail_second(*args):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise DatabaseUnavailable
        return await original(*args)

    path = "/api/v1/transactions/import"
    assert client.post(path + "/validate", json=request).json()["invalid"] == 0
    monkeypatch.setattr(transaction_imports, "insert_transaction", fail_second)
    assert client.post(path + "/confirm", json=request).status_code == 503
    assert client.get("/api/v1/transactions").json()["total"] == 0
    monkeypatch.setattr(transaction_imports, "insert_transaction", original)
    assert client.post(path + "/confirm", json=request).json()["imported"] == 2
    candidate = csv_request(data)
    new_category = client.post("/api/v1/categories", json={**CATEGORY, "name": "Temporary"}).json()[
        "id"
    ]
    candidate["defaults"] = {}
    candidate["rows"][0]["overrides"]["category_id"] = new_category
    assert client.post(path + "/validate", json=candidate).json()["invalid"] == 0
    assert client.delete(f"/api/v1/categories/{new_category}").status_code == 204
    assert client.post(path + "/confirm", json=candidate).status_code == 422
    assert client.get("/api/v1/transactions").json()["total"] == 2


@pytest.mark.parametrize(
    ("value", "expected", "currency"),
    [
        ("€ 1.234,56", "1234.56", "€"),
        ("USD 1,234.567890123456789", "1234.567890123456789", "USD"),
        ("12,50 EUR", "12.50", "EUR"),
        ("£12.50", "12.50", "£"),
        ("CHF 1'234.50", "1234.50", "CHF"),
        ("1\u202f234,50 €", "1234.50", "€"),
        ("¥ 1500", "1500", "¥"),
        ("12.1234567890123456789", "12.1234567890123456789", None),
        ("1e-100", "1e-100", None),
        (".50", "0.50", None),
        ("-€12,50", "-12.50", "€"),
    ],
)
def test_csv_currency_and_decimal_normalization(value, expected, currency):
    assert normalize_amount(value) == (expected, currency)


@pytest.mark.parametrize(
    "value",
    [
        "XYZ 12.50",
        "¤12.50",
        "ABC12",
        "12.34,56",
        "1,23,456",
        "€12 USD",
        "1..2",
        "12 EUR rubbish",
        "12.5.0",
        "--€12",
        "NaN",
        "Infinity",
        "١1١234",
    ],
)
def test_csv_invalid_currency_or_grouping_is_an_error(value):
    with pytest.raises(ValueError):
        normalize_amount(value)


def test_csv_explicit_decimal_separator_resolves_grouping_without_float_conversion():
    assert normalize_amount("$1,234", "dot") == ("1234", "$")
    assert normalize_amount("1.234 €", "comma") == ("1234", "€")
    assert normalize_amount("1,234") == ("1.234", None)
    with pytest.raises(ValueError):
        normalize_amount("12,50", "dot")


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("31/01/2026", "2026-01-31"),
        ("01/31/2026", "2026-01-31"),
        ("31.01.2026", "2026-01-31"),
        ("2026/01/31", "2026-01-31"),
        ("2026-1-2", "2026-01-02"),
        ("20260131", "2026-01-31"),
        ("2026-01-31T23:30:00-05:00", "2026-01-31"),
        ("29/02/2024", "2024-02-29"),
        ("01/01/2026", "2026-01-01"),
    ],
)
def test_csv_calendar_formats_are_normalized(value, expected):
    assert normalize_date(value) == expected


def test_csv_date_order_inference_does_not_guess_ambiguous_dates():
    assert detect_date_order(["31/01/2026", "03/04/2026"]) == "day-first"
    assert normalize_date("03/04/2026", detected="day-first") == "2026-04-03"
    assert normalize_date("03/04/2026", "month-first") == "2026-03-04"
    assert detect_date_order(["31/01/2026", "01/31/2026"]) is None
    assert detect_date_order(["31/02/2026", "03/04/2026"]) is None
    for value in ["03/04/2026", "29/02/2025", "31/04/2026", "1/2/26", "2026-02-30"]:
        with pytest.raises(ValueError):
            normalize_date(value)


@pytest.mark.integration
def test_csv_missing_records_need_approval_and_are_created_atomically(transaction_database):
    client, _, _, _, _ = transaction_database
    path = "/api/v1/transactions/import"
    request = {
        **parse_csv(
            "memo;amount;date;type;wallet;category;subcategory\n"
            "New reference;€ 1.234,56;31/01/2026;expense;"
            "CSV new wallet;CSV new category;CSV child\n"
            "Repeated;12,50 EUR;03/04/2026;expense;csv NEW wallet;CSV new category;CSV child\n"
            "Excluded;£1;31/01/2026;income;Unused wallet;Unused category;\n".encode()
        ).model_dump(mode="json"),
        "import_id": str(uuid4()),
    }
    request["rows"][2]["included"] = False
    report = client.post(path + "/validate", json=request).json()
    assert len(report["creations"]) == 3 and not report["creations_approved"]
    assert report["invalid"] == 0 and report["selected"] == 2
    assert report["rows"][0]["normalized"] == {"amount": "1234.56", "date": "2026-01-31"}
    assert report["rows"][1]["transaction"]["date"] == "2026-04-03"
    assert report["rows"][0]["currency"] == "€"
    assert client.get("/api/v1/wallets").json()["total"] == 2
    assert len(client.get("/api/v1/categories").json()["categories"]) == 1
    assert client.post(path + "/confirm", json=request).status_code == 422
    request["approved_creations"] = [item["id"] for item in report["creations"]]
    assert client.post(path + "/validate", json=request).json()["creations_approved"]
    # Approval itself has no writes; a discard at this point needs no cleanup.
    assert client.get("/api/v1/transactions").json()["total"] == 0
    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(
            executor.map(lambda _: client.post(path + "/confirm", json=request), range(2))
        )
    assert all(response.status_code == 201 for response in responses)
    wallets = client.get("/api/v1/wallets").json()
    assert wallets["total"] == 3
    wallet = next(item for item in wallets["wallets"] if item["name"] == "CSV new wallet")
    assert wallet["initial_amount"] == "0" and wallet["icon"] == "wallet"
    category = next(
        item
        for item in client.get("/api/v1/categories").json()["categories"]
        if item["name"] == "CSV new category"
    )
    assert category["subcategories"][0]["name"] == "CSV child"
    items = client.get("/api/v1/transactions").json()
    assert items["total"] == 2
    assert {item["amount"] for item in items["transactions"]} == {"1234.56", "12.50"}
    assert all(item["category_id"] == category["id"] for item in items["transactions"])
    assert all(item["source_wallet_id"] == wallet["id"] for item in items["transactions"])
    second = {**request, "import_id": str(uuid4())}
    assert client.post(path + "/confirm", json=second).status_code == 201
    assert client.get("/api/v1/wallets").json()["total"] == 3
    assert len(client.get("/api/v1/categories").json()["categories"]) == 2


@pytest.mark.integration
def test_concurrent_csv_import_keys_reuse_approved_missing_references(transaction_database):
    client, _, _, _, _ = transaction_database
    request = {
        **parse_csv(
            b"memo,amount,date,type,wallet,category,subcategory\n"
            b"Concurrent,1,2026-01-01,expense,Shared CSV wallet,Shared CSV category,Shared child"
        ).model_dump(mode="json"),
        "import_id": str(uuid4()),
    }
    path = "/api/v1/transactions/import"
    report = client.post(path + "/validate", json=request).json()
    request["approved_creations"] = [item["id"] for item in report["creations"]]
    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(
            executor.map(
                lambda candidate: client.post(path + "/confirm", json=candidate),
                [{**request, "import_id": str(uuid4())} for _ in range(2)],
            )
        )
    assert all(response.status_code == 201 for response in responses)
    assert client.get("/api/v1/transactions").json()["total"] == 2
    assert client.get("/api/v1/wallets").json()["total"] == 3
    categories = client.get("/api/v1/categories").json()["categories"]
    assert len(categories) == 2
    shared = next(item for item in categories if item["name"] == "Shared CSV category")
    assert len(shared["subcategories"]) == 1


@pytest.mark.integration
def test_csv_preset_names_and_keys_share_an_approved_private_copy(transaction_database):
    client, _, _, data, _ = transaction_database
    request = {
        **parse_csv(
            b"amount,date,type,category,subcategory\n"
            b"1,2026-01-01,expense,cibo-fuori,Delivery\n"
            b"2,2026-01-02,expense,CIBOFUORI,Delivery\n"
            b"3,2026-01-03,expense,Casa,Gas"
        ).model_dump(mode="json"),
        "defaults": {"source_wallet_id": data["source_wallet_id"]},
        "import_id": str(uuid4()),
    }
    request["rows"][2]["included"] = False
    path = "/api/v1/transactions/import"
    report = client.post(path + "/validate", json=request).json()
    assert report["invalid"] == 0 and not report["creations_approved"]
    assert len(report["creations"]) == 2
    category = next(item for item in report["creations"] if item["kind"] == "category")
    assert {field: category[field] for field in ["name", "colour", "icon", "preset_key"]} == {
        "name": "CiboFuori",
        "colour": "#f97316",
        "icon": "utensils",
        "preset_key": "cibo-fuori",
    }
    assert (
        report["rows"][0]["transaction"]["category_id"]
        == report["rows"][1]["transaction"]["category_id"]
    )
    assert client.post(path + "/confirm", json=request).status_code == 422
    assert len(client.get("/api/v1/categories").json()["categories"]) == 1
    request["approved_creations"] = [item["id"] for item in report["creations"]]
    assert client.post(path + "/confirm", json=request).status_code == 201
    owned = client.get("/api/v1/categories").json()["categories"]
    copied = next(item for item in owned if item["preset_key"] == "cibo-fuori")
    assert [child["name"] for child in copied["subcategories"]] == ["Delivery"]
    assert client.post("/api/v1/categories/import", json={"keys": ["cibo-fuori"]}).json() == {
        "imported": 0
    }


@pytest.mark.integration
def test_csv_owned_names_precede_renamed_preset_aliases(transaction_database):
    client, _, _, data, _ = transaction_database
    assert client.post("/api/v1/categories/import", json={"keys": ["casa"]}).status_code == 200
    home = next(
        item
        for item in client.get("/api/v1/categories").json()["categories"]
        if item["preset_key"] == "casa"
    )
    client.put(f"/api/v1/categories/{home['id']}", json={**CATEGORY, "name": "My home"})
    request = csv_request(data)
    request["rows"][0]["overrides"] = {"category_id": "  CASA  "}
    path = "/api/v1/transactions/import/validate"
    report = client.post(path, json=request).json()
    assert report["creations"] == [] and report["invalid"] == 0
    assert report["rows"][0]["transaction"]["category_id"] == home["id"]
    custom = client.post("/api/v1/categories", json={**CATEGORY, "name": "Casa"}).json()
    report = client.post(path, json=request).json()
    assert report["creations"] == [] and report["invalid"] == 0
    assert report["rows"][0]["transaction"]["category_id"] == custom["id"]
    request["rows"][0]["overrides"]["category_id"] = home["id"]
    assert (
        client.post(path, json=request).json()["rows"][0]["transaction"]["category_id"]
        == home["id"]
    )


@pytest.mark.integration
def test_csv_created_references_rollback_and_new_plan_requires_approval(
    transaction_database, monkeypatch
):
    client, _, _, _, _ = transaction_database
    request = {
        **parse_csv(
            b"memo,amount,date,type,wallet,category,subcategory\n"
            b"New,1,2026-01-01,expense,Rollback wallet,General,Rollback child"
        ).model_dump(mode="json"),
        "import_id": str(uuid4()),
    }
    path = "/api/v1/transactions/import"
    report = client.post(path + "/validate", json=request).json()
    assert {item["kind"] for item in report["creations"]} == {"wallet", "subcategory"}
    assert (
        next(item for item in report["creations"] if item["kind"] == "subcategory")["icon"]
        == "house"
    )
    request["approved_creations"] = [item["id"] for item in report["creations"]]
    original = transaction_imports.insert_transaction

    async def fail_insert(*args):
        raise DatabaseUnavailable

    monkeypatch.setattr(transaction_imports, "insert_transaction", fail_insert)
    assert client.post(path + "/confirm", json=request).status_code == 503
    assert client.get("/api/v1/wallets").json()["total"] == 2
    assert len(client.get("/api/v1/categories").json()["categories"][0]["subcategories"]) == 1
    monkeypatch.setattr(transaction_imports, "insert_transaction", original)
    request["rows"][0]["overrides"]["category_id"] = "Unapproved category"
    refusal = client.post(path + "/confirm", json=request)
    assert refusal.status_code == 422 and not refusal.json()["validation"]["creations_approved"]
    assert client.get("/api/v1/wallets").json()["total"] == 2
    request["approved_creations"] = [
        item["id"] for item in refusal.json()["validation"]["creations"]
    ]
    assert client.post(path + "/confirm", json=request).status_code == 201


@pytest.mark.integration
@pytest.mark.parametrize("preset", [False, True])
def test_csv_category_name_race_returns_conflict_without_partial_import(
    transaction_database, monkeypatch, preset
):
    client, _, _, data, _ = transaction_database
    request = csv_request(data)
    request["rows"][0]["overrides"] = {
        "category_id": "Casa" if preset else "Concurrent category",
        "subcategory_id": "",
    }
    path = "/api/v1/transactions/import"
    report = client.post(path + "/validate", json=request).json()
    request["approved_creations"] = [item["id"] for item in report["creations"]]
    original = transaction_imports.references

    async def racing_references(connection, subject, *, lock):
        result = await original(connection, subject, lock=lock)
        if lock:
            async with database_connection() as concurrent:
                await concurrent.execute(
                    "INSERT INTO categories (owner_subject, name, colour, icon, preset_key) "
                    "VALUES (%s, %s, '#123abc', 'house', %s)",
                    (
                        subject,
                        "My home" if preset else "CONCURRENT CATEGORY",
                        "casa" if preset else None,
                    ),
                )
        return result

    monkeypatch.setattr(transaction_imports, "references", racing_references)
    response = client.post(path + "/confirm", json=request)
    assert response.status_code == 409
    assert "unique name" in response.json()["detail"]
    assert client.get("/api/v1/transactions").json()["total"] == 0
    monkeypatch.setattr(transaction_imports, "references", original)
    assert client.post(path + "/confirm", json=request).status_code == 201
    assert client.get("/api/v1/transactions").json()["total"] == 1


@pytest.mark.integration
def test_csv_missing_foreign_uuid_or_ambiguous_name_is_not_a_creation(transaction_database):
    client, identity, owners, data, _ = transaction_database
    request = csv_request(data)
    client.post("/api/v1/wallets", json=WALLET)
    request["rows"][0]["overrides"] = {"source_wallet_id": "Everyday"}
    path = "/api/v1/transactions/import"
    report = client.post(path + "/validate", json=request).json()
    assert report["creations"] == [] and report["invalid"] == 1
    identity["sub"] = owners[1]
    request["rows"][0]["overrides"] = {}
    report = client.post(path + "/validate", json=request).json()
    assert report["creations"] == [] and report["invalid"] == 1
    request["approved_creations"] = [data["source_wallet_id"], data["category_id"]]
    assert client.post(path + "/confirm", json=request).status_code == 422


@pytest.mark.integration
def test_transaction_crud_references_and_ownership(transaction_database):
    client, identity, owners, data, destination = transaction_database
    assert client.get("/api/v1/transactions").json()["total"] == 0
    assert len(client.get("/api/v1/transactions/options").json()["wallets"]) == 2
    created = client.post("/api/v1/transactions", json=data)
    assert created.status_code == 201
    item = created.json()
    assert item["description"] == "Lunch"
    assert item["amount"] == data["amount"]
    assert "owner_subject" not in item
    url = f"/api/v1/transactions/{item['id']}"
    assert client.get(url).json() == item
    transfer = {**data, "type": "transfer", "destination_wallet_id": destination}
    updated = client.put(url, json=transfer)
    assert updated.status_code == 200
    assert updated.json()["destination_wallet_id"] == destination
    listing = client.get("/api/v1/transactions").json()["transactions"][0]
    assert listing["source_wallet_name"] == "Everyday"
    assert listing["destination_wallet_name"] == "Savings"
    assert listing["category_name"] == "General"
    assert listing["subcategory_name"] == "General"
    assert listing["occurrence_number"] == 1
    assert listing["occurrence_date"] == data["date"]
    assert all(w["initial_amount"] == "0" for w in client.get("/api/v1/wallets").json()["wallets"])
    for category_url in [
        f"/api/v1/categories/{data['category_id']}/subcategories/{data['subcategory_id']}",
        f"/api/v1/categories/{data['category_id']}",
    ]:
        response = client.delete(category_url)
        assert response.status_code == 409
        assert response.json() == {"detail": "Category is used by transactions"}
    wrong_parent = client.post(
        "/api/v1/categories", json={**CATEGORY, "name": "Wrong parent"}
    ).json()["id"]
    for change in [
        {"source_wallet_id": str(uuid4())},
        {"category_id": wrong_parent},
        {"subcategory_id": str(uuid4())},
    ]:
        assert client.put(url, json={**data, **change}).status_code == 404
    assert client.get(url).json()["type"] == "transfer"

    identity["sub"] = owners[1]
    assert client.get("/api/v1/transactions").json()["transactions"] == []
    assert client.get("/api/v1/transactions/options").json()["wallets"] == []
    for response in [
        client.get(url),
        client.put(url, json=data),
        client.delete(url),
        client.post("/api/v1/transactions", json=data),
    ]:
        assert response.status_code == 404
    other_wallet = client.post("/api/v1/wallets", json=WALLET).json()["id"]
    other_category = client.post("/api/v1/categories", json=CATEGORY).json()["id"]
    other_data = {**DATA, "source_wallet_id": other_wallet, "category_id": other_category}
    assert client.post("/api/v1/transactions", json=other_data).status_code == 201
    for change in [
        {"source_wallet_id": data["source_wallet_id"]},
        {"category_id": data["category_id"]},
        {"subcategory_id": data["subcategory_id"]},
        {"type": "transfer", "destination_wallet_id": destination},
    ]:
        assert client.post("/api/v1/transactions", json={**other_data, **change}).status_code == 404
    identity["sub"] = owners[0]
    assert client.delete(url).status_code == 204
    assert client.delete(url).status_code == 404
    assert client.delete(f"/api/v1/categories/{data['category_id']}").status_code == 204


@pytest.mark.integration
def test_transaction_filtered_pagination_and_exact_amounts(transaction_database):
    client, _, _, data, destination = transaction_database
    ids = []
    for index in range(11):
        result = client.post(
            "/api/v1/transactions",
            json={**data, "description": f"Food {index}", "date": f"2026-01-{index + 1:02}"},
        )
        assert result.status_code == 201
        ids.append(result.json()["id"])
    transfer = client.post(
        "/api/v1/transactions",
        json={
            **data,
            "description": "100% transfer",
            "type": "transfer",
            "destination_wallet_id": destination,
            "date": "2026-02-01",
        },
    )
    assert transfer.status_code == 201
    page = client.get("/api/v1/transactions?page_size=3&page=2").json()
    assert page["total"] == 12
    assert [t["id"] for t in page["transactions"]] == list(reversed(ids))[2:5]
    assert client.get("/api/v1/transactions?page=999").json()["transactions"] == []
    for query, total in [
        ("q=FOOD", 11),
        ("q=%25", 1),
        ("type=income", 0),
        ("type=transfer", 1),
        (f"wallet_id={destination}", 1),
        (f"wallet_id={data['source_wallet_id']}", 12),
        (f"category_id={data['category_id']}", 12),
        (f"subcategory_id={data['subcategory_id']}", 12),
        ("date_from=2026-01-03&date_to=2026-01-05", 3),
        (f"wallet_id={uuid4()}", 0),
    ]:
        result = client.get("/api/v1/transactions?" + query)
        assert result.status_code == 200
        assert result.json()["total"] == total
    assert page["transactions"][0]["amount"] == data["amount"]


@pytest.mark.integration
def test_transaction_summary_is_exact_filtered_owner_scoped_and_not_paginated(transaction_database):
    client, identity, owners, data, destination = transaction_database
    foreign_currency_wallet = client.post(
        "/api/v1/wallets", json={**WALLET, "name": "USD account", "currency": "USD"}
    ).json()["id"]
    income = "12345678901234567890.123456789012345679"
    income_category = income_reference(client)
    for change in [
        {"type": "income", "amount": income, **income_category},
        {"type": "expense", "amount": "0.000000000000000001"},
        {"type": "expense", "amount": "2", "source_wallet_id": destination},
        {"type": "transfer", "amount": "7.01", "destination_wallet_id": destination},
        {"type": "expense", "amount": "1", "recurrence": "weekly", "recurrence_count": 3},
        {"type": "expense", "amount": "4.25", "source_wallet_id": foreign_currency_wallet},
        *[
            {"type": "income", "amount": "1", "date": "2026-01-20", **income_category}
            for _ in range(5)
        ],
    ]:
        assert (
            client.post(
                "/api/v1/transactions", json={**data, "date": "2026-01-01", **change}
            ).status_code
            == 201
        )
    identity["sub"] = owners[1]
    other_wallet = client.post("/api/v1/wallets", json=WALLET).json()["id"]
    other_category = client.post("/api/v1/categories", json=CATEGORY).json()["id"]
    assert (
        client.post(
            "/api/v1/transactions",
            json={
                **data,
                "source_wallet_id": other_wallet,
                "category_id": other_category,
                "subcategory_id": None,
                "amount": "999",
                "date": "2026-01-01",
            },
        ).status_code
        == 201
    )
    identity["sub"] = owners[0]
    query = "/api/v1/transactions?date_from=2026-01-01&date_to=2026-01-31&page_size=2"
    response = client.get(query)
    assert response.status_code == 200
    assert "no-store" in response.headers["cache-control"]
    first = response.json()
    assert first["total"] == 13 and len(first["transactions"]) == 2
    assert first["summary"]["currencies"] == [
        {
            "currency": "EUR",
            "income": "12345678901234567895.123456789012345679",
            "expense": "5.000000000000000001",
            "transfer": "7.01",
            "net": "12345678901234567890.123456789012345678",
        },
        {"currency": "USD", "income": "0", "expense": "4.25", "transfer": "0", "net": "-4.25"},
    ]
    assert first["summary"]["wallet_expenses"] == [
        {
            "wallet_id": data["source_wallet_id"],
            "wallet_name": "Everyday",
            "currency": "EUR",
            "amount": "3.000000000000000001",
        },
        {"wallet_id": destination, "wallet_name": "Savings", "currency": "EUR", "amount": "2"},
        {
            "wallet_id": foreign_currency_wallet,
            "wallet_name": "USD account",
            "currency": "USD",
            "amount": "4.25",
        },
    ]
    for page in [2, 99]:
        assert client.get(query + f"&page={page}").json()["summary"] == first["summary"]
    filtered = client.get(query + f"&wallet_id={destination}").json()
    assert filtered["total"] == 2
    assert filtered["summary"]["currencies"] == [
        {"currency": "EUR", "income": "0", "expense": "2", "transfer": "7.01", "net": "-2"}
    ]
    assert filtered["summary"]["wallet_expenses"] == [
        {"wallet_id": destination, "wallet_name": "Savings", "currency": "EUR", "amount": "2"}
    ]
    income_only = client.get(query + "&type=income").json()["summary"]
    assert income_only["wallet_expenses"] == []
    assert income_only["currencies"][0]["net"] == "12345678901234567895.123456789012345679"
    assert income_only["currencies"][0]["expense"] == "0"
    assert income_only["currencies"][0]["transfer"] == "0"
    for extra in ["&q=absent", f"&wallet_id={other_wallet}", "&date_from=2027-01-01"]:
        if extra.startswith("&date_from"):
            empty = client.get("/api/v1/transactions?date_from=2027-01-01").json()
        else:
            empty = client.get(query + extra).json()
        assert empty["summary"] == {"currencies": [], "wallet_expenses": []}
        assert empty["total"] == 0


@pytest.mark.integration
@pytest.mark.parametrize(
    ("start", "frequency", "count", "as_of", "expected"),
    [
        (
            "2026-01-31",
            "monthly",
            None,
            "2026-04-30",
            ["2026-04-30", "2026-03-31", "2026-02-28", "2026-01-31"],
        ),
        (
            "2024-02-29",
            "annually",
            None,
            "2028-02-29",
            ["2028-02-29", "2027-02-28", "2026-02-28", "2025-02-28", "2024-02-29"],
        ),
        ("2026-01-01", "weekly", 3, "2026-02-01", ["2026-01-15", "2026-01-08", "2026-01-01"]),
        ("2026-01-31", "monthly", None, "2026-02-27", ["2026-01-31"]),
        ("2026-01-31", "monthly", 1, "2027-01-31", ["2026-01-31"]),
        ("2099-12-31", "annually", None, "2026-01-01", ["2099-12-31"]),
        ("9999-12-31", "monthly", None, "2026-01-01", ["9999-12-31"]),
    ],
)
def test_recurrence_occurrences_are_anchored_bounded_and_idempotent(
    transaction_database, start, frequency, count, as_of, expected
):
    client, _, owners, data, _ = transaction_database
    created = client.post(
        "/api/v1/transactions",
        json={
            **data,
            "amount": "2.50",
            "date": start,
            "recurrence": frequency,
            "recurrence_count": count,
        },
    )
    assert created.status_code == 201

    async def check():
        for _ in range(2):
            result = await transactions.list_transactions(
                owners[0], TransactionFilters(), date.fromisoformat(as_of)
            )
            assert [t.occurrence_date.isoformat() for t in result.transactions] == expected
            assert result.total == len(expected)
            assert result.summary.currencies[0].expense == Decimal("2.50") * len(expected)
            assert result.summary.currencies[0].income == 0
            assert result.summary.currencies[0].transfer == 0
            assert result.summary.currencies[0].net == -Decimal("2.50") * len(expected)
        filtered = await transactions.list_transactions(
            owners[0],
            TransactionFilters(date_from=date.fromisoformat(expected[0]), page_size=1),
            date.fromisoformat(as_of),
        )
        assert filtered.total == 1
        assert filtered.transactions[0].occurrence_date.isoformat() == expected[0]

    asyncio.run(check())
    url = f"/api/v1/transactions/{created.json()['id']}"
    assert (
        client.put(url, json={**data, **income_reference(client), "type": "income"}).status_code
        == 200
    )
    assert client.get("/api/v1/transactions").json()["total"] == 1
    assert client.delete(url).status_code == 204
    assert client.get("/api/v1/transactions").json()["total"] == 0


@pytest.mark.integration
def test_transaction_database_constraints(transaction_database):
    client, _, owners, data, _ = transaction_database
    category = client.post(
        "/api/v1/categories", json={**CATEGORY, "name": "Other category"}
    ).json()["id"]

    async def check():
        await migrate()
        async with database_connection() as connection:
            await connection.execute("INSERT INTO users (subject) VALUES (%s)", (owners[1],))
            for change in [
                {"owner_subject": owners[1]},
                {"category_id": category},
                {"source_wallet_id": str(uuid4())},
            ]:
                values = {
                    "owner_subject": owners[0],
                    **data,
                    **change,
                }
                with pytest.raises(psycopg.errors.ForeignKeyViolation):
                    async with connection.transaction():
                        await connection.execute(
                            "INSERT INTO transactions "
                            "(owner_subject, description, amount, date, type, source_wallet_id, "
                            "category_id, subcategory_id) "
                            "VALUES (%(owner_subject)s, %(description)s, %(amount)s, %(date)s, "
                            "%(type)s, %(source_wallet_id)s, %(category_id)s, %(subcategory_id)s)",
                            values,
                        )
            for amount in [Decimal("NaN"), Decimal("Infinity"), Decimal("-Infinity"), Decimal("0")]:
                with pytest.raises(psycopg.errors.CheckViolation):
                    async with connection.transaction():
                        await connection.execute(
                            "INSERT INTO transactions "
                            "(owner_subject, description, amount, date, type, source_wallet_id, "
                            "category_id) "
                            "VALUES (%s, 'Invalid', %s, '2026-01-01', 'expense', %s, %s)",
                            (owners[0], amount, data["source_wallet_id"], data["category_id"]),
                        )

    asyncio.run(check())


@pytest.mark.integration
def test_category_kinds_are_owned_immutable_and_enforced_for_every_transaction_type(
    transaction_database,
):
    client, _, owners, data, destination = transaction_database
    income = client.post("/api/v1/categories", json={**CATEGORY, "kind": "income"})
    assert income.status_code == 201
    income_id = income.json()["id"]
    assert client.post("/api/v1/categories", json={**CATEGORY, "kind": "income"}).status_code == 409
    assert client.put(f"/api/v1/categories/{income_id}", json=CATEGORY).status_code == 422
    child = client.post(f"/api/v1/categories/{income_id}/subcategories", json=CATEGORY).json()["id"]
    valid_income = {**data, "type": "income", "category_id": income_id, "subcategory_id": child}
    assert client.post("/api/v1/transactions", json=valid_income).status_code == 201
    for candidate in [
        {**data, "type": "income"},
        {**valid_income, "type": "expense"},
        {**valid_income, "type": "transfer", "destination_wallet_id": destination},
    ]:
        assert client.post("/api/v1/transactions", json=candidate).status_code == 422
    assert (
        client.post(
            "/api/v1/transactions", json={**valid_income, "subcategory_id": data["subcategory_id"]}
        ).status_code
        == 404
    )

    async def check_database_guards():
        async with database_connection() as connection:
            for amount, kind, category, error in [
                (1, "income", data["category_id"], psycopg.errors.ForeignKeyViolation),
                (-1, "income", income_id, psycopg.errors.CheckViolation),
            ]:
                with pytest.raises(error):
                    async with connection.transaction():
                        await connection.execute(
                            "INSERT INTO transactions (owner_subject, amount, date, type, "
                            "source_wallet_id, category_id) "
                            "VALUES (%s, %s, '2024-01-01', %s, %s, %s)",
                            (owners[0], amount, kind, data["source_wallet_id"], category),
                        )

    asyncio.run(check_database_guards())


@pytest.mark.integration
def test_negative_expenses_increase_balance_and_reduce_all_due_spending_aggregates(
    transaction_database,
):
    client, _, owners, data, _ = transaction_database
    refund = client.post(
        "/api/v1/transactions",
        json={
            **data,
            "amount": "-10",
            "date": "2024-01-01",
            "recurrence": "monthly",
            "recurrence_count": 2,
        },
    )
    assert refund.status_code == 201
    assert (
        client.post(
            "/api/v1/transactions", json={**data, "amount": "5", "date": "2024-01-01"}
        ).status_code
        == 201
    )
    annual = client.get("/api/v1/summary/analysis?year=2024").json()
    assert Decimal(annual["summary"]["currencies"][0]["total"]) == Decimal("-15")
    assert annual["charts"][0]["ranking"][0]["value"] == -10000
    assert [point["value"] for point in annual["charts"][0]["trend"][:2]] == [-5000, -10000]

    async def check():
        listed = await transactions.list_transactions(
            owners[0], TransactionFilters(), date(2024, 2, 29)
        )
        assert listed.summary.currencies[0].expense == -15
        assert listed.summary.currencies[0].net == 15
        assert listed.summary.wallet_expenses[0].amount == -15
        balance = await wallets.list_wallets(owners[0], 1, 100, date(2024, 2, 29))
        assert (
            next(
                item for item in balance.wallets if str(item.id) == data["source_wallet_id"]
            ).current_amount
            == 15
        )
        averaged = await expense_comparison(
            owners[0],
            ExpenseComparisonInput(
                kind="average",
                periods=[{"year": 2023, "end_year": 2024}, {"year": 2021, "end_year": 2022}],
            ),
            date(2024, 2, 29),
        )
        assert averaged.currencies[0].totals[0].amount == Decimal("-7.5")
        assert averaged.currencies[0].totals[0].value == -10000

    asyncio.run(check())
    assert (
        client.put(
            f"/api/v1/transactions/{refund.json()['id']}",
            json={**data, "amount": "-2", "date": "2024-01-01"},
        ).status_code
        == 200
    )
    assert client.delete(f"/api/v1/transactions/{refund.json()['id']}").status_code == 204


@pytest.mark.integration
def test_csv_references_and_proposals_are_isolated_by_category_kind(transaction_database):
    client, _, _, data, _ = transaction_database
    request = {
        **parse_csv(
            b"amount,date,type,category,subcategory\n"
            b"-1 EUR,2024-01-01,expense,Other,refund\n"
            b"2,2024-01-01,income,Other,refund\n"
            b"3,2024-01-01,income,income-other,private sell"
        ).model_dump(mode="json"),
        "defaults": {"source_wallet_id": data["source_wallet_id"]},
        "import_id": str(uuid4()),
    }
    path = "/api/v1/transactions/import"
    report = client.post(path + "/validate", json=request).json()
    assert report["invalid"] == 0
    roots = [item for item in report["creations"] if item["kind"] == "category"]
    assert {item["category_kind"] for item in roots} == {"income", "expense"}
    assert len(roots) == 2 and roots[0]["id"] != roots[1]["id"]
    request["approved_creations"] = [item["id"] for item in report["creations"]]
    assert client.post(path + "/confirm", json=request).status_code == 201
    owned = client.get("/api/v1/categories").json()["categories"]
    assert {item["kind"] for item in owned if item["name"] == "Other"} == {"income", "expense"}
    assert client.get("/api/v1/transactions").json()["total"] == 3
    wrong = {**request, "import_id": str(uuid4())}
    wrong["rows"][1]["overrides"] = {"category_id": data["category_id"]}
    refusal = client.post(path + "/validate", json=wrong).json()
    assert "category_id" in refusal["rows"][1]["errors"]
    assert client.post(path + "/confirm", json=wrong).status_code == 422
    assert client.get("/api/v1/transactions").json()["total"] == 3
