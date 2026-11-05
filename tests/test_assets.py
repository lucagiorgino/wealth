import asyncio
import os
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

import psycopg
import pytest

from app.core.auth import require_identity
from app.core.config import get_settings
from app.db import asset_snapshots
from app.db.migrate import migrate
from app.db.postgres import database_connection
from app.main import app
from app.services import asset_snapshots as snapshot_jobs
from app.services import assets as assets_service
from app.services import wallets as wallets_service
from app.services.assets import asset_summary, percentage_change

ASSET = {
    "name": "Index fund",
    "asset_group": "stocks",
    "currency": "EUR",
    "date": "2023-12-31",
    "amount": "250.1234567890123456789",
}


def test_snapshot_worker_is_started_and_awaited_on_shutdown(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://unused.invalid/unused")
    get_settings.cache_clear()

    async def verify():
        started, stopped = asyncio.Event(), asyncio.Event()

        async def close():
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                stopped.set()

        monkeypatch.setattr(snapshot_jobs, "close_due_snapshots", close)
        async with snapshot_jobs.snapshot_lifespan(app):
            await asyncio.wait_for(started.wait(), timeout=1)
        assert stopped.is_set()

    try:
        asyncio.run(verify())
    finally:
        get_settings.cache_clear()


def test_snapshot_worker_logs_database_outage_and_retries(monkeypatch, caplog):
    attempts = []

    async def close():
        attempts.append(True)
        if len(attempts) == 1:
            raise snapshot_jobs.DatabaseUnavailable

    async def wait(_):
        if len(attempts) >= 2:
            raise asyncio.CancelledError

    monkeypatch.setattr(snapshot_jobs, "close_due_snapshots", close)
    monkeypatch.setattr(snapshot_jobs.asyncio, "sleep", wait)
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(snapshot_jobs.snapshot_worker())
    assert len(attempts) == 2
    assert "Month-end balance closure unavailable" in caplog.text


@pytest.fixture
def asset_client(client, monkeypatch):
    identity = {"sub": f"test-assets-{uuid4()}"}
    monkeypatch.setitem(app.dependency_overrides, require_identity, lambda: identity)
    return client, identity


@pytest.fixture
def asset_database(asset_client, monkeypatch):
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to a dedicated PostgreSQL test database")
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    asyncio.run(migrate())
    client, identity = asset_client
    owners = [identity["sub"], f"test-assets-{uuid4()}"]
    yield client, identity, owners

    async def cleanup():
        async with database_connection() as connection:
            await connection.execute("DELETE FROM users WHERE subject = ANY(%s)", (owners,))

    try:
        asyncio.run(cleanup())
    finally:
        get_settings.cache_clear()


@pytest.mark.parametrize(
    "method,path,payload",
    [
        ("GET", "?year=2024", None),
        ("POST", "", ASSET),
        ("PUT", f"/{uuid4()}/valuations", {"date": "2024-01-31", "amount": "1"}),
        ("DELETE", f"/{uuid4()}", None),
    ],
)
def test_assets_authentication_and_no_store(client, method, path, payload):
    result = client.request(method, f"/api/v1/assets{path}", json=payload)
    assert result.status_code == 401
    assert result.headers["cache-control"] == "private, no-store"


@pytest.mark.parametrize(
    "change",
    [
        {"owner_subject": "forged"},
        {"name": " "},
        {"name": "a" * 101},
        {"asset_group": "unsupported"},
        {"currency": "FAKE"},
        {"amount": "-1"},
        {"amount": "NaN"},
        {"amount": "Infinity"},
        {"amount": 1.2},
        {"amount": True},
        {"date": "9999-12-31"},
        {"date": "2024-02-30"},
        {"date": "2024-01-01T00:00:00"},
        {"date": 0},
    ],
)
def test_asset_input_refusals_before_database_access(asset_client, change):
    client, _ = asset_client
    assert client.post("/api/v1/assets", json={**ASSET, **change}).status_code == 422


def test_asset_database_failure_is_not_an_empty_report(asset_client):
    client, _ = asset_client
    for method, path, payload in [
        ("GET", "?year=2024", None),
        ("POST", "", ASSET),
        ("PUT", f"/{uuid4()}/valuations", {"date": "2024-01-31", "amount": "0"}),
        ("DELETE", f"/{uuid4()}", None),
    ]:
        assert client.request(method, f"/api/v1/assets{path}", json=payload).status_code == 503


@pytest.mark.parametrize("year", ["0", "10000", "bad"])
def test_asset_year_refusals(asset_client, year):
    client, _ = asset_client
    assert client.get(f"/api/v1/assets?year={year}").status_code == 422


def test_asset_percentages_are_exact_signed_and_undefined_from_zero():
    assert percentage_change(Decimal("2"), Decimal("3")) == Decimal("-33.333333333333333333")
    assert percentage_change(Decimal("-1"), Decimal("-3")) == Decimal("66.666666666666666667")
    assert percentage_change(Decimal("1"), Decimal("0")) is None
    assert percentage_change(
        Decimal("1000000000000000000000000000000.1"),
        Decimal("1000000000000000000000000000000"),
    ) == Decimal("0")


@pytest.mark.integration
def test_asset_reads_do_not_provision_users(asset_database):
    client, _, owners = asset_database
    result = client.get("/api/v1/assets?year=2024")
    assert result.status_code == 200 and result.json()["currencies"] == []

    async def verify():
        async with database_connection() as connection:
            cursor = await connection.execute(
                "SELECT 1 FROM users WHERE subject = %s", (owners[0],)
            )
            assert await cursor.fetchone() is None

    asyncio.run(verify())


@pytest.mark.integration
def test_annual_assets_combine_exact_owned_cash_investments_and_liabilities(asset_database):
    client, identity, owners = asset_database
    wallet = client.post(
        "/api/v1/wallets",
        json={"name": "Cash", "icon": "wallet", "colour": "#123abc", "initial_amount": "1000"},
    ).json()
    destination = client.post(
        "/api/v1/wallets", json={"name": "Savings", "icon": "wallet", "colour": "#123abc"}
    ).json()
    category = client.post(
        "/api/v1/categories", json={"name": "Spending", "icon": "house", "colour": "#123abc"}
    ).json()
    base = {"source_wallet_id": wallet["id"], "category_id": category["id"], "date": "2024-01-31"}
    for data in [
        {**base, "type": "expense", "amount": "10", "recurrence": "monthly", "recurrence_count": 3},
        {**base, "type": "expense", "amount": "-2", "date": "2024-02-01"},
        {**base, "type": "transfer", "amount": "25", "destination_wallet_id": destination["id"]},
        {**base, "type": "expense", "amount": "999999", "date": "9999-01-01"},
    ]:
        assert client.post("/api/v1/transactions", json=data).status_code == 201
    position = client.post("/api/v1/assets", json=ASSET)
    assert position.status_code == 201
    position = position.json()
    assert (
        client.put(
            f"/api/v1/assets/{position['id']}/valuations",
            json={"date": "2024-02-29", "amount": "300.1234567890123456789"},
        ).status_code
        == 204
    )
    assert (
        client.post(
            "/api/v1/assets",
            json={**ASSET, "name": "Loan", "asset_group": "liabilities", "amount": "100"},
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/api/v1/assets", json={**ASSET, "name": "Dollars", "currency": "USD", "amount": "5"}
        ).status_code
        == 201
    )
    report = client.get("/api/v1/assets?year=2024")
    assert report.status_code == 200
    eur, usd = report.json()["currencies"]
    assert [eur["currency"], usd["currency"]] == ["EUR", "USD"]
    assert eur["assets"]["opening"] == "1250.1234567890123456789"
    assert eur["liabilities"]["latest"] == "100"
    assert eur["net_worth"]["months"][:3] == [
        "1140.1234567890123456789",
        "1182.1234567890123456789",
        "1172.1234567890123456789",
    ]
    assert eur["change"]["months"][:3] == [
        "-10.0000000000000000000",
        "42.0000000000000000000",
        "-10.0000000000000000000",
    ]
    assert eur["net_worth"]["latest"] == "1172.1234567890123456789"
    assert eur["missing_values"] == [0] * 13
    assert eur["trend"][1]["amount"] == eur["net_worth"]["months"][1]
    assert {point["key"] for point in eur["allocation"]} == {"cash", "stocks"}
    assert usd["net_worth"]["latest"] == "5"
    identity["sub"] = owners[1]
    assert client.get("/api/v1/assets?year=2024").json()["currencies"] == []
    assert (
        client.put(
            f"/api/v1/assets/{position['id']}/valuations",
            json={"date": "2024-02-29", "amount": "0"},
        ).status_code
        == 404
    )
    assert client.delete(f"/api/v1/assets/{position['id']}").status_code == 404
    identity["sub"] = owners[0]
    assert client.get("/api/v1/assets?year=2024").json()["currencies"][0] == eur


@pytest.mark.integration
def test_asset_missing_zero_future_months_and_valuation_upserts(asset_database):
    client, _, owners = asset_database
    result = client.post("/api/v1/assets", json={**ASSET, "date": "2024-02-10", "amount": "0"})
    assert result.status_code == 201
    asset_id = result.json()["id"]
    assert (
        client.put(
            f"/api/v1/assets/{asset_id}/valuations",
            json={"date": "2024-02-10", "amount": "0.12345678901234567890123456789"},
        ).status_code
        == 204
    )
    report = asyncio.run(asset_summary(owners[0], 2024, date(2024, 3, 5)))
    eur = report.currencies[0]
    holding = eur.groups[0].holdings[0]
    assert holding.values.opening is None and holding.values.months[0] is None
    assert holding.values.months[1:3] == [Decimal("0.12345678901234567890123456789")] * 2
    assert holding.values.months[3:] == [None] * 9
    assert eur.net_worth.months[3:] == [None] * 9
    assert eur.change.months[1] is None
    assert eur.change.months[2] == 0 and eur.change_percent.months[2] == 0
    assert eur.missing_values[:3] == [1, 1, 0]
    assert eur.trend[3].amount is None and eur.trend[3].value is None
    assert (
        asyncio.run(asset_summary(owners[0], 2025, date(2024, 12, 15)))
        .currencies[0]
        .net_worth.opening
        is None
    )
    assert (
        asyncio.run(asset_summary(owners[0], 1, date(2024, 3, 5))).currencies[0].net_worth.opening
        is None
    )
    assert client.delete(f"/api/v1/assets/{asset_id}").status_code == 204
    retained = client.get("/api/v1/assets?year=2024").json()["currencies"][0]
    closed = retained["groups"][0]["holdings"][0]
    assert closed["active"] is False
    assert closed["values"]["months"][1] == "0.12345678901234567890123456789"

    async def verify():
        async with database_connection() as connection:
            cursor = await connection.execute(
                "SELECT 1 FROM asset_valuations WHERE asset_id = %s", (asset_id,)
            )
            assert await cursor.fetchone() is None

    asyncio.run(verify())


@pytest.fixture
def month_clock(monkeypatch):
    clock = [datetime(2024, 1, 31, 23, 59, tzinfo=UTC)]

    class FixedClock:
        @classmethod
        def now(cls, timezone):
            return clock[0]

    for module in (asset_snapshots, assets_service, wallets_service):
        monkeypatch.setattr(module, "datetime", FixedClock)
    return clock


@pytest.mark.integration
def test_month_end_cash_is_frozen_live_and_carried_forward_with_neutral_adjustments(
    asset_database, month_clock
):
    client, _, owners = asset_database
    wallet = client.post(
        "/api/v1/wallets",
        json={
            "name": "Cash",
            "icon": "wallet",
            "colour": "#123abc",
            "initial_amount": "100",
        },
    ).json()
    category = client.post(
        "/api/v1/categories",
        json={
            "name": "Spending",
            "icon": "house",
            "colour": "#123abc",
        },
    ).json()
    expense = {
        "type": "expense",
        "amount": "10",
        "date": "2024-01-20",
        "source_wallet_id": wallet["id"],
        "category_id": category["id"],
    }
    transaction = client.post("/api/v1/transactions", json=expense).json()
    first = client.get("/api/v1/assets?year=2024").json()["currencies"][0]
    assert first["net_worth"]["months"][:2] == ["90", None]
    adjustment = {
        "type": "balance_adjustment",
        "amount": "7.123456789012345678",
        "date": "2024-01-31",
        "source_wallet_id": wallet["id"],
    }
    assert client.post("/api/v1/transactions", json=adjustment).status_code == 201
    assert (
        client.get("/api/v1/assets?year=2024").json()["currencies"][0]["net_worth"]["months"][0]
        == "90"
    )

    month_clock[0] = datetime(2024, 2, 1, tzinfo=UTC)
    # The first write catches up the close before modifying the historical definition.
    assert (
        client.put(
            f"/api/v1/transactions/{transaction['id']}",
            json={
                **expense,
                "amount": "80",
            },
        ).status_code
        == 200
    )
    report = client.get("/api/v1/assets?year=2024").json()["currencies"][0]
    assert report["net_worth"]["months"][:2] == ["90", "97.123456789012345678"]
    assert (
        client.get("/api/v1/wallets").json()["wallets"][0]["current_amount"]
        == "97.123456789012345678"
    )
    assert (
        client.put(
            f"/api/v1/wallets/{wallet['id']}",
            json={
                "name": "Cash",
                "icon": "wallet",
                "colour": "#123abc",
                "initial_amount": "999",
            },
        ).json()["current_amount"]
        == "97.123456789012345678"
    )
    assert (
        client.post(
            "/api/v1/transactions",
            json={
                **expense,
                "amount": "-2",
                "date": "2024-02-01",
            },
        ).status_code
        == 201
    )
    series = client.post(
        "/api/v1/transactions",
        json={
            **expense,
            "amount": "3",
            "date": "2024-02-29",
            "recurrence": "monthly",
        },
    )
    assert series.status_code == 201
    assert (
        client.post(
            "/api/v1/transactions",
            json={
                **adjustment,
                "amount": "-5",
                "date": "2024-02-29",
            },
        ).status_code
        == 201
    )
    current = client.get("/api/v1/assets?year=2024").json()["currencies"][0]
    assert current["net_worth"]["months"][1] == "99.123456789012345678"
    month_clock[0] = datetime(2024, 3, 1, tzinfo=UTC)

    async def close_concurrently():
        await asyncio.gather(
            asset_snapshots.close_due_snapshots(month_clock[0].date()),
            asset_snapshots.close_due_snapshots(month_clock[0].date()),
        )
        async with database_connection() as connection:
            cursor = await connection.execute(
                "SELECT month, amount FROM asset_balance_snapshots WHERE owner_subject = %s "
                "AND source_id = %s ORDER BY month",
                (owners[0], wallet["id"]),
            )
            rows = await cursor.fetchall()
            assert len(rows) == 3
            assert rows[-1]["amount"] == Decimal("96.123456789012345678")
            with pytest.raises(psycopg.errors.CheckViolation):
                async with connection.transaction():
                    await connection.execute(
                        "UPDATE asset_balance_snapshots SET amount = 0 WHERE owner_subject = %s",
                        (owners[0],),
                    )

    asyncio.run(close_concurrently())
    march = client.get("/api/v1/assets?year=2024").json()["currencies"][0]
    assert march["net_worth"]["months"][:3] == [
        "90",
        "96.123456789012345678",
        "91.123456789012345678",
    ]
    month_clock[0] = datetime(2024, 3, 30, tzinfo=UTC)
    later = client.get("/api/v1/assets?year=2024").json()["currencies"][0]
    assert later["net_worth"]["months"][:3] == [
        "90",
        "96.123456789012345678",
        "88.123456789012345678",
    ]
    month_clock[0] = datetime(2024, 12, 31, 23, 59, tzinfo=UTC)
    assert (
        client.post(
            "/api/v1/transactions",
            json={
                **adjustment,
                "amount": "1",
                "date": "2024-12-31",
            },
        ).status_code
        == 201
    )
    december = client.get("/api/v1/assets?year=2024").json()["currencies"][0]["net_worth"][
        "months"
    ][11]
    month_clock[0] = datetime(2025, 1, 1, tzinfo=UTC)
    following = client.get("/api/v1/assets?year=2025").json()["currencies"][0]
    assert following["net_worth"]["opening"] == december
    assert Decimal(following["net_worth"]["months"][0]) - Decimal(december) == Decimal(1)


@pytest.mark.integration
def test_closed_holdings_retain_history_and_late_additions_do_not_rewrite_coverage(
    asset_database, month_clock
):
    client, _, _ = asset_database
    position = client.post("/api/v1/assets", json={**ASSET, "amount": "100"}).json()
    january = client.get("/api/v1/assets?year=2024").json()["currencies"][0]
    month_clock[0] = datetime(2024, 2, 1, tzinfo=UTC)
    assert (
        client.put(
            f"/api/v1/assets/{position['id']}/valuations",
            json={
                "date": "2024-01-31",
                "amount": "200",
            },
        ).status_code
        == 204
    )
    late = client.post(
        "/api/v1/assets",
        json={
            **ASSET,
            "name": "Late holding",
            "amount": "5",
        },
    ).json()
    february = client.get("/api/v1/assets?year=2024").json()["currencies"][0]
    assert february["net_worth"]["months"][:2] == ["100", "205"]
    assert february["missing_values"][:2] == january["missing_values"][:2] == [0, 0]
    assert february["change_percent"]["months"][0] == january["change_percent"]["months"][0]
    assert client.delete(f"/api/v1/assets/{position['id']}").status_code == 204
    closed = client.get("/api/v1/assets?year=2024").json()["currencies"][0]
    assert closed["net_worth"]["months"][:2] == ["100", "5"]
    old = next(item for item in closed["groups"][0]["holdings"] if item["id"] == position["id"])
    assert old["active"] is False and old["values"]["months"][0] == "100"
    assert client.delete(f"/api/v1/assets/{late['id']}").status_code == 204
    assert (
        client.get("/api/v1/assets?year=2024").json()["currencies"][0]["net_worth"]["months"][0]
        == "100"
    )


@pytest.mark.integration
def test_snapshot_currency_changes_and_new_wallets_do_not_reopen_closed_months(
    asset_database, month_clock
):
    client, _, _ = asset_database
    payload = {"name": "Cash", "icon": "wallet", "colour": "#123abc", "initial_amount": "10"}
    wallet = client.post("/api/v1/wallets", json=payload).json()
    assert client.get("/api/v1/assets?year=2024").status_code == 200
    month_clock[0] = datetime(2024, 2, 1, tzinfo=UTC)
    changed = client.put(f"/api/v1/wallets/{wallet['id']}", json={**payload, "currency": "USD"})
    assert changed.status_code == 200
    category = client.post(
        "/api/v1/categories",
        json={
            "name": "Spending",
            "icon": "house",
            "colour": "#123abc",
        },
    ).json()
    old = client.post(
        "/api/v1/transactions",
        json={
            "type": "expense",
            "amount": "3",
            "date": "2024-01-20",
            "source_wallet_id": wallet["id"],
            "category_id": category["id"],
        },
    )
    assert old.status_code == 201
    report = client.get("/api/v1/assets?year=2024").json()["currencies"]
    assert report[0]["currency"] == "EUR"
    assert report[0]["net_worth"]["months"][:2] == ["10", "0"]
    assert report[0]["groups"][0]["holdings"][0]["active"] is False
    assert report[1]["currency"] == "USD"
    assert report[1]["net_worth"]["months"][1] == "10"
    assert client.get("/api/v1/wallets").json()["wallets"][0]["current_amount"] == "10"
    month_clock[0] = datetime(2024, 3, 1, tzinfo=UTC)
    assert client.delete(f"/api/v1/transactions/{old.json()['id']}").status_code == 204
    assert client.delete(f"/api/v1/wallets/{wallet['id']}").status_code == 204
    closed = client.get("/api/v1/assets?year=2024").json()["currencies"]
    assert closed[0]["net_worth"]["months"][0] == "10"
    assert closed[1]["net_worth"]["months"][1] == "10"
    assert all(not item["groups"][0]["holdings"][0]["active"] for item in closed)


@pytest.mark.integration
def test_asset_foreign_keys_and_currency_constraints_enforce_ownership(asset_database):
    client, _, owners = asset_database
    asset_id = client.post("/api/v1/assets", json=ASSET).json()["id"]

    async def verify():
        async with database_connection() as connection:
            await connection.execute("INSERT INTO users(subject) VALUES (%s)", (owners[1],))
            for statement, params, error in [
                (
                    "INSERT INTO asset_valuations(asset_id, owner_subject, date, amount) "
                    "VALUES (%s,%s,'2024-01-01',1)",
                    (asset_id, owners[1]),
                    psycopg.errors.ForeignKeyViolation,
                ),
                (
                    "UPDATE assets SET currency = 'FAKE' WHERE id = %s",
                    (asset_id,),
                    psycopg.errors.CheckViolation,
                ),
                (
                    "UPDATE asset_valuations SET amount = '-1' WHERE asset_id = %s",
                    (asset_id,),
                    psycopg.errors.CheckViolation,
                ),
                (
                    "UPDATE asset_valuations SET amount = 'NaN' WHERE asset_id = %s",
                    (asset_id,),
                    psycopg.errors.CheckViolation,
                ),
            ]:
                with pytest.raises(error):
                    async with connection.transaction():
                        await connection.execute(statement, params)

    asyncio.run(verify())
