import asyncio
import base64
import os
from decimal import Decimal
from io import BytesIO
from uuid import uuid4

import pytest
from PIL import Image

from app.core.auth import require_identity
from app.core.config import get_settings
from app.db.migrate import migrate
from app.db.postgres import database_connection
from app.main import app

WALLET = {"name": "Everyday", "colour": "#3b82f6", "icon": "wallet"}


@pytest.fixture
def wallet_client(client, monkeypatch):
    identity = {"sub": f"test-wallet-owner-{uuid4()}"}
    monkeypatch.setitem(app.dependency_overrides, require_identity, lambda: identity)
    return client, identity


@pytest.fixture
def wallet_database(wallet_client, monkeypatch):
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set TEST_DATABASE_URL to a dedicated PostgreSQL test database")
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()
    asyncio.run(migrate())
    client, identity = wallet_client
    owners = [identity["sub"], f"test-wallet-owner-{uuid4()}"]
    yield client, identity, owners

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
        ("post", ""),
        ("post", "/icon-preview"),
        ("put", f"/{uuid4()}"),
        ("delete", f"/{uuid4()}"),
    ],
)
def test_wallets_require_authentication(client, method, path):
    response = getattr(client, method)("/api/v1/wallets" + path)
    assert response.status_code == 401
    assert "no-store" in response.headers["cache-control"]


@pytest.mark.parametrize(
    "changes",
    [
        {"name": ""},
        {"name": " "},
        {"name": "x" * 101},
        {"colour": "red"},
        {"colour": "#12345g"},
        {"icon": "unsupported"},
        {"initial_amount": "NaN"},
        {"initial_amount": "Infinity"},
        {"initial_amount": None},
        {"initial_amount": True},
        {"initial_amount": 0.1},
        {"currency": "XYZ"},
        {"currency": ""},
        {"currency": None},
        {"currency": 123},
        {"type": "cash"},
        {"type": None},
        {"favicon_url": "x" * 2049},
        {"current_amount": "123"},
        {"owner_subject": "another-owner"},
    ],
)
def test_wallet_input_is_validated_without_database_access(wallet_client, changes):
    client, _ = wallet_client
    for method, path in [("post", ""), ("put", f"/{uuid4()}")]:
        response = getattr(client, method)("/api/v1/wallets" + path, json={**WALLET, **changes})
        assert response.status_code == 422


@pytest.mark.parametrize("field", ["name", "colour", "icon"])
def test_wallet_display_attributes_are_required(wallet_client, field):
    client, _ = wallet_client
    data = {key: value for key, value in WALLET.items() if key != field}
    assert client.post("/api/v1/wallets", json=data).status_code == 422


def test_wallet_database_failure_is_explicit(wallet_client):
    client, _ = wallet_client
    response = client.post("/api/v1/wallets", json=WALLET)
    assert response.status_code == 503
    assert response.json() == {"detail": "Database is unavailable"}
    assert "no-store" in response.headers["cache-control"]


@pytest.mark.parametrize(
    "query",
    [
        "page=0",
        "page=-1",
        "page=abc",
        "page=1.5",
        "page=2147483648",
        "page_size=0",
        "page_size=101",
    ],
)
def test_wallet_pagination_is_validated_without_database_access(wallet_client, query):
    client, _ = wallet_client
    assert client.get(f"/api/v1/wallets?{query}").status_code == 422


@pytest.mark.integration
def test_multiple_wallets_are_persisted_and_isolated_by_owner(wallet_database):
    client, identity, owners = wallet_database
    assert client.get("/api/v1/wallets").json() == {
        "wallets": [],
        "page": 1,
        "page_size": 10,
        "total": 0,
    }
    first = client.post("/api/v1/wallets", json=WALLET)
    assert first.status_code == 201
    assert first.json()["initial_amount"] == "0"
    assert first.json()["currency"] == "EUR"
    assert first.json()["current_amount"] == "0"
    assert first.json()["name"] == WALLET["name"]
    assert first.json()["colour"] == WALLET["colour"]
    assert first.json()["icon"] == WALLET["icon"]
    assert first.json()["type"] == "bank"
    assert first.json()["icon_image_url"] is None
    assert "owner_subject" not in first.json()

    amount = "-12345678901234567890.123456789012345678"
    second = client.post(
        "/api/v1/wallets",
        json={**WALLET, "name": "  Savings  ", "initial_amount": amount, "icon": "piggy-bank"},
    )
    assert second.status_code == 201
    assert second.json()["name"] == "Savings"
    assert second.json()["initial_amount"] == amount
    assert first.json()["id"] != second.json()["id"]

    identity["sub"] = owners[1]
    assert client.get("/api/v1/wallets").json()["total"] == 0
    other = client.post("/api/v1/wallets", json={**WALLET, "name": "Other user's wallet"})
    assert other.status_code == 201
    assert [wallet["id"] for wallet in client.get("/api/v1/wallets").json()["wallets"]] == [
        other.json()["id"]
    ]

    identity["sub"] = owners[0]
    wallets = client.get("/api/v1/wallets").json()["wallets"]
    assert {wallet["id"] for wallet in wallets} == {first.json()["id"], second.json()["id"]}
    assert (
        next(wallet for wallet in wallets if wallet["id"] == second.json()["id"])["initial_amount"]
        == amount
    )


@pytest.mark.integration
def test_wallet_pages_are_ordered_complete_and_owner_scoped(wallet_database):
    client, identity, owners = wallet_database
    ids = []
    for index in range(11):
        response = client.post("/api/v1/wallets", json={**WALLET, "name": f"Wallet {index}"})
        assert response.status_code == 201
        ids.append(response.json()["id"])

    identity["sub"] = owners[1]
    assert client.post("/api/v1/wallets", json=WALLET).status_code == 201
    assert client.get("/api/v1/wallets").json()["total"] == 1
    identity["sub"] = owners[0]

    # Equal timestamps still have a deterministic UUID tie-breaker.
    async def tie_timestamps():
        async with database_connection() as connection:
            await connection.execute(
                "UPDATE wallets SET created_at = '2026-01-01' WHERE owner_subject = %s",
                (owners[0],),
            )

    asyncio.run(tie_timestamps())
    first = client.get("/api/v1/wallets").json()
    assert first["page"] == 1
    assert first["page_size"] == 10
    assert first["total"] == 11
    assert [wallet["id"] for wallet in first["wallets"]] == sorted(ids)[:10]
    second = client.get("/api/v1/wallets?page=2").json()
    assert second["page"] == 2
    assert second["total"] == 11
    assert [wallet["id"] for wallet in second["wallets"]] == sorted(ids)[10:]
    beyond = client.get("/api/v1/wallets?page=3").json()
    assert beyond["wallets"] == []
    assert beyond["total"] == 11

    custom = client.get("/api/v1/wallets?page=2&page_size=3").json()
    assert custom["page_size"] == 3
    assert custom["total"] == 11
    assert [wallet["id"] for wallet in custom["wallets"]] == sorted(ids)[3:6]


@pytest.mark.integration
def test_migration_is_repeatable_and_database_amount_default_is_zero(wallet_database):
    _, _, owners = wallet_database

    async def check():
        await migrate()
        await migrate()
        async with database_connection() as connection:
            await connection.execute("INSERT INTO users (subject) VALUES (%s)", (owners[0],))
            cursor = await connection.execute(
                """
                INSERT INTO wallets (owner_subject, name, colour, icon)
                VALUES (%s, 'Default amount', '#000000', 'wallet')
                RETURNING initial_amount, currency
                """,
                (owners[0],),
            )
            row = await cursor.fetchone()
            assert row["initial_amount"] == Decimal("0")
            assert row["currency"] == "EUR"
            cursor = await connection.execute(
                "SELECT version FROM schema_migrations WHERE version = '001_wallets.sql'"
            )
            assert len(await cursor.fetchall()) == 1

    asyncio.run(check())


@pytest.mark.integration
def test_wallet_edit_delete_currency_and_owner_refusals(wallet_database):
    client, identity, owners = wallet_database
    created = client.post("/api/v1/wallets", json={**WALLET, "currency": " usd "}).json()
    assert created["currency"] == "USD"
    wallet_id = created["id"]
    amount = "-12345678901234567890.123456789012345678"
    edited = client.put(
        f"/api/v1/wallets/{wallet_id}",
        json={**WALLET, "name": " Renamed ", "currency": "CHF", "initial_amount": amount},
    )
    assert edited.status_code == 200
    assert edited.json()["name"] == "Renamed"
    assert edited.json()["current_amount"] == amount
    assert edited.json()["initial_amount"] == amount
    assert edited.json()["currency"] == "CHF"
    assert edited.json()["created_at"] == created["created_at"]
    identity["sub"] = owners[1]
    for target in [wallet_id, str(uuid4())]:
        for method in ["put", "delete"]:
            response = getattr(client, method)(
                f"/api/v1/wallets/{target}", **({"json": WALLET} if method == "put" else {})
            )
            assert response.status_code == 404
            assert response.json() == {"detail": "Wallet not found"}
            assert "no-store" in response.headers["cache-control"]
    identity["sub"] = owners[0]
    assert client.get("/api/v1/wallets").json()["wallets"][0] == edited.json()
    deleted = client.delete(f"/api/v1/wallets/{wallet_id}")
    assert deleted.status_code == 204 and not deleted.content
    assert client.get("/api/v1/wallets").json()["total"] == 0
    assert client.delete(f"/api/v1/wallets/{wallet_id}").status_code == 404


@pytest.mark.integration
@pytest.mark.parametrize("currency", ["EUR", "USD", "GBP", "BTC", "ETH", "ITL"])
def test_wallet_new_currencies_and_types_persist(wallet_database, currency):
    client, _, _ = wallet_database
    created = client.post(
        "/api/v1/wallets",
        json={**WALLET, "currency": currency, "type": "exchange", "initial_amount": "0.00000001"},
    )
    assert created.status_code == 201
    assert created.json()["currency"] == currency
    assert created.json()["type"] == "exchange"
    edited = client.put(
        f"/api/v1/wallets/{created.json()['id']}",
        json={**WALLET, "currency": currency, "type": "trading", "initial_amount": "0.00000001"},
    )
    assert edited.status_code == 200
    assert edited.json()["type"] == "trading"
    assert Decimal(edited.json()["current_amount"]) == Decimal("0.00000001")
    assert client.get("/api/v1/wallets").json()["wallets"] == [edited.json()]


@pytest.mark.integration
def test_wallet_favicon_is_stored_preserved_cleared_and_owner_scoped(wallet_database, monkeypatch):
    client, identity, owners = wallet_database
    output = BytesIO()
    Image.new("RGBA", (16, 16), "red").save(output, "PNG")
    image = output.getvalue()
    calls = []

    def download(url):
        calls.append(url)
        return image

    monkeypatch.setattr("app.services.wallets.download_favicon", download)
    data = {**WALLET, "icon": "custom", "favicon_url": "https://example.com/favicon.ico"}
    created = client.post("/api/v1/wallets", json=data)
    assert created.status_code == 201
    saved = created.json()
    assert base64.b64decode(saved["icon_image_url"].split(",")[1]) == image
    assert "favicon_png" not in saved and "favicon_url" not in saved
    assert calls == [data["favicon_url"]]
    edited = client.put(
        f"/api/v1/wallets/{saved['id']}", json={**WALLET, "icon": "custom", "type": "trading"}
    )
    assert edited.status_code == 200
    assert edited.json()["icon_image_url"] == saved["icon_image_url"]
    assert calls == [data["favicon_url"]]
    assert client.get("/api/v1/wallets").json()["wallets"] == [edited.json()]

    def refuse(url):
        from app.services.wallet_icons import InvalidWalletIcon

        raise InvalidWalletIcon

    monkeypatch.setattr("app.services.wallets.download_favicon", refuse)
    assert client.put(f"/api/v1/wallets/{saved['id']}", json=data).status_code == 422
    assert client.get("/api/v1/wallets").json()["wallets"] == [edited.json()]
    identity["sub"] = owners[1]
    assert client.get("/api/v1/wallets").json()["wallets"] == []
    assert (
        client.put(f"/api/v1/wallets/{saved['id']}", json={**WALLET, "icon": "custom"}).status_code
        == 404
    )
    identity["sub"] = owners[0]
    cleared = client.put(f"/api/v1/wallets/{saved['id']}", json=WALLET)
    assert cleared.status_code == 200
    assert cleared.json()["icon_image_url"] is None
    assert (
        client.put(f"/api/v1/wallets/{saved['id']}", json={**WALLET, "icon": "custom"}).status_code
        == 422
    )
    assert client.get("/api/v1/wallets").json()["wallets"] == [cleared.json()]


def test_wallet_favicon_refusals_do_not_write(wallet_client, monkeypatch):
    from app.services.wallet_icons import InvalidWalletIcon, WalletIconUnavailable

    client, _ = wallet_client
    for data in [
        {**WALLET, "icon": "custom"},
        {**WALLET, "favicon_url": "https://example.com/favicon.ico"},
    ]:
        assert client.post("/api/v1/wallets", json=data).status_code == 422

    for error, status in [(InvalidWalletIcon, 422), (WalletIconUnavailable, 503)]:

        def refuse(url):
            raise error

        monkeypatch.setattr("app.services.wallets.download_favicon", refuse)
        response = client.post(
            "/api/v1/wallets",
            json={**WALLET, "icon": "custom", "favicon_url": "https://example.com/favicon.ico"},
        )
        assert response.status_code == status
        assert "no-store" in response.headers["cache-control"]


def test_wallet_icon_preview_is_private_and_needs_no_database(wallet_client, monkeypatch):
    client, _ = wallet_client
    output = BytesIO()
    Image.new("RGBA", (16, 16), "red").save(output, "PNG")
    image = output.getvalue()
    calls = []

    def download(url):
        calls.append(url)
        return image

    monkeypatch.setattr("app.services.wallets.download_favicon", download)
    response = client.post(
        "/api/v1/wallets/icon-preview",
        json={"favicon_url": " https://example.com/favicon.ico "},
    )
    assert response.status_code == 200
    assert response.json() == {
        "icon_image_url": "data:image/png;base64," + base64.b64encode(image).decode("ascii")
    }
    assert calls == ["https://example.com/favicon.ico"]
    assert "no-store" in response.headers["cache-control"]


@pytest.mark.parametrize(
    "data",
    [
        {},
        {"favicon_url": ""},
        {"favicon_url": None},
        {"favicon_url": 123},
        {"favicon_url": "x" * 2049},
        {"favicon_url": "https://example.com/icon", "owner_subject": "other"},
    ],
)
def test_wallet_icon_preview_rejects_bad_payloads_before_downloading(
    wallet_client, monkeypatch, data
):
    client, _ = wallet_client

    def unexpected(url):
        pytest.fail("Invalid preview payload reached download")

    monkeypatch.setattr("app.services.wallets.download_favicon", unexpected)
    assert client.post("/api/v1/wallets/icon-preview", json=data).status_code == 422


@pytest.mark.parametrize("failure", ["invalid", "unavailable"])
def test_wallet_icon_preview_preserves_download_refusals(wallet_client, monkeypatch, failure):
    from app.services.wallet_icons import InvalidWalletIcon, WalletIconUnavailable

    client, _ = wallet_client

    def refuse(url):
        raise InvalidWalletIcon if failure == "invalid" else WalletIconUnavailable

    monkeypatch.setattr("app.services.wallets.download_favicon", refuse)
    response = client.post(
        "/api/v1/wallets/icon-preview", json={"favicon_url": "https://example.com/favicon.ico"}
    )
    assert response.status_code == (422 if failure == "invalid" else 503)
    assert "no-store" in response.headers["cache-control"]
