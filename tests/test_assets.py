import asyncio
import os
from datetime import date
from decimal import Decimal
from uuid import uuid4

import psycopg
import pytest

from app.core.auth import require_identity
from app.core.config import get_settings
from app.db.migrate import migrate
from app.db.postgres import database_connection
from app.main import app
from app.services.assets import asset_summary, percentage_change

ASSET = {
    "name": "Index fund",
    "asset_group": "stocks",
    "currency": "EUR",
    "date": "2023-12-31",
    "amount": "250.1234567890123456789",
}


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
    assert client.get("/api/v1/assets?year=2024").json()["currencies"] == []

    async def verify():
        async with database_connection() as connection:
            cursor = await connection.execute(
                "SELECT 1 FROM asset_valuations WHERE asset_id = %s", (asset_id,)
            )
            assert await cursor.fetchone() is None

    asyncio.run(verify())


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
