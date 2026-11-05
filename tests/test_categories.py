import asyncio
import os
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql

from app.core.auth import require_identity
from app.core.config import get_settings
from app.db.migrate import migrate
from app.db.postgres import database_connection
from app.main import app

ITEM = {"name": "Custom", "colour": "#123abc", "icon": "house"}


@pytest.fixture
def category_client(client, monkeypatch):
    identity = {"sub": f"test-category-owner-{uuid4()}"}
    monkeypatch.setitem(app.dependency_overrides, require_identity, lambda: identity)
    return client, identity


@pytest.fixture
def category_database(category_client, monkeypatch):
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set TEST_DATABASE_URL to a dedicated PostgreSQL test database")
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()
    asyncio.run(migrate())
    client, identity = category_client
    owners = [identity["sub"], f"test-category-owner-{uuid4()}"]
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
        ("get", "/presets"),
        ("post", "/import"),
        ("post", ""),
        ("put", f"/{uuid4()}"),
        ("delete", f"/{uuid4()}"),
        ("post", f"/{uuid4()}/subcategories"),
        ("put", f"/{uuid4()}/subcategories/{uuid4()}"),
        ("delete", f"/{uuid4()}/subcategories/{uuid4()}"),
    ],
)
def test_category_operations_require_authentication(client, method, path):
    response = getattr(client, method)(f"/api/v1/categories{path}")
    assert response.status_code == 401
    assert "no-store" in response.headers["cache-control"]


@pytest.mark.parametrize(
    "changes",
    [
        {"name": ""},
        {"name": " "},
        {"name": "x" * 101},
        {"name": None},
        {"colour": "red"},
        {"colour": "#12345g"},
        {"icon": "unsupported"},
        {"owner_subject": "another-owner"},
        {"parent_id": str(uuid4())},
        {"subcategories": [ITEM]},
        {"preset_key": "casa"},
    ],
)
def test_category_fields_are_validated_before_database_access(category_client, changes):
    client, _ = category_client
    for path in ["", f"/{uuid4()}/subcategories"]:
        response = client.post(f"/api/v1/categories{path}", json={**ITEM, **changes})
        assert response.status_code == 422


@pytest.mark.parametrize(
    "data",
    [
        {"keys": []},
        {"keys": ["unknown"]},
        {"keys": ["casa"], "owner_subject": "forged"},
    ],
)
def test_invalid_preset_selections_do_not_write(category_client, data):
    client, _ = category_client
    assert client.post("/api/v1/categories/import", json=data).status_code == 422


def test_category_database_failures_are_explicit(category_client):
    client, _ = category_client
    for response in [
        client.get("/api/v1/categories"),
        client.post("/api/v1/categories", json=ITEM),
        client.post("/api/v1/categories/import", json={"keys": ["casa"]}),
    ]:
        assert response.status_code == 503
        assert response.json() == {"detail": "Database is unavailable"}
        assert "no-store" in response.headers["cache-control"]


@pytest.mark.integration
def test_category_crud_is_private_and_two_levels_only(category_database):
    client, identity, owners = category_database
    assert client.get("/api/v1/categories").json() == {"categories": []}
    root = client.post("/api/v1/categories", json=ITEM)
    assert root.status_code == 201
    root_id = root.json()["id"]
    child_url = f"/api/v1/categories/{root_id}/subcategories"
    child = client.post(child_url, json={**ITEM, "name": "Child"})
    assert child.status_code == 201
    child_id = child.json()["id"]
    updated = {"name": "  Edited  ", "colour": "#aabbcc", "icon": "book-open"}
    assert client.put(f"/api/v1/categories/{root_id}", json=updated).json()["name"] == "Edited"
    assert client.put(f"{child_url}/{child_id}", json=updated).status_code == 200
    listing = client.get("/api/v1/categories").json()["categories"]
    assert listing[0]["subcategories"][0]["colour"] == "#aabbcc"
    assert listing[0]["subcategories"][0]["icon"] == "book-open"
    assert client.post(f"/api/v1/categories/{child_id}/subcategories", json=ITEM).status_code == 404

    other_root = client.post("/api/v1/categories", json={**ITEM, "name": "Other root"}).json()["id"]
    assert (
        client.put(
            f"/api/v1/categories/{other_root}/subcategories/{child_id}",
            json=ITEM,
        ).status_code
        == 404
    )
    identity["sub"] = owners[1]
    assert client.get("/api/v1/categories").json()["categories"] == []
    for response in [
        client.put(f"/api/v1/categories/{root_id}", json=ITEM),
        client.delete(f"/api/v1/categories/{root_id}"),
        client.post(child_url, json=ITEM),
        client.put(f"{child_url}/{child_id}", json=ITEM),
        client.delete(f"{child_url}/{child_id}"),
    ]:
        assert response.status_code == 404
        assert response.json() == {"detail": "Category not found"}

    identity["sub"] = owners[0]
    assert client.delete(f"{child_url}/{child_id}").status_code == 204
    assert client.get("/api/v1/categories").json()["categories"][0]["subcategories"] == []
    assert client.post(child_url, json=ITEM).status_code == 201
    assert client.delete(f"/api/v1/categories/{root_id}").status_code == 204
    assert len(client.get("/api/v1/categories").json()["categories"]) == 1


@pytest.mark.integration
@pytest.mark.parametrize("child", [False, True])
def test_category_names_are_unique_on_creation_and_replacement(category_database, child):
    client, identity, owners = category_database
    root = client.post("/api/v1/categories", json={**ITEM, "name": "Parent"}).json()
    other_root = client.post("/api/v1/categories", json={**ITEM, "name": "Other parent"}).json()
    path = "/api/v1/categories"
    if child:
        path += f"/{root['id']}/subcategories"
    first = client.post(path, json=ITEM).json()
    second = client.post(path, json={**ITEM, "name": "Second"}).json()
    for response in [
        client.post(path, json={**ITEM, "name": "  CUSTOM  "}),
        client.put(f"{path}/{second['id']}", json={**ITEM, "name": "custom"}),
    ]:
        assert response.status_code == 409
        assert "Choose a unique name" in response.json()["detail"]
        assert "no-store" in response.headers["cache-control"]
    assert client.put(f"{path}/{first['id']}", json={**ITEM, "name": "CUSTOM"}).status_code == 200
    listing = client.get("/api/v1/categories").json()["categories"]
    items = (
        next(item for item in listing if item["id"] == root["id"])["subcategories"]
        if child
        else listing
    )
    assert next(item for item in items if item["id"] == second["id"])["name"] == "Second"
    if child:
        assert (
            client.post(
                f"/api/v1/categories/{other_root['id']}/subcategories", json=ITEM
            ).status_code
            == 201
        )
    identity["sub"] = owners[1]
    their_root = client.post("/api/v1/categories", json=ITEM)
    assert their_root.status_code == 201
    assert (
        client.post(
            f"/api/v1/categories/{their_root.json()['id']}/subcategories", json=ITEM
        ).status_code
        == 201
    )


@pytest.mark.integration
def test_presets_skip_existing_case_insensitive_names_without_overwriting(category_database):
    client, _, _ = category_database
    existing = client.post("/api/v1/categories", json={**ITEM, "name": "cAsA"}).json()
    assert client.post("/api/v1/categories/import", json={"keys": ["casa", "leisure"]}).json() == {
        "imported": 1
    }
    listing = client.get("/api/v1/categories").json()["categories"]
    kept = next(item for item in listing if item["id"] == existing["id"])
    assert kept == {**existing, "kind": "expense", "preset_key": None, "subcategories": []}
    assert len(listing) == 2


@pytest.mark.integration
def test_unique_name_migration_preserves_references_and_handles_suffix_collisions(
    category_database,
):
    _, _, owners = category_database

    async def check():
        async with database_connection() as connection:
            schema = sql.Identifier(f"test_category_names_{uuid4().hex}")
            await connection.execute(sql.SQL("CREATE SCHEMA {}").format(schema))
            await connection.execute(sql.SQL("SET LOCAL search_path TO {}").format(schema))
            migrations = Path(__file__).resolve().parents[1] / "app/db/migrations"
            for path in sorted(migrations.glob("*.sql")):
                if path.name < "008_unique_category_names.sql":
                    await connection.execute(path.read_text())
            await connection.execute("INSERT INTO users (subject) VALUES (%s)", (owners[0],))
            roots = []
            for number, name in enumerate(["Custom", "CUSTOM", "Custom (2)", "x" * 100, "X" * 100]):
                cursor = await connection.execute(
                    "INSERT INTO categories (owner_subject, name, colour, icon, created_at) "
                    "VALUES (%s, %s, '#123abc', 'house', %s) RETURNING id",
                    (owners[0], name, f"2020-01-{number + 1:02d}"),
                )
                roots.append((await cursor.fetchone())["id"])
            children = []
            for number, name in enumerate(["Child", "CHILD", "Child (2)"]):
                cursor = await connection.execute(
                    "INSERT INTO subcategories "
                    "(owner_subject, category_id, name, colour, icon, created_at) "
                    "VALUES (%s, %s, %s, '#123abc', 'house', %s) RETURNING id",
                    (owners[0], roots[1], name, f"2020-01-{number + 1:02d}"),
                )
                children.append((await cursor.fetchone())["id"])
            cursor = await connection.execute(
                "INSERT INTO wallets (owner_subject, name, colour, icon) "
                "VALUES (%s, 'Wallet', '#123abc', 'wallet') RETURNING id",
                (owners[0],),
            )
            wallet = (await cursor.fetchone())["id"]
            await connection.execute(
                "INSERT INTO transactions (owner_subject, amount, date, type, source_wallet_id, "
                "category_id, subcategory_id) VALUES (%s, 1, '2020-01-01', 'expense', %s, %s, %s)",
                (owners[0], wallet, roots[1], children[1]),
            )
            await connection.execute((migrations / "008_unique_category_names.sql").read_text())
            cursor = await connection.execute("SELECT id, name FROM categories")
            names = {row["id"]: row["name"] for row in await cursor.fetchall()}
            assert names == dict(
                zip(
                    roots,
                    ["Custom", "CUSTOM (3)", "Custom (2)", "x" * 100, "X" * 96 + " (2)"],
                    strict=True,
                )
            )
            cursor = await connection.execute("SELECT id, name FROM subcategories")
            assert {row["id"]: row["name"] for row in await cursor.fetchall()} == dict(
                zip(children, ["Child", "CHILD (3)", "Child (2)"], strict=True)
            )
            cursor = await connection.execute(
                "SELECT category_id, subcategory_id FROM transactions"
            )
            assert await cursor.fetchone() == {
                "category_id": roots[1],
                "subcategory_id": children[1],
            }
            for query, parameters in [
                ("UPDATE categories SET name = ' custom ' WHERE id = %s", (roots[1],)),
                ("UPDATE subcategories SET name = ' child ' WHERE id = %s", (children[1],)),
            ]:
                with pytest.raises(psycopg.errors.UniqueViolation):
                    async with connection.transaction():
                        await connection.execute(query, parameters)
            await connection.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(schema))

    asyncio.run(check())


@pytest.mark.integration
def test_category_kind_migration_preserves_money_and_reclassifies_only_legacy_income(
    category_database,
):
    _, _, owners = category_database

    async def check():
        async with database_connection() as connection:
            schema = sql.Identifier(f"test_category_kinds_{uuid4().hex}")
            await connection.execute(sql.SQL("CREATE SCHEMA {}").format(schema))
            await connection.execute(sql.SQL("SET LOCAL search_path TO {}").format(schema))
            migrations = Path(__file__).resolve().parents[1] / "app/db/migrations"
            for path in sorted(migrations.glob("*.sql")):
                if path.name < "010_category_kinds_signed_expenses.sql":
                    await connection.execute(path.read_text())
            await connection.execute("INSERT INTO users (subject) VALUES (%s)", (owners[0],))
            cursor = await connection.execute(
                "INSERT INTO wallets (owner_subject, name, colour, icon) "
                "VALUES (%s, 'Wallet', '#123abc', 'wallet') RETURNING id",
                (owners[0],),
            )
            wallet = (await cursor.fetchone())["id"]
            cursor = await connection.execute(
                "INSERT INTO categories (owner_subject, name, colour, icon) "
                "VALUES (%s, 'Other', '#123abc', 'house') RETURNING id",
                (owners[0],),
            )
            category = (await cursor.fetchone())["id"]
            cursor = await connection.execute(
                "INSERT INTO subcategories (owner_subject, category_id, name, colour, icon) "
                "VALUES (%s, %s, 'Child', '#123abc', 'house') RETURNING id",
                (owners[0], category),
            )
            child = (await cursor.fetchone())["id"]
            for kind in ["expense", "income"]:
                await connection.execute(
                    "INSERT INTO transactions (owner_subject, amount, date, type, "
                    "source_wallet_id, category_id, subcategory_id, destination_wallet_id) "
                    "VALUES (%s, 1.123456789012345678, '2024-01-01', %s, %s, %s, %s, %s)",
                    (owners[0], kind, wallet, category, child, None),
                )
            await connection.execute(
                (migrations / "010_category_kinds_signed_expenses.sql").read_text()
            )
            cursor = await connection.execute("SELECT id, name, kind, preset_key FROM categories")
            roots = await cursor.fetchall()
            assert next(item for item in roots if item["id"] == category)["kind"] == "expense"
            assert {item["name"] for item in roots if item["kind"] == "income"} == {
                "Salary",
                "MealTicket",
                "Transfer",
                "Cash",
                "Other",
            }
            other = next(item for item in roots if item["preset_key"] == "income-other")
            cursor = await connection.execute(
                "SELECT type, amount::text, category_id, subcategory_id "
                "FROM transactions ORDER BY type"
            )
            rows = await cursor.fetchall()
            assert rows == [
                {
                    "type": "expense",
                    "amount": "1.123456789012345678",
                    "category_id": category,
                    "subcategory_id": child,
                },
                {
                    "type": "income",
                    "amount": "1.123456789012345678",
                    "category_id": other["id"],
                    "subcategory_id": None,
                },
            ]
            cursor = await connection.execute(
                "SELECT name FROM subcategories WHERE category_id = %s ORDER BY name",
                (other["id"],),
            )
            assert [item["name"] for item in await cursor.fetchall()] == ["private sell", "refund"]
            await connection.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(schema))

    asyncio.run(check())


@pytest.mark.integration
def test_selected_presets_are_private_editable_and_idempotent(category_database):
    client, identity, owners = category_database
    presets = client.get("/api/v1/categories/presets").json()["presets"]
    expected = {
        "Casa": ["Affitto", "Gas", "Elettricit\u00e0", "Internet", "Telefono", "AltroCasa"],
        "Salute": ["Medicine", "Dottori", "Barbiere", "Sport", "AltroSalute"],
        "Spesa": ["Supermercato", "AltroSpesa"],
        "CiboFuori": ["Locali&Bar", "Mensa", "Delivery"],
        "Trasporti": ["Viaggi", "Treno", "Bus", "Auto", "BusinessTrip", "AltroTrasporti"],
        "Abbigliamento": ["MrClothing", "OtherClothing"],
        "Leisure": [
            "Tech",
            "Fumetti",
            "Libri",
            "Funko",
            "Carte",
            "Giochi",
            "Cinema",
            "Abbonamenti",
            "Esperienze",
            "OtherLeisure",
        ],
        "Regali": ["OtherRegali"],
        "Commissioni": ["Brokers", "Exchanges", "Banks", "OtherFees"],
        "Altro": ["OtherOther"],
    }
    assert {
        p["name"]: [c["name"] for c in p["subcategories"]]
        for p in presets
        if p["kind"] == "expense"
    } == expected
    assert {
        p["name"]: [c["name"] for c in p["subcategories"]] for p in presets if p["kind"] == "income"
    } == {
        "Salary": [],
        "MealTicket": [],
        "Transfer": [],
        "Cash": [],
        "Other": ["refund", "private sell"],
    }
    assert client.post("/api/v1/categories/import", json={"keys": ["casa", "leisure"]}).json() == {
        "imported": 2
    }
    owned = client.get("/api/v1/categories").json()["categories"]
    assert {c["name"] for c in owned} == {"Casa", "Leisure"}
    casa = next(c for c in owned if c["preset_key"] == "casa")
    root_url = f"/api/v1/categories/{casa['id']}"
    assert client.put(root_url, json={**ITEM, "name": "My home"}).status_code == 200
    removed = casa["subcategories"][0]["id"]
    assert client.delete(f"{root_url}/subcategories/{removed}").status_code == 204
    assert client.post("/api/v1/categories/import", json={"keys": ["casa", "casa"]}).json() == {
        "imported": 0
    }
    updated = client.get("/api/v1/categories").json()["categories"]
    home = next(c for c in updated if c["id"] == casa["id"])
    assert home["name"] == "My home"
    assert len(home["subcategories"]) == 5

    identity["sub"] = owners[1]
    assert client.get("/api/v1/categories").json()["categories"] == []
    assert client.post("/api/v1/categories/import", json={"keys": ["casa"]}).json() == {
        "imported": 1
    }
    theirs = client.get("/api/v1/categories").json()["categories"][0]
    assert theirs["name"] == "Casa"
    assert theirs["id"] != casa["id"]
    assert len(theirs["subcategories"]) == 6
    assert (
        client.put("/api/v1/account", json={"display_name": "User", "icon": "cat"}).status_code
        == 200
    )
    assert client.get("/api/v1/categories").json()["categories"][0] == theirs

    identity["sub"] = owners[0]
    assert client.delete(root_url).status_code == 204
    assert client.post("/api/v1/categories/import", json={"keys": ["casa"]}).json() == {
        "imported": 1
    }
    assert (
        next(
            c
            for c in client.get("/api/v1/categories").json()["categories"]
            if c["preset_key"] == "casa"
        )["name"]
        == "Casa"
    )


@pytest.mark.integration
def test_database_rejects_cross_owner_and_third_level_parents_and_cascades(category_database):
    client, _, owners = category_database
    root = client.post("/api/v1/categories", json=ITEM).json()
    child = client.post(f"/api/v1/categories/{root['id']}/subcategories", json=ITEM).json()

    async def check():
        await migrate()
        async with database_connection() as connection:
            for parent_id, owner in [(root["id"], owners[1]), (child["id"], owners[0])]:
                with pytest.raises(psycopg.errors.ForeignKeyViolation):
                    async with connection.transaction():
                        await connection.execute(
                            "INSERT INTO subcategories "
                            "(category_id, owner_subject, name, colour, icon) "
                            "VALUES (%s, %s, 'Invalid', '#123abc', 'house')",
                            (parent_id, owner),
                        )
            await connection.execute("DELETE FROM categories WHERE id = %s", (root["id"],))
            cursor = await connection.execute(
                "SELECT id FROM subcategories WHERE id = %s",
                (child["id"],),
            )
            assert await cursor.fetchone() is None

    asyncio.run(check())
