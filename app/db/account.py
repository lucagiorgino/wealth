from base64 import b64encode

from app.db.postgres import database_connection
from app.schemas.account import Account, AccountUpdate


def account_from_row(row: dict | None, subject: str) -> Account:
    if row is None:
        return Account(subject=subject, display_name=None, icon="user-round")
    image = row.pop("avatar_png")
    return Account(
        **row,
        avatar_url=f"data:image/png;base64,{b64encode(image).decode('ascii')}" if image else None,
    )


async def get_account(subject: str) -> Account:
    async with database_connection() as connection:
        cursor = await connection.execute(
            "SELECT subject, display_name, icon, avatar_png FROM users WHERE subject = %s",
            (subject,),
        )
        return account_from_row(await cursor.fetchone(), subject)


async def update_account(subject: str, data: AccountUpdate) -> Account:
    async with database_connection() as connection:
        cursor = await connection.execute(
            """
            INSERT INTO users (subject, display_name, icon)
            VALUES (%s, %s, %s)
            ON CONFLICT (subject) DO UPDATE
            SET display_name = EXCLUDED.display_name, icon = EXCLUDED.icon
            RETURNING subject, display_name, icon, avatar_png
            """,
            (subject, data.display_name, data.icon),
        )
        return account_from_row(await cursor.fetchone(), subject)


async def update_avatar(subject: str, image: bytes) -> Account:
    async with database_connection() as connection:
        cursor = await connection.execute(
            """
            INSERT INTO users (subject, avatar_png) VALUES (%s, %s)
            ON CONFLICT (subject) DO UPDATE SET avatar_png = EXCLUDED.avatar_png
            RETURNING subject, display_name, icon, avatar_png
            """,
            (subject, image),
        )
        return account_from_row(await cursor.fetchone(), subject)


async def update_name(subject: str, display_name: str) -> Account:
    async with database_connection() as connection:
        cursor = await connection.execute(
            """
            INSERT INTO users (subject, display_name) VALUES (%s, %s)
            ON CONFLICT (subject) DO UPDATE SET display_name = EXCLUDED.display_name
            RETURNING subject, display_name, icon, avatar_png
            """,
            (subject, display_name),
        )
        return account_from_row(await cursor.fetchone(), subject)


async def update_icon(subject: str, icon: str) -> Account:
    async with database_connection() as connection:
        cursor = await connection.execute(
            """
            INSERT INTO users (subject, icon) VALUES (%s, %s)
            ON CONFLICT (subject) DO UPDATE SET icon = EXCLUDED.icon, avatar_png = NULL
            RETURNING subject, display_name, icon, avatar_png
            """,
            (subject, icon),
        )
        return account_from_row(await cursor.fetchone(), subject)


async def delete_avatar(subject: str) -> Account:
    async with database_connection() as connection:
        cursor = await connection.execute(
            "UPDATE users SET avatar_png = NULL WHERE subject = %s "
            "RETURNING subject, display_name, icon, avatar_png",
            (subject,),
        )
        return account_from_row(await cursor.fetchone(), subject)
