import hashlib
import json

from app.db.categories import category_name_conflicts
from app.db.postgres import database_connection
from app.db.transactions import insert_transaction
from app.schemas.transaction_imports import ImportRequest, ImportResult, ImportValidation
from app.services.transaction_imports import InvalidTransactionImport, validate_import


class ImportKeyConflict(Exception):
    pass


async def references(connection, subject: str, *, lock: bool):
    suffix = " FOR KEY SHARE" if lock else ""
    values = []
    for table, columns in [
        ("wallets", "id, name, currency"),
        ("categories", "id, name, colour, icon, preset_key, kind"),
        ("subcategories", "id, name, category_id"),
    ]:
        cursor = await connection.execute(
            f"SELECT {columns} FROM {table} WHERE owner_subject = %s ORDER BY id"
            + (" FOR SHARE" if lock and table == "wallets" else suffix),
            (subject,),
        )
        values.append(await cursor.fetchall())
    return values


async def preview_import(subject: str, request: ImportRequest) -> ImportValidation:
    async with database_connection() as connection:
        await connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        return validate_import(
            request, *await references(connection, subject, lock=False), subject=subject
        )


async def confirm_import(subject: str, request: ImportRequest) -> ImportResult:
    payload = request.model_dump(mode="json", exclude={"import_id"})
    for key, default in [
        ("date_order", "auto"),
        ("decimal_separator", "auto"),
        ("approved_creations", []),
    ]:
        if payload[key] == default:
            del payload[key]
    payload_hash = hashlib.sha256(
        json.dumps(
            payload,
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()
    async with database_connection() as connection:
        await connection.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
            (f"transaction-import-references:{subject}",),
        )
        await connection.execute(
            "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
            (f"transaction-import:{subject}:{request.import_id}",),
        )
        cursor = await connection.execute(
            "SELECT payload_hash, imported FROM transaction_imports "
            "WHERE owner_subject = %s AND id = %s",
            (subject, request.import_id),
        )
        previous = await cursor.fetchone()
        if previous is not None:
            if previous["payload_hash"] != payload_hash:
                raise ImportKeyConflict
            return ImportResult(imported=previous["imported"])
        report = validate_import(
            request, *await references(connection, subject, lock=True), subject=subject
        )
        if report.invalid or not report.selected or not report.creations_approved:
            raise InvalidTransactionImport(report)
        await connection.execute(
            "INSERT INTO users (subject) VALUES (%s) ON CONFLICT (subject) DO NOTHING",
            (subject,),
        )
        with category_name_conflicts():
            for item in report.creations:
                if item.kind == "wallet":
                    await connection.execute(
                        "INSERT INTO wallets (id, owner_subject, name, colour, icon) "
                        "VALUES (%s, %s, %s, %s, %s)",
                        (item.id, subject, item.name, item.colour, item.icon),
                    )
                elif item.kind == "category":
                    await connection.execute(
                        "INSERT INTO categories "
                        "(id, owner_subject, name, colour, icon, preset_key, kind) "
                        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                        (
                            item.id,
                            subject,
                            item.name,
                            item.colour,
                            item.icon,
                            item.preset_key,
                            item.category_kind,
                        ),
                    )
                else:
                    await connection.execute(
                        "INSERT INTO subcategories "
                        "(id, owner_subject, category_id, name, colour, icon) "
                        "VALUES (%s, %s, %s, %s, %s, %s)",
                        (item.id, subject, item.category_id, item.name, item.colour, item.icon),
                    )
        for row in report.rows:
            if row.included:
                await insert_transaction(connection, subject, row.transaction)
        await connection.execute(
            "INSERT INTO transaction_imports (owner_subject, id, payload_hash, imported) "
            "VALUES (%s, %s, %s, %s)",
            (subject, request.import_id, payload_hash, report.selected),
        )
        return ImportResult(imported=report.selected)
