import asyncio
import base64
import os
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from PIL import Image, PngImagePlugin
from psycopg import sql

from app.core.auth import require_identity
from app.core.config import get_settings
from app.db.migrate import migrate
from app.db.postgres import database_connection
from app.main import app
from app.services.profile_images import MAX_UPLOAD_BYTES

PROFILE = {"display_name": "Alex", "icon": "cat"}
PREFERENCES = {
    "theme": "light",
    "sidebar_order": [
        "dashboard",
        "wallets",
        "transactions",
        "summary",
        "assets",
        "comparison",
        "categories",
    ],
}


@pytest.fixture
def account_client(client, monkeypatch):
    identity = {"sub": f"test-account-owner-{uuid4()}"}
    monkeypatch.setitem(app.dependency_overrides, require_identity, lambda: identity)
    return client, identity


@pytest.fixture
def account_database(account_client, monkeypatch):
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set TEST_DATABASE_URL to a dedicated PostgreSQL test database")
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()
    asyncio.run(migrate())
    client, identity = account_client
    owners = [identity["sub"], f"test-account-owner-{uuid4()}"]
    yield client, identity, owners

    async def cleanup():
        async with database_connection() as connection:
            await connection.execute("DELETE FROM users WHERE subject = ANY(%s)", (owners,))

    try:
        asyncio.run(cleanup())
    finally:
        get_settings.cache_clear()


@pytest.mark.parametrize("method", ["get", "put"])
def test_account_requires_authentication(client, method):
    response = getattr(client, method)("/api/v1/account")
    assert response.status_code == 401
    assert "no-store" in response.headers["cache-control"]


@pytest.mark.parametrize(
    "changes",
    [
        {"display_name": ""},
        {"display_name": " "},
        {"display_name": "x" * 101},
        {"display_name": None},
        {"display_name": 123},
        {"icon": "unsupported"},
        {"icon": None},
        {"subject": "another-owner"},
        {"owner_subject": "another-owner"},
        {"email": "not-editable@example.test"},
    ],
)
def test_account_input_is_validated_without_database_access(account_client, changes):
    client, _ = account_client
    response = client.put("/api/v1/account", json={**PROFILE, **changes})
    assert response.status_code == 422


@pytest.mark.parametrize("field", ["display_name", "icon"])
def test_account_updates_require_both_profile_fields(account_client, field):
    client, _ = account_client
    response = client.put("/api/v1/account", json={k: v for k, v in PROFILE.items() if k != field})
    assert response.status_code == 422


@pytest.mark.parametrize("method", ["get", "put"])
def test_account_database_failure_does_not_return_defaults(account_client, method):
    client, _ = account_client
    kwargs = {"json": PROFILE} if method == "put" else {}
    response = getattr(client, method)("/api/v1/account", **kwargs)
    assert response.status_code == 503
    assert response.json() == {"detail": "Database is unavailable"}
    assert "no-store" in response.headers["cache-control"]


@pytest.mark.integration
def test_new_account_defaults_are_read_only(account_database):
    client, _, owners = account_database
    response = client.get("/api/v1/account")
    assert response.status_code == 200
    assert response.json() == {
        "subject": owners[0],
        "display_name": None,
        "icon": "user-round",
        "avatar_url": None,
    }

    async def check_not_provisioned():
        async with database_connection() as connection:
            cursor = await connection.execute(
                "SELECT subject FROM users WHERE subject = %s", (owners[0],)
            )
            assert await cursor.fetchone() is None

    asyncio.run(check_not_provisioned())


@pytest.mark.integration
def test_account_updates_are_persistent_owner_scoped_and_preserve_wallets(account_database):
    client, identity, owners = account_database
    wallet = {"name": "Everyday", "colour": "#3b82f6", "icon": "wallet"}
    created = client.post("/api/v1/wallets", json=wallet)
    assert created.status_code == 201
    assert client.get("/api/v1/account").json()["icon"] == "user-round"

    saved = client.put("/api/v1/account", json={**PROFILE, "display_name": "  Alex  "})
    assert saved.status_code == 200
    assert saved.json() == {"subject": owners[0], **PROFILE, "avatar_url": None}
    assert client.get("/api/v1/account").json() == saved.json()

    identity["sub"] = owners[1]
    assert client.get("/api/v1/account").json()["display_name"] is None
    other = {"display_name": "Taylor", "icon": "rocket"}
    assert client.put("/api/v1/account", json=other).json() == {
        "subject": owners[1],
        **other,
        "avatar_url": None,
    }
    assert client.get("/api/v1/wallets").json()["wallets"] == []

    identity["sub"] = owners[0]
    assert client.get("/api/v1/account").json() == saved.json()
    updated = client.put("/api/v1/account", json={"display_name": "Alex updated", "icon": "smile"})
    assert updated.status_code == 200
    assert client.get("/api/v1/account").json() == updated.json()
    assert client.get("/api/v1/wallets").json()["wallets"][0]["id"] == created.json()["id"]

    identity["sub"] = owners[1]
    assert client.post("/api/v1/wallets", json=wallet).status_code == 201
    assert client.get("/api/v1/account").json() == {
        "subject": owners[1],
        **other,
        "avatar_url": None,
    }

    async def check_migration_and_profiles():
        await migrate()
        await migrate()
        async with database_connection() as connection:
            cursor = await connection.execute(
                "SELECT subject FROM users WHERE subject = ANY(%s)", (owners,)
            )
            assert len(await cursor.fetchall()) == 2
            cursor = await connection.execute(
                "SELECT version FROM schema_migrations WHERE version = '002_account_profile.sql'"
            )
            assert len(await cursor.fetchall()) == 1

    asyncio.run(check_migration_and_profiles())
    assert client.get("/api/v1/account").json() == {
        "subject": owners[1],
        **other,
        "avatar_url": None,
    }


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("patch", "/api/v1/account", {"display_name": "Alex"}),
        ("put", "/api/v1/account/icon", {"icon": "cat"}),
    ],
)
def test_independent_profile_changes_require_identity(client, method, path, payload):
    response = getattr(client, method)(path, json=payload)
    assert response.status_code == 401
    assert "no-store" in response.headers["cache-control"]


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("patch", "/api/v1/account", {"display_name": "Alex"}),
        ("put", "/api/v1/account/icon", {"icon": "cat"}),
    ],
)
def test_independent_profile_database_failures_are_explicit(account_client, method, path, payload):
    client, _ = account_client
    response = getattr(client, method)(path, json=payload)
    assert response.status_code == 503
    assert "no-store" in response.headers["cache-control"]


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("patch", "/api/v1/account", {"display_name": " "}),
        ("patch", "/api/v1/account", {"display_name": "Alex", "icon": "cat"}),
        ("patch", "/api/v1/account", {"display_name": "Alex", "subject": "another-owner"}),
        ("put", "/api/v1/account/icon", {}),
        ("put", "/api/v1/account/icon", {"icon": "unsupported"}),
        ("put", "/api/v1/account/icon", {"icon": None}),
        ("put", "/api/v1/account/icon", {"icon": "cat", "subject": "another-owner"}),
    ],
)
def test_name_and_picture_changes_reject_invalid_or_unrelated_fields(
    account_client, method, path, payload
):
    client, _ = account_client
    response = getattr(client, method)(path, json=payload)
    assert response.status_code == 422


@pytest.mark.integration
def test_picture_choices_are_exclusive_and_name_changes_preserve_them(account_database):
    client, identity, owners = account_database
    initial = client.patch("/api/v1/account", json={"display_name": "Alex"})
    assert initial.status_code == 200
    assert initial.json() == {
        "subject": owners[0],
        "display_name": "Alex",
        "icon": "user-round",
        "avatar_url": None,
    }
    assert client.put("/api/v1/account/icon", json={"icon": "cat"}).status_code == 200
    wallet = client.post(
        "/api/v1/wallets", json={"name": "Everyday", "colour": "#123abc", "icon": "wallet"}
    ).json()
    uploaded = client.put(
        "/api/v1/account/avatar",
        content=image_bytes(),
        headers={"Content-Type": "image/png"},
    ).json()
    renamed = client.patch("/api/v1/account", json={"display_name": "  Alex updated  "})
    assert renamed.status_code == 200
    assert renamed.json() == {**uploaded, "display_name": "Alex updated"}

    identity["sub"] = owners[1]
    other_icon = client.put("/api/v1/account/icon", json={"icon": "rocket"})
    assert other_icon.status_code == 200
    assert other_icon.json() == {
        "subject": owners[1],
        "display_name": None,
        "icon": "rocket",
        "avatar_url": None,
    }
    other_image = client.put(
        "/api/v1/account/avatar",
        content=image_bytes(size=(5, 5)),
        headers={"Content-Type": "image/png"},
    ).json()

    identity["sub"] = owners[0]
    replaced = client.put("/api/v1/account/icon", json={"icon": "cat"})
    assert replaced.status_code == 200
    assert replaced.json() == {
        **renamed.json(),
        "icon": "cat",
        "avatar_url": None,
    }
    assert client.get("/api/v1/account").json() == replaced.json()
    assert client.get("/api/v1/wallets").json()["wallets"][0]["id"] == wallet["id"]
    identity["sub"] = owners[1]
    assert client.get("/api/v1/account").json() == other_image


def image_bytes(format="PNG", size=(600, 400), **kwargs):
    output = BytesIO()
    Image.new("RGB", size, "#123abc").save(output, format=format, **kwargs)
    return output.getvalue()


@pytest.mark.parametrize("method", ["put", "delete"])
def test_avatar_requires_authentication(client, method):
    response = getattr(client, method)("/api/v1/account/avatar")
    assert response.status_code == 401
    assert "no-store" in response.headers["cache-control"]


@pytest.mark.parametrize(
    ("content", "media_type", "status"),
    [
        (b"<svg xmlns='http://www.w3.org/2000/svg'/>", "image/svg+xml", 415),
        (b"not an image", "image/png", 422),
        (b"", "image/png", 422),
        (b"x" * (MAX_UPLOAD_BYTES + 1), "image/png", 413),
        (image_bytes(size=(4097, 1)), "image/png", 422),
        (image_bytes("JPEG"), "image/png", 422),
        (image_bytes()[:50], "image/png", 422),
    ],
)
def test_avatar_rejects_unsupported_malformed_or_oversized_images_before_database(
    account_client, content, media_type, status
):
    client, _ = account_client
    response = client.put(
        "/api/v1/account/avatar", content=content, headers={"Content-Type": media_type}
    )
    assert response.status_code == status
    assert "no-store" in response.headers["cache-control"]


def test_animated_profile_images_are_rejected(account_client):
    client, _ = account_client
    output = BytesIO()
    Image.new("RGB", (4, 4), "red").save(
        output, format="PNG", save_all=True, append_images=[Image.new("RGB", (4, 4), "blue")]
    )
    response = client.put(
        "/api/v1/account/avatar", content=output.getvalue(), headers={"Content-Type": "image/png"}
    )
    assert response.status_code == 422


def test_avatar_upload_limit_is_enforced_without_content_length(account_client):
    client, _ = account_client
    response = client.put(
        "/api/v1/account/avatar",
        content=iter([b"x" * 1024] * (MAX_UPLOAD_BYTES // 1024 + 1)),
        headers={"Content-Type": "image/png"},
    )
    assert response.status_code == 413


def test_avatar_database_failures_are_explicit(account_client):
    client, _ = account_client
    for response in [
        client.put(
            "/api/v1/account/avatar", content=image_bytes(), headers={"Content-Type": "image/png"}
        ),
        client.delete("/api/v1/account/avatar"),
    ]:
        assert response.status_code == 503
        assert "no-store" in response.headers["cache-control"]


@pytest.mark.integration
@pytest.mark.parametrize(
    ("format", "media_type"), [("PNG", "image/png"), ("JPEG", "image/jpeg"), ("WEBP", "image/webp")]
)
def test_private_avatar_import_normalizes_and_preserves_profile_and_wallets(
    account_database, format, media_type
):
    client, identity, owners = account_database
    wallet = client.post(
        "/api/v1/wallets", json={"name": "Everyday", "colour": "#123abc", "icon": "wallet"}
    ).json()
    client.put("/api/v1/account", json=PROFILE)
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text("Private", "Remove this metadata")
    content = image_bytes(format, pnginfo=metadata) if format == "PNG" else image_bytes(format)
    response = client.put(
        "/api/v1/account/avatar", content=content, headers={"Content-Type": media_type}
    )
    assert response.status_code == 200
    saved = response.json()
    assert saved["display_name"] == PROFILE["display_name"]
    assert saved["icon"] == PROFILE["icon"]
    assert saved["avatar_url"].startswith("data:image/png;base64,")
    normalized = base64.b64decode(saved["avatar_url"].split(",")[1])
    with Image.open(BytesIO(normalized)) as image:
        assert image.format == "PNG"
        assert max(image.size) == 256
        assert not image.info
    assert b"Remove this metadata" not in normalized
    assert client.get("/api/v1/account").json() == saved
    assert client.put("/api/v1/account", json=PROFILE).json()["avatar_url"] == saved["avatar_url"]
    assert client.get("/api/v1/wallets").json()["wallets"][0]["id"] == wallet["id"]
    refused = client.put(
        "/api/v1/account/avatar", content=b"invalid", headers={"Content-Type": media_type}
    )
    assert refused.status_code == 422
    assert client.get("/api/v1/account").json()["avatar_url"] == saved["avatar_url"]

    identity["sub"] = owners[1]
    assert client.get("/api/v1/account").json()["avatar_url"] is None
    assert client.delete("/api/v1/account/avatar").json()["avatar_url"] is None
    other = client.put(
        "/api/v1/account/avatar",
        content=image_bytes(size=(5, 5)),
        headers={"Content-Type": "image/png"},
    ).json()
    assert other["display_name"] is None
    assert other["icon"] == "user-round"
    assert other["avatar_url"] != saved["avatar_url"]
    identity["sub"] = owners[0]
    assert client.get("/api/v1/account").json() == saved
    deleted = client.delete("/api/v1/account/avatar")
    assert deleted.status_code == 200
    assert deleted.json() == {"subject": owners[0], **PROFILE, "avatar_url": None}
    assert client.get("/api/v1/wallets").json()["wallets"][0]["id"] == wallet["id"]

    async def check_database_image_constraint():
        await migrate()
        async with database_connection() as connection:
            for value in [b"not a PNG", b"\x89PNG\r\n\x1a\n" + b"x" * 327680]:
                with pytest.raises(psycopg.errors.CheckViolation):
                    async with connection.transaction():
                        await connection.execute(
                            "UPDATE users SET avatar_png = %s WHERE subject = %s",
                            (value, owners[0]),
                        )

    asyncio.run(check_database_image_constraint())


@pytest.mark.parametrize("method", ["get", "put"])
def test_settings_require_authentication(client, method):
    response = getattr(client, method)("/api/v1/settings")
    assert response.status_code == 401
    assert "no-store" in response.headers["cache-control"]


@pytest.mark.parametrize(
    "changes",
    [
        {"theme": "system"},
        {"theme": None},
        {"theme": 1},
        {"sidebar_order": ["dashboard"] * 6},
        {
            "sidebar_order": [
                "dashboard",
                "wallets",
                "transactions",
                "summary",
                "comparison",
                "account",
            ]
        },
        {
            "sidebar_order": [
                "dashboard",
                "wallets",
                "transactions",
                "summary",
                "summary",
                "categories",
            ]
        },
        {"sidebar_order": PREFERENCES["sidebar_order"][:-1]},
        {"sidebar_order": [*PREFERENCES["sidebar_order"], "dashboard"]},
        {"sidebar_order": "dashboard,wallets,transactions,summary,categories"},
        {"sidebar_order": None},
        {"sidebar_order": [None, "wallets", "transactions", "summary", "comparison", "categories"]},
        {"subject": "another-owner"},
        {"owner_subject": "another-owner"},
    ],
)
def test_settings_reject_invalid_or_owner_supplied_fields(account_client, changes):
    client, _ = account_client
    assert client.put("/api/v1/settings", json={**PREFERENCES, **changes}).status_code == 422


@pytest.mark.parametrize("field", ["theme", "sidebar_order"])
def test_settings_require_both_fields(account_client, field):
    client, _ = account_client
    data = {key: value for key, value in PREFERENCES.items() if key != field}
    assert client.put("/api/v1/settings", json=data).status_code == 422


@pytest.mark.parametrize("method", ["get", "put"])
def test_settings_database_failure_never_returns_defaults_or_success(account_client, method):
    client, _ = account_client
    kwargs = {"json": PREFERENCES} if method == "put" else {}
    response = getattr(client, method)("/api/v1/settings", **kwargs)
    assert response.status_code == 503
    assert response.json() == {"detail": "Database is unavailable"}
    assert "no-store" in response.headers["cache-control"]


@pytest.mark.integration
def test_settings_defaults_do_not_provision_users(account_database):
    client, _, owners = account_database
    response = client.get("/api/v1/settings")
    assert response.status_code == 200
    assert response.json() == PREFERENCES
    assert "no-store" in response.headers["cache-control"]

    async def check_not_provisioned():
        async with database_connection() as connection:
            cursor = await connection.execute(
                "SELECT subject FROM users WHERE subject = %s", (owners[0],)
            )
            assert await cursor.fetchone() is None

    asyncio.run(check_not_provisioned())


@pytest.mark.integration
def test_settings_persist_per_owner_without_changing_profiles_or_wallets(account_database):
    client, identity, owners = account_database
    saved = {"theme": "dark", "sidebar_order": list(reversed(PREFERENCES["sidebar_order"]))}
    assert client.put("/api/v1/settings", json=saved).json() == saved
    assert client.get("/api/v1/account").json()["display_name"] is None
    assert client.put("/api/v1/account", json=PROFILE).status_code == 200
    assert (
        client.put(
            "/api/v1/account/avatar",
            content=image_bytes(),
            headers={"Content-Type": "image/png"},
        ).status_code
        == 200
    )
    profile = client.get("/api/v1/account").json()
    wallet = client.post(
        "/api/v1/wallets", json={"name": "Everyday", "colour": "#3b82f6", "icon": "wallet"}
    ).json()
    assert client.get("/api/v1/settings").json() == saved
    identity["sub"] = owners[1]
    assert client.get("/api/v1/settings").json() == PREFERENCES
    assert client.put("/api/v1/account", json=PROFILE).status_code == 200
    assert client.get("/api/v1/settings").json() == PREFERENCES
    assert client.put("/api/v1/settings", json=PREFERENCES).json() == PREFERENCES
    identity["sub"] = owners[0]
    assert client.get("/api/v1/settings").json() == saved
    updated = {**saved, "theme": "light"}
    assert client.put("/api/v1/settings", json=updated).json() == updated
    assert client.get("/api/v1/settings").json() == updated
    assert client.get("/api/v1/account").json() == profile
    assert client.get("/api/v1/wallets").json()["wallets"][0]["id"] == wallet["id"]

    async def check_constraints():
        await migrate()
        async with database_connection() as connection:
            for theme, order in [
                ("other", PREFERENCES["sidebar_order"]),
                ("light", ["dashboard"] * 6),
                ("dark", PREFERENCES["sidebar_order"][:-1]),
                ("dark", [["dashboard", "wallets", "transactions", "summary", "categories"]]),
            ]:
                with pytest.raises(psycopg.errors.CheckViolation):
                    async with connection.transaction():
                        await connection.execute(
                            "UPDATE users SET theme = %s, sidebar_order = %s WHERE subject = %s",
                            (theme, order, owners[0]),
                        )

    asyncio.run(check_constraints())


@pytest.mark.integration
def test_comparison_navigation_migration_preserves_saved_order_and_preferences(account_database):
    async def check():
        async with database_connection() as connection:
            schema = sql.Identifier(f"test_comparison_navigation_{uuid4().hex}")
            await connection.execute(sql.SQL("CREATE SCHEMA {}").format(schema))
            await connection.execute(sql.SQL("SET LOCAL search_path TO {}").format(schema))
            migrations = Path(__file__).resolve().parents[1] / "app/db/migrations"
            for path in sorted(migrations.glob("*.sql")):
                if path.name < "014_comparison_navigation.sql":
                    await connection.execute(path.read_text())
            orders = [
                ["dashboard", "wallets", "transactions", "summary", "categories"],
                ["summary", "categories", "transactions", "wallets", "dashboard"],
                ["categories", "wallets", "dashboard", "transactions", "summary"],
            ]
            for index, order in enumerate(orders):
                await connection.execute(
                    "INSERT INTO users (subject, display_name, theme, sidebar_order) "
                    "VALUES (%s, 'Saved name', 'dark', %s)",
                    (str(index), order),
                )
            await connection.execute((migrations / "014_comparison_navigation.sql").read_text())
            cursor = await connection.execute(
                "SELECT subject, display_name, theme, sidebar_order FROM users ORDER BY subject"
            )
            for row, order in zip(await cursor.fetchall(), orders, strict=True):
                position = order.index("summary") + 1
                assert row["sidebar_order"] == order[:position] + ["comparison"] + order[position:]
                assert row["theme"] == "dark"
                assert row["display_name"] == "Saved name"
            await connection.execute((migrations / "015_assets.sql").read_text())
            cursor = await connection.execute("SELECT sidebar_order FROM users ORDER BY subject")
            for row, order in zip(await cursor.fetchall(), orders, strict=True):
                position = order.index("summary") + 1
                assert row["sidebar_order"] == (
                    order[:position] + ["assets", "comparison"] + order[position:]
                )
            cursor = await connection.execute(
                "INSERT INTO users (subject) VALUES ('new') RETURNING sidebar_order"
            )
            assert (await cursor.fetchone())["sidebar_order"] == PREFERENCES["sidebar_order"]
            with pytest.raises(psycopg.errors.CheckViolation):
                async with connection.transaction():
                    await connection.execute(
                        "UPDATE users SET sidebar_order = %s WHERE subject = 'new'",
                        (orders[0],),
                    )
            await connection.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(schema))

    asyncio.run(check())
