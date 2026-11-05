from fastapi import APIRouter
from pydantic import BaseModel

from app.core.auth import Identity

router = APIRouter(prefix="/api/v1", tags=["identity"])


class CurrentUser(BaseModel):
    subject: str


@router.get("/me", response_model=CurrentUser)
async def current_user(identity: Identity) -> CurrentUser:
    return CurrentUser(subject=identity["sub"])
