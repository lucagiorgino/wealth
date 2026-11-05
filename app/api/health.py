from fastapi import APIRouter, HTTPException

from app.db.postgres import DatabaseUnavailable, check_database

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    """Public process liveness, independent of PostgreSQL and Auth0."""
    return {"status": "ok"}


@router.get("/ready")
async def ready() -> dict[str, str]:
    """Public database readiness; does not test the identity provider."""
    try:
        await check_database()
    except DatabaseUnavailable:
        raise HTTPException(status_code=503, detail="Database is unavailable") from None
    return {"status": "ready"}
