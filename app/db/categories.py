from contextlib import contextmanager
from uuid import UUID

from psycopg.errors import ForeignKeyViolation, UniqueViolation

from app.db.postgres import database_connection
from app.schemas.categories import (
    Category,
    CategoryFields,
    CategoryInput,
    CategoryItem,
    CategoryList,
    CategoryPreset,
)


class CategoryNotFound(Exception):
    pass


class CategoryInUse(Exception):
    pass


class CategoryNameConflict(Exception):
    pass


class CategoryKindMismatch(Exception):
    pass


@contextmanager
def category_name_conflicts():
    try:
        yield
    except UniqueViolation as exc:
        if exc.diag.constraint_name not in {
            "categories_owner_name_unique",
            "subcategories_owner_parent_name_unique",
            "categories_owner_subject_preset_key_key",
        }:
            raise
        raise CategoryNameConflict from None


async def list_categories(subject: str) -> CategoryList:
    async with database_connection() as connection:
        await connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        cursor = await connection.execute(
            "SELECT id, name, colour, icon, preset_key, kind FROM categories "
            "WHERE owner_subject = %s ORDER BY name, id",
            (subject,),
        )
        roots = {row["id"]: Category.model_validate(row) for row in await cursor.fetchall()}
        cursor = await connection.execute(
            "SELECT id, category_id, name, colour, icon FROM subcategories "
            "WHERE owner_subject = %s ORDER BY name, id",
            (subject,),
        )
        for row in await cursor.fetchall():
            roots[row["category_id"]].subcategories.append(CategoryItem.model_validate(row))
        return CategoryList(categories=list(roots.values()))


async def create_category(subject: str, data: CategoryInput) -> CategoryItem:
    async with database_connection() as connection:
        await connection.execute(
            "INSERT INTO users (subject) VALUES (%s) ON CONFLICT (subject) DO NOTHING",
            (subject,),
        )
        with category_name_conflicts():
            cursor = await connection.execute(
                "INSERT INTO categories (owner_subject, name, colour, icon, kind) "
                "VALUES (%s, %s, %s, %s, %s) "
                "RETURNING id, name, colour, icon",
                (subject, data.name, data.colour, data.icon, data.kind),
            )
        return CategoryItem.model_validate(await cursor.fetchone())


async def create_subcategory(subject: str, category_id: UUID, data: CategoryFields) -> CategoryItem:
    async with database_connection() as connection:
        with category_name_conflicts():
            cursor = await connection.execute(
                """
                INSERT INTO subcategories (owner_subject, category_id, name, colour, icon)
                SELECT owner_subject, id, %s, %s, %s FROM categories
                WHERE id = %s AND owner_subject = %s
                RETURNING id, name, colour, icon
                """,
                (data.name, data.colour, data.icon, category_id, subject),
            )
        row = await cursor.fetchone()
        if row is None:
            raise CategoryNotFound
        return CategoryItem.model_validate(row)


async def update_category(
    subject: str,
    item_id: UUID,
    data: CategoryInput | CategoryFields,
    category_id: UUID | None = None,
) -> CategoryItem:
    table = "categories" if category_id is None else "subcategories"
    parent_filter = "" if category_id is None else " AND category_id = %s"
    parameters = (data.name, data.colour, data.icon, item_id, subject)
    if category_id is not None:
        parameters += (category_id,)
    async with database_connection() as connection:
        if category_id is None:
            cursor = await connection.execute(
                "SELECT kind FROM categories WHERE id = %s AND owner_subject = %s FOR UPDATE",
                (item_id, subject),
            )
            previous = await cursor.fetchone()
            if previous is None:
                raise CategoryNotFound
            if not isinstance(data, CategoryInput) or previous["kind"] != data.kind:
                raise CategoryKindMismatch
        with category_name_conflicts():
            cursor = await connection.execute(
                f"UPDATE {table} SET name = %s, colour = %s, icon = %s "
                f"WHERE id = %s AND owner_subject = %s{parent_filter} "
                "RETURNING id, name, colour, icon",
                parameters,
            )
        row = await cursor.fetchone()
        if row is None:
            raise CategoryNotFound
        return CategoryItem.model_validate(row)


async def delete_category(subject: str, item_id: UUID, category_id: UUID | None = None) -> None:
    table = "categories" if category_id is None else "subcategories"
    parent_filter = "" if category_id is None else " AND category_id = %s"
    parameters = (item_id, subject) if category_id is None else (item_id, subject, category_id)
    async with database_connection() as connection:
        try:
            cursor = await connection.execute(
                f"DELETE FROM {table} WHERE id = %s AND owner_subject = %s{parent_filter} "
                "RETURNING id",
                parameters,
            )
        except ForeignKeyViolation:
            raise CategoryInUse from None
        if await cursor.fetchone() is None:
            raise CategoryNotFound


async def import_presets(subject: str, presets: list[CategoryPreset]) -> int:
    imported = 0
    async with database_connection() as connection:
        await connection.execute(
            "INSERT INTO users (subject) VALUES (%s) ON CONFLICT (subject) DO NOTHING",
            (subject,),
        )
        for preset in presets:
            cursor = await connection.execute(
                """
                INSERT INTO categories (owner_subject, name, colour, icon, preset_key, kind)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING RETURNING id
                """,
                (subject, preset.name, preset.colour, preset.icon, preset.key, preset.kind),
            )
            row = await cursor.fetchone()
            if row is None:
                continue
            imported += 1
            for child in preset.subcategories:
                await connection.execute(
                    "INSERT INTO subcategories (owner_subject, category_id, name, colour, icon) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    (subject, row["id"], child.name, child.colour, child.icon),
                )
    return imported
