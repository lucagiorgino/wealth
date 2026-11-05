import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from app.core.config import get_settings
from app.db.asset_snapshots import close_due_snapshots
from app.db.postgres import DatabaseUnavailable

logger = logging.getLogger(__name__)


async def snapshot_worker() -> None:
    while True:
        try:
            await close_due_snapshots()
        except DatabaseUnavailable:
            logger.error("Month-end balance closure unavailable; retrying in 60 seconds")
        await asyncio.sleep(60)


def worker_finished(worker: asyncio.Task) -> None:
    if not worker.cancelled() and (error := worker.exception()) is not None:
        logger.critical("Month-end balance worker stopped (%s)", type(error).__name__)


@asynccontextmanager
async def snapshot_lifespan(app):
    worker = None
    if get_settings().database_url.get_secret_value():
        worker = asyncio.create_task(snapshot_worker(), name="month-end-balances")
        worker.add_done_callback(worker_finished)
    try:
        yield
    finally:
        if worker:
            worker.cancel()
            with suppress(asyncio.CancelledError):
                await worker
