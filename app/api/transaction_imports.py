from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from app.core.auth import Identity
from app.db import transaction_imports
from app.schemas.transaction_imports import (
    MAX_CSV_BYTES,
    MAX_IMPORT_BODY_BYTES,
    ImportDocument,
    ImportRequest,
    ImportResult,
    ImportValidation,
)
from app.services.transaction_imports import parse_csv

router = APIRouter(prefix="/api/v1/transactions/import", tags=["transactions"])


async def bounded_body(request: Request, limit: int) -> bytes:
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > limit:
            raise HTTPException(status_code=413, detail="The import exceeds the allowed size.")
        body.extend(chunk)
    return bytes(body)


async def import_request(request: Request) -> ImportRequest:
    if request.headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
        raise HTTPException(status_code=415, detail="Use an application/json import request.")
    data = await bounded_body(request, MAX_IMPORT_BODY_BYTES)
    try:
        return ImportRequest.model_validate_json(data)
    except ValidationError:
        raise HTTPException(
            status_code=422, detail="Check the bounded import rows, mapping, and retry key."
        ) from None


@router.post("/upload", response_model=ImportDocument)
async def upload_csv(
    request: Request,
    identity: Identity,
    delimiter: Literal["auto", ",", ";", "\t"] = "auto",
) -> ImportDocument:
    if request.headers.get("content-type", "").split(";")[0].strip().lower() != "text/csv":
        raise HTTPException(status_code=415, detail="Upload a text/csv file.")
    return await run_in_threadpool(parse_csv, await bounded_body(request, MAX_CSV_BYTES), delimiter)


@router.post("/validate", response_model=ImportValidation)
async def validate_csv(request: Request, identity: Identity) -> ImportValidation:
    return await transaction_imports.preview_import(identity["sub"], await import_request(request))


@router.post("/confirm", response_model=ImportResult, status_code=201)
async def confirm_csv(request: Request, identity: Identity) -> ImportResult:
    return await transaction_imports.confirm_import(identity["sub"], await import_request(request))
