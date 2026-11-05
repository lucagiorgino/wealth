from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response

from app.core.auth import Identity
from app.db.assets import create_asset, delete_asset, save_valuation
from app.schemas.assets import AssetCreate, AssetPosition, AssetSummary, AssetValuationInput
from app.schemas.summary import SummaryFilters
from app.services.assets import asset_summary

router = APIRouter(prefix="/api/v1/assets", tags=["assets"])


@router.get("", response_model=AssetSummary)
async def get_assets(
    identity: Identity, filters: Annotated[SummaryFilters, Query()]
) -> AssetSummary:
    return await asset_summary(identity["sub"], filters.year)


@router.post("", status_code=201, response_model=AssetPosition)
async def post_asset(data: AssetCreate, identity: Identity) -> AssetPosition:
    return await create_asset(identity["sub"], data)


@router.put("/{asset_id}/valuations", status_code=204)
async def put_valuation(asset_id: UUID, data: AssetValuationInput, identity: Identity) -> Response:
    await save_valuation(identity["sub"], asset_id, data)
    return Response(status_code=204)


@router.delete("/{asset_id}", status_code=204)
async def remove_asset(asset_id: UUID, identity: Identity) -> Response:
    await delete_asset(identity["sub"], asset_id)
    return Response(status_code=204)
