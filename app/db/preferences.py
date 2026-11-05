from app.db.postgres import database_connection
from app.schemas.preferences import DEFAULT_SIDEBAR_ORDER, Preferences


async def get_preferences(subject: str) -> Preferences:
    async with database_connection() as connection:
        cursor = await connection.execute(
            "SELECT theme, sidebar_order FROM users WHERE subject = %s", (subject,)
        )
        row = await cursor.fetchone()
        return (
            Preferences(**row)
            if row is not None
            else Preferences(theme="light", sidebar_order=DEFAULT_SIDEBAR_ORDER)
        )


async def update_preferences(subject: str, data: Preferences) -> Preferences:
    async with database_connection() as connection:
        cursor = await connection.execute(
            """
            INSERT INTO users (subject, theme, sidebar_order)
            VALUES (%s, %s, %s)
            ON CONFLICT (subject) DO UPDATE
            SET theme = EXCLUDED.theme, sidebar_order = EXCLUDED.sidebar_order
            RETURNING theme, sidebar_order
            """,
            (subject, data.theme, data.sidebar_order),
        )
        return Preferences(**await cursor.fetchone())
