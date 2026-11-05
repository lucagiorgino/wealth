from fastapi import APIRouter

from app.core.auth import Identity
from app.db import preferences
from app.schemas.preferences import Preferences

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


@router.get("", response_model=Preferences)
async def get_settings(identity: Identity) -> Preferences:
    return await preferences.get_preferences(identity["sub"])


@router.put("", response_model=Preferences)
async def update_settings(data: Preferences, identity: Identity) -> Preferences:
    return await preferences.update_preferences(identity["sub"], data)
