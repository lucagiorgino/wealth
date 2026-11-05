import asyncio
from base64 import b64encode
from datetime import UTC, datetime
from uuid import UUID

from starlette.concurrency import run_in_threadpool

from app.db import wallets
from app.schemas.wallets import Wallet, WalletCreate, WalletIconPreview, WalletList
from app.services.wallet_icons import InvalidWalletIcon, WalletIconUnavailable, download_favicon


async def wallet_image(data: WalletCreate) -> bytes | None:
    if data.icon != "custom":
        if data.favicon_url is not None:
            raise InvalidWalletIcon
        return None
    if data.favicon_url is None:
        return None
    return await download_wallet_image(data.favicon_url)


async def download_wallet_image(url: str) -> bytes:
    try:
        return await asyncio.wait_for(run_in_threadpool(download_favicon, url), timeout=4)
    except TimeoutError:
        raise WalletIconUnavailable from None


async def preview_wallet_icon(url: str) -> WalletIconPreview:
    image = await download_wallet_image(url)
    return WalletIconPreview(
        icon_image_url="data:image/png;base64," + b64encode(image).decode("ascii")
    )


async def list_wallets(subject: str, page: int, page_size: int) -> WalletList:
    return await wallets.list_wallets(subject, page, page_size, datetime.now(UTC).date())


async def create_wallet(subject: str, data: WalletCreate) -> Wallet:
    image = await wallet_image(data)
    if data.icon == "custom" and image is None:
        raise InvalidWalletIcon
    return await wallets.create_wallet(subject, data, datetime.now(UTC).date(), image)


async def update_wallet(subject: str, wallet_id: UUID, data: WalletCreate) -> Wallet:
    image = await wallet_image(data)
    return await wallets.update_wallet(subject, wallet_id, data, datetime.now(UTC).date(), image)
