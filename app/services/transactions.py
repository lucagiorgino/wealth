from datetime import UTC, datetime

from pydantic import ValidationError

from app.db import transactions
from app.db.postgres import database_connection
from app.schemas.transactions import (
    TransactionBulkResult,
    TransactionBulkUpdate,
    TransactionFilters,
    TransactionInput,
    TransactionList,
)


class InvalidBulkTransactionChange(Exception):
    pass


async def list_transactions(subject: str, filters: TransactionFilters) -> TransactionList:
    return await transactions.list_transactions(subject, filters, datetime.now(UTC).date())


async def update_transactions(subject: str, data: TransactionBulkUpdate) -> TransactionBulkResult:
    changes = data.changes.model_dump(exclude_unset=True)
    pinned = changes.pop("is_pinned", None)
    async with database_connection() as connection:
        rows = await transactions.lock_transactions(connection, subject, data.ids)
        if changes:
            try:
                prepared = [
                    TransactionInput.model_validate(
                        {**{field: row[field] for field in transactions.FIELDS}, **changes}
                    )
                    for row in rows
                ]
            except ValidationError:
                raise InvalidBulkTransactionChange from None
            for row, item in zip(rows, prepared, strict=True):
                await transactions.update_transaction(connection, subject, item, row["id"])
        if pinned is not None:
            await transactions.pin_transactions(connection, subject, data.ids, pinned)
    return TransactionBulkResult(count=len(data.ids))
