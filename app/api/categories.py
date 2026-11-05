from uuid import UUID

from fastapi import APIRouter, Response

from app.core.auth import Identity
from app.db import categories
from app.schemas.categories import (
    CategoryFields,
    CategoryInput,
    CategoryItem,
    CategoryList,
    ImportResult,
    PresetImport,
    PresetList,
)
from app.services.category_presets import PRESETS, import_presets

router = APIRouter(prefix="/api/v1/categories", tags=["categories"])


@router.get("", response_model=CategoryList)
async def list_categories(identity: Identity) -> CategoryList:
    return await categories.list_categories(identity["sub"])


@router.get("/presets", response_model=PresetList)
async def list_presets(identity: Identity) -> PresetList:
    return PresetList(presets=PRESETS)


@router.post("/import", response_model=ImportResult)
async def select_presets(data: PresetImport, identity: Identity) -> ImportResult:
    return ImportResult(imported=await import_presets(identity["sub"], data.keys))


@router.post("", response_model=CategoryItem, status_code=201)
async def create_category(data: CategoryInput, identity: Identity) -> CategoryItem:
    return await categories.create_category(identity["sub"], data)


@router.put("/{category_id}", response_model=CategoryItem)
async def update_category(
    category_id: UUID,
    data: CategoryInput,
    identity: Identity,
) -> CategoryItem:
    return await categories.update_category(identity["sub"], category_id, data)


@router.delete("/{category_id}", status_code=204)
async def delete_category(category_id: UUID, identity: Identity) -> Response:
    await categories.delete_category(identity["sub"], category_id)
    return Response(status_code=204)


@router.post("/{category_id}/subcategories", response_model=CategoryItem, status_code=201)
async def create_subcategory(
    category_id: UUID,
    data: CategoryFields,
    identity: Identity,
) -> CategoryItem:
    return await categories.create_subcategory(identity["sub"], category_id, data)


@router.put("/{category_id}/subcategories/{subcategory_id}", response_model=CategoryItem)
async def update_subcategory(
    category_id: UUID,
    subcategory_id: UUID,
    data: CategoryFields,
    identity: Identity,
) -> CategoryItem:
    return await categories.update_category(identity["sub"], subcategory_id, data, category_id)


@router.delete("/{category_id}/subcategories/{subcategory_id}", status_code=204)
async def delete_subcategory(
    category_id: UUID,
    subcategory_id: UUID,
    identity: Identity,
) -> Response:
    await categories.delete_category(identity["sub"], subcategory_id, category_id)
    return Response(status_code=204)
