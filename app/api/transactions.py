from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response

from app.core.auth import Identity
from app.db import transactions
from app.schemas.transactions import (
    Transaction,
    TransactionBulkResult,
    TransactionBulkUpdate,
    TransactionFilters,
    TransactionInput,
    TransactionList,
    TransactionOptions,
    TransactionSelection,
)
from app.services.transactions import list_transactions as list_occurrences
from app.services.transactions import update_transactions

router = APIRouter(prefix="/api/v1/transactions", tags=["transactions"])


@router.get("", response_model=TransactionList)
async def list_transactions(
    identity: Identity, filters: Annotated[TransactionFilters, Query()]
) -> TransactionList:
    return await list_occurrences(identity["sub"], filters)


@router.get("/options", response_model=TransactionOptions)
async def transaction_options(identity: Identity) -> TransactionOptions:
    return await transactions.wallet_options(identity["sub"])


@router.post("", response_model=Transaction, status_code=201)
async def create_transaction(data: TransactionInput, identity: Identity) -> Transaction:
    return await transactions.save_transaction(identity["sub"], data)


@router.get("/{transaction_id}", response_model=Transaction)
async def get_transaction(transaction_id: UUID, identity: Identity) -> Transaction:
    return await transactions.get_transaction(identity["sub"], transaction_id)


@router.patch("/bulk", response_model=TransactionBulkResult)
async def bulk_update_transactions(
    data: TransactionBulkUpdate, identity: Identity
) -> TransactionBulkResult:
    return await update_transactions(identity["sub"], data)


@router.delete("/bulk", response_model=TransactionBulkResult)
async def bulk_delete_transactions(
    data: TransactionSelection, identity: Identity
) -> TransactionBulkResult:
    await transactions.delete_transactions(identity["sub"], data.ids)
    return TransactionBulkResult(count=len(data.ids))


@router.put("/{transaction_id}", response_model=Transaction)
async def update_transaction(
    transaction_id: UUID, data: TransactionInput, identity: Identity
) -> Transaction:
    return await transactions.save_transaction(identity["sub"], data, transaction_id)


@router.delete("/{transaction_id}", status_code=204)
async def delete_transaction(transaction_id: UUID, identity: Identity) -> Response:
    await transactions.delete_transaction(identity["sub"], transaction_id)
    return Response(status_code=204)
