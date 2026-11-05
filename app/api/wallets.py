from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response

from app.core.auth import Identity
from app.db import wallets
from app.schemas.wallets import (
    Wallet,
    WalletCreate,
    WalletIconPreview,
    WalletIconPreviewRequest,
    WalletList,
)
from app.services import wallets as service

router = APIRouter(prefix="/api/v1/wallets", tags=["wallets"])


@router.post("/icon-preview", response_model=WalletIconPreview)
async def preview_wallet_icon(
    data: WalletIconPreviewRequest, identity: Identity
) -> WalletIconPreview:
    return await service.preview_wallet_icon(data.favicon_url)


@router.get("", response_model=WalletList)
async def list_wallets(
    identity: Identity,
    page: Annotated[int, Query(ge=1, le=2_147_483_647)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> WalletList:
    return await service.list_wallets(identity["sub"], page, page_size)


@router.post("", response_model=Wallet, status_code=201)
async def create_wallet(data: WalletCreate, identity: Identity) -> Wallet:
    return await service.create_wallet(identity["sub"], data)


@router.put("/{wallet_id}", response_model=Wallet)
async def update_wallet(wallet_id: UUID, data: WalletCreate, identity: Identity) -> Wallet:
    return await service.update_wallet(identity["sub"], wallet_id, data)


@router.delete("/{wallet_id}", status_code=204)
async def delete_wallet(wallet_id: UUID, identity: Identity) -> Response:
    await wallets.delete_wallet(identity["sub"], wallet_id)
    return Response(status_code=204)
