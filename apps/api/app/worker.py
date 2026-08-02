"""arq worker: hands queued items to the Mastra agent and tracks the outcome.

The worker itself does no reasoning and no writing. It marks the run as running,
asks Mastra to execute the compile workflow, and records the result. The agent
writes through /internal/apply-compile, so there is still exactly one process
mutating the knowledge base.

Run with:  pnpm api:worker
"""

from __future__ import annotations

import asyncio
import datetime as dt
import uuid
from typing import Any

import httpx
import structlog

from . import events
from .config import get_settings
from .db import dispose_engine, session_scope
from .main import configure_logging
from .models import CompileRun, RawItem
from .queue import redis_settings

log = structlog.get_logger(__name__)

# Mastra exposes every registered workflow at this path.
WORKFLOW_ID = "compile-item"

# A compile makes several LLM calls, so it needs a generous ceiling — but a
# bounded one, or a hung model call would occupy a worker slot indefinitely.
WORKFLOW_TIMEOUT_SECONDS = 300.0


async def _mark_failed(run_id: uuid.UUID, message: str) -> None:
    workspace_id = ""
    async with session_scope() as db:
        run = await db.get(CompileRun, run_id)
        if run is not None:
            workspace_id = run.workspace_id
            run.status = "failed"
            run.error = message[:4000]
            run.finished_at = dt.datetime.now(dt.UTC)
            item = await db.get(RawItem, run.raw_item_id)
            if item is not None:
                item.status = "failed"
            await db.commit()
    await events.publish(events.run_failed(str(run_id), message, workspace_id))


async def compile_item(
    _ctx: dict[str, Any], run_id: str, raw_item_id: str, workspace_id: str
) -> str:
    """Drive one compile end to end."""
    settings = get_settings()
    run_uuid = uuid.UUID(run_id)

    async with session_scope() as db:
        run = await db.get(CompileRun, run_uuid)
        item = await db.get(RawItem, uuid.UUID(raw_item_id))
        if run is None or item is None:
            log.error("compile_target_missing", run_id=run_id)
            return "missing"

        run.status = "running"
        run.started_at = dt.datetime.now(dt.UTC)
        item.status = "processing"
        title = item.title
        await db.commit()

    await events.publish(events.run_started(run_id, raw_item_id, title, workspace_id))
    log.info("compile_started", run_id=run_id, title=title)

    url = f"{settings.mastra_url.rstrip('/')}/api/workflows/{WORKFLOW_ID}/start-async"
    try:
        async with httpx.AsyncClient(timeout=WORKFLOW_TIMEOUT_SECONDS) as client:
            response = await client.post(
                url,
                json={
                    "inputData": {
                        "runId": run_id,
                        "rawItemId": raw_item_id,
                        "workspaceId": workspace_id,
                    }
                },
            )
            response.raise_for_status()
            body = response.json()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500]
        await _mark_failed(run_uuid, f"agent returned {exc.response.status_code}: {detail}")
        return "failed"
    except httpx.HTTPError as exc:
        await _mark_failed(
            run_uuid,
            f"could not reach the agent at {settings.mastra_url} ({exc}). Is `pnpm dev` running?",
        )
        return "failed"

    # The run's terminal status is set by the agent calling back into
    # /internal/apply-compile (succeeded) or /internal/runs/failed (failed) — not
    # by this response. Mastra's start-async awaits the run today, but that is its
    # choice to change, so rather than assume the status has settled by now, poll
    # briefly. Declaring failure the instant start-async returns would mark every
    # successful compile as failed if the route ever became truly fire-and-forget.
    mastra_run_id = str(body.get("runId") or "")[:200] or None
    status = await _await_terminal_status(run_uuid, mastra_run_id)

    if status != "succeeded":
        message = "agent finished without applying a compile"
        await _mark_failed(run_uuid, message)
        return "failed"

    log.info("compile_finished", run_id=run_id)
    return "ok"


async def _await_terminal_status(
    run_uuid: uuid.UUID, mastra_run_id: str | None, *, timeout: float = 30.0
) -> str:
    """Wait for the agent's callback to settle the run, returning its final status."""
    deadline = asyncio.get_running_loop().time() + timeout

    while True:
        async with session_scope() as db:
            run = await db.get(CompileRun, run_uuid)
            if run is None:
                return "failed"
            if mastra_run_id and run.mastra_run_id != mastra_run_id:
                run.mastra_run_id = mastra_run_id
                await db.commit()
            if run.status in ("succeeded", "failed"):
                return run.status

        if asyncio.get_running_loop().time() >= deadline:
            return "running"
        await asyncio.sleep(0.5)


async def startup(_ctx: dict[str, Any]) -> None:
    configure_logging(get_settings().log_level)
    log.info("worker_ready", mastra_url=get_settings().mastra_url)


async def shutdown(_ctx: dict[str, Any]) -> None:
    await events.close_redis()
    await dispose_engine()


class WorkerSettings:
    """arq entry point."""

    functions = [compile_item]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = redis_settings()
    # One compile at a time keeps ordering intuitive in the feed and avoids two
    # runs racing to create the same page.
    max_jobs = 4
    job_timeout = WORKFLOW_TIMEOUT_SECONDS + 60
    keep_result = 3600
