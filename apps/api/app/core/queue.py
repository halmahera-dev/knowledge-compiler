"""arq queue wiring.

Compilation runs out of band so a save returns immediately and the user watches
the pipeline work in the activity feed. That live diff is the product's main
surface, so the HLD's synchronous option would trade away the thing worth showing.
"""

from __future__ import annotations

import uuid
from urllib.parse import urlparse

import structlog
from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from app.core.config import get_settings

# Imported for its side effect, and imported here because this module is the
# one thing both the API and the worker load before touching arq. Production
# runs ElastiCache Serverless, which is a cluster; without this every enqueue
# fails CROSSSLOT. See the module for why patching one place is not enough.
from app.core.redis_keys import QUEUE_NAME, apply_hash_tag

apply_hash_tag()

log = structlog.get_logger(__name__)

COMPILE_TASK = "compile_item"

_pool: ArqRedis | None = None


def redis_settings() -> RedisSettings:
    """Translate REDIS_URI into arq's settings object."""
    parsed = urlparse(get_settings().redis_uri)
    database = 0
    if parsed.path and len(parsed.path) > 1:
        try:
            database = int(parsed.path.lstrip("/"))
        except ValueError:
            database = 0
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        password=parsed.password,
        database=database,
        ssl=parsed.scheme == "rediss",
    )


async def get_pool() -> ArqRedis:
    global _pool
    if _pool is None:
        # Named explicitly: arq bound its own default when the module was
        # imported, which is before the patch above could reach it.
        _pool = await create_pool(redis_settings(), default_queue_name=QUEUE_NAME)
    return _pool


async def enqueue_compile(*, run_id: uuid.UUID, raw_item_id: uuid.UUID, workspace_id: str) -> None:
    """Queue a compile.

    Failure to enqueue is surfaced on the run itself rather than raised, so the
    user's content is never lost just because the worker is down; the run shows
    as failed and can be retried.
    """
    try:
        pool = await get_pool()
        await pool.enqueue_job(
            COMPILE_TASK, str(run_id), str(raw_item_id), workspace_id, _job_id=str(run_id)
        )
    except Exception as exc:
        log.error("enqueue_failed", run_id=str(run_id), error=str(exc))
        from app.core.db import session_scope
        from app.models import CompileRun

        async with session_scope() as db:
            run = await db.get(CompileRun, run_id)
            if run is not None:
                run.status = "failed"
                run.error = f"could not queue compile: {exc}"
                await db.commit()


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.aclose()
    _pool = None
