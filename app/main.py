from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import RequestResponseEndpoint

from app.api.account import router as account_router
from app.api.categories import router as categories_router
from app.api.health import router as health_router
from app.api.identity import router as identity_router
from app.api.preferences import router as preferences_router
from app.api.summary import router as summary_router
from app.api.transaction_imports import router as transaction_imports_router
from app.api.transactions import router as transactions_router
from app.api.wallets import router as wallets_router
from app.db.categories import (
    CategoryInUse,
    CategoryKindMismatch,
    CategoryNameConflict,
    CategoryNotFound,
)
from app.db.postgres import DatabaseUnavailable
from app.db.transaction_imports import ImportKeyConflict
from app.db.transactions import (
    TransactionCategoryMismatch,
    TransactionNotFound,
    TransactionReferenceNotFound,
    TransferCurrencyMismatch,
)
from app.db.wallets import WalletCurrencyInUse, WalletInUse, WalletNotFound
from app.services.profile_images import InvalidProfileImage
from app.services.summary import InvalidExpenseComparison
from app.services.transaction_imports import InvalidTransactionCSV, InvalidTransactionImport
from app.services.transactions import InvalidBulkTransactionChange
from app.services.wallet_icons import InvalidWalletIcon, WalletIconUnavailable

app = FastAPI(title="Wealth", version="0.1.0")
app.include_router(health_router)
app.include_router(identity_router)
app.include_router(account_router)
app.include_router(preferences_router)
app.include_router(wallets_router)
app.include_router(categories_router)
app.include_router(transaction_imports_router)
app.include_router(transactions_router)
app.include_router(summary_router)


@app.exception_handler(InvalidBulkTransactionChange)
async def invalid_bulk_transaction_change(
    request: Request, exc: InvalidBulkTransactionChange
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Changes must be valid for every selected transaction. "
            "Check amount, type, wallets, category and recurrence. "
            "No transactions were changed."
        },
    )


@app.exception_handler(InvalidWalletIcon)
async def invalid_wallet_icon(request: Request, exc: InvalidWalletIcon) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Provide a direct public HTTPS favicon URL (PNG, JPEG, WebP or ICO), "
            "up to 2 MiB and 4096 pixels per side. Redirects and private addresses are refused."
        },
    )


@app.exception_handler(WalletIconUnavailable)
async def wallet_icon_unavailable(request: Request, exc: WalletIconUnavailable) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": "Favicon download is unavailable"})


@app.exception_handler(CategoryKindMismatch)
async def category_kind_mismatch(request: Request, exc: CategoryKindMismatch) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": "Category type cannot be changed"})


@app.exception_handler(TransactionCategoryMismatch)
async def transaction_category_mismatch(
    request: Request, exc: TransactionCategoryMismatch
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Income requires income categories; "
            "expenses and transfers require expense categories"
        },
    )


@app.exception_handler(InvalidExpenseComparison)
async def invalid_expense_comparison(
    request: Request, exc: InvalidExpenseComparison
) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(WalletNotFound)
async def wallet_not_found(request: Request, exc: WalletNotFound) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": "Wallet not found"})


@app.exception_handler(WalletInUse)
async def wallet_in_use(request: Request, exc: WalletInUse) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": "Wallet is used by transactions"})


@app.exception_handler(WalletCurrencyInUse)
async def wallet_currency_in_use(request: Request, exc: WalletCurrencyInUse) -> JSONResponse:
    return JSONResponse(
        status_code=409, content={"detail": "Currency cannot change while wallet has transactions"}
    )


@app.exception_handler(TransferCurrencyMismatch)
async def transfer_currency_mismatch(
    request: Request, exc: TransferCurrencyMismatch
) -> JSONResponse:
    return JSONResponse(
        status_code=422, content={"detail": "Transfers require wallets with the same currency"}
    )


@app.exception_handler(InvalidTransactionCSV)
async def invalid_transaction_csv(request: Request, exc: InvalidTransactionCSV) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(InvalidTransactionImport)
async def invalid_transaction_import(
    request: Request, exc: InvalidTransactionImport
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Approve missing records, fix or discard invalid rows, "
            "and select at least one row.",
            "validation": exc.report.model_dump(mode="json"),
        },
    )


@app.exception_handler(ImportKeyConflict)
async def import_key_conflict(request: Request, exc: ImportKeyConflict) -> JSONResponse:
    return JSONResponse(
        status_code=409, content={"detail": "This import key was already used with different data."}
    )


@app.exception_handler(InvalidProfileImage)
async def invalid_profile_image(request: Request, exc: InvalidProfileImage) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Choose a valid, non-animated PNG, JPEG, or WebP image "
            "up to 4096 pixels per side"
        },
    )


@app.exception_handler(TransactionNotFound)
async def transaction_not_found(request: Request, exc: TransactionNotFound) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": "Transaction not found"})


@app.exception_handler(TransactionReferenceNotFound)
async def transaction_reference_not_found(
    request: Request, exc: TransactionReferenceNotFound
) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": "Transaction reference not found"})


@app.exception_handler(CategoryInUse)
async def category_in_use(request: Request, exc: CategoryInUse) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": "Category is used by transactions"})


@app.exception_handler(CategoryNotFound)
async def category_not_found(request: Request, exc: CategoryNotFound) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": "Category not found"})


@app.exception_handler(CategoryNameConflict)
async def category_name_conflict(request: Request, exc: CategoryNameConflict) -> JSONResponse:
    return JSONResponse(
        status_code=409,
        content={
            "detail": "A category with this name already exists at this level. "
            "Choose a unique name."
        },
    )


@app.exception_handler(DatabaseUnavailable)
async def database_unavailable(request: Request, exc: DatabaseUnavailable) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": "Database is unavailable"})


@app.middleware("http")
async def private_api_responses(request: Request, call_next: RequestResponseEndpoint) -> Response:
    response = await call_next(request)
    if request.url.path.startswith("/api/v1/"):
        response.headers["Cache-Control"] = "private, no-store"
    return response
