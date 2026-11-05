import logging
from functools import lru_cache
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi_plugin import Auth0FastAPI

from app.core.config import get_settings

logger = logging.getLogger(__name__)
bearer = HTTPBearer(auto_error=False)


@lru_cache
def get_auth0() -> Auth0FastAPI:
    settings = get_settings()
    if not settings.auth0_domain or not settings.auth0_audience:
        logger.error("Auth0 domain and audience must be configured")
        raise HTTPException(status_code=503, detail="Authentication is not configured")
    return Auth0FastAPI(domain=settings.auth0_domain, audience=settings.auth0_audience)


async def require_identity(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> dict[str, Any]:
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Bearer access token required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    auth0 = get_auth0()
    try:
        claims = await auth0.require_auth()(request)
    except HTTPException as exc:
        if exc.status_code >= 500:
            logger.error("Authentication service failed (HTTP %s)", exc.status_code)
            raise HTTPException(
                status_code=503, detail="Authentication service is unavailable"
            ) from None
        raise HTTPException(
            status_code=exc.status_code,
            detail="Invalid access token",
            headers=exc.headers,
        ) from None
    if not isinstance(claims.get("sub"), str) or not claims["sub"].strip():
        raise HTTPException(
            status_code=401,
            detail="Access token has no subject",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return claims


Identity = Annotated[dict[str, Any], Depends(require_identity)]
