"""Redis pub/sub bridge feeding the live compile feed.

The compile pipeline runs in the arq worker, but the SSE stream is served by the
web process. Redis pub/sub carries events between them, which also means several
browser tabs can watch the same compile.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import redis.asyncio as redis
import structlog

from .config import get_settings

log = structlog.get_logger(__name__)

CHANNEL = "kc:compile-events"

_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(get_settings().redis_uri, decode_responses=True)
    return _client


async def publish(event: dict[str, Any]) -> None:
    """Emit an event to the feed.

    Deliberately best-effort: a compile that succeeded must not be reported as
    failed because the notification could not be delivered.
    """
    try:
        await get_redis().publish(CHANNEL, json.dumps(event, default=str))
    except Exception as exc:
        log.warning("event_publish_failed", error=str(exc), event_type=event.get("type"))


async def subscribe() -> AsyncIterator[dict[str, Any]]:
    """Yield compile events as they are published."""
    pubsub = get_redis().pubsub()
    await pubsub.subscribe(CHANNEL)
    try:
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            try:
                yield json.loads(message["data"])
            except json.JSONDecodeError:
                log.warning("event_decode_failed", data=str(message.get("data"))[:200])
    finally:
        await pubsub.unsubscribe(CHANNEL)
        await pubsub.aclose()


async def close_redis() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
    _client = None


# ─── event constructors ──────────────────────────────────────────────────────
# Shapes match `compileEventSchema` in packages/contracts.
#
# Every event carries its workspace. One Redis channel serves all tenants, so
# without this the SSE endpoint would fan a compile out to every connected
# browser — including people in other workspaces.


def run_started(
    run_id: str, raw_item_id: str, title: str | None, workspace_id: str
) -> dict[str, Any]:
    return {
        "type": "run.started",
        "runId": run_id,
        "rawItemId": raw_item_id,
        "title": title,
        "workspaceId": workspace_id,
    }


def run_step(run_id: str, step: str, detail: str, workspace_id: str) -> dict[str, Any]:
    return {
        "type": "run.step",
        "runId": run_id,
        "step": step,
        "detail": detail,
        "workspaceId": workspace_id,
    }


def run_succeeded(run_id: str, diff: dict[str, Any], workspace_id: str) -> dict[str, Any]:
    return {
        "type": "run.succeeded",
        "runId": run_id,
        "diff": diff,
        "workspaceId": workspace_id,
    }


def run_failed(run_id: str, error: str, workspace_id: str) -> dict[str, Any]:
    return {
        "type": "run.failed",
        "runId": run_id,
        "error": error,
        "workspaceId": workspace_id,
    }
