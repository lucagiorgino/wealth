from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from app.core.auth import Identity
from app.db import account
from app.schemas.account import Account, AccountIconUpdate, AccountNameUpdate, AccountUpdate
from app.services.profile_images import IMAGE_TYPES, MAX_UPLOAD_BYTES, normalize_avatar

router = APIRouter(prefix="/api/v1/account", tags=["account"])


@router.get("", response_model=Account)
async def get_account(identity: Identity) -> Account:
    return await account.get_account(identity["sub"])


@router.put("", response_model=Account)
async def update_account(data: AccountUpdate, identity: Identity) -> Account:
    return await account.update_account(identity["sub"], data)


@router.put("/avatar", response_model=Account)
async def update_avatar(request: Request, identity: Identity) -> Account:
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type not in IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Choose a PNG, JPEG, or WebP image")
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Profile images must not exceed 2 MiB")
        data.extend(chunk)
    normalized = await run_in_threadpool(normalize_avatar, bytes(data), content_type)
    return await account.update_avatar(identity["sub"], normalized)


@router.patch("", response_model=Account)
async def update_name(data: AccountNameUpdate, identity: Identity) -> Account:
    return await account.update_name(identity["sub"], data.display_name)


@router.put("/icon", response_model=Account)
async def update_icon(data: AccountIconUpdate, identity: Identity) -> Account:
    return await account.update_icon(identity["sub"], data.icon)


@router.delete("/avatar", response_model=Account)
async def delete_avatar(identity: Identity) -> Account:
    return await account.delete_avatar(identity["sub"])
