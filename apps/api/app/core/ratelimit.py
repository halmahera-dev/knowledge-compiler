"""Bounding how fast a workspace can spend money.

Every save is a model call: a compile runs extraction, matching and linking
through the LLM, and a long PDF becomes several of them. Nothing capped that, so
a client stuck in a retry loop — or one account behaving badly — could run up an
unbounded Bedrock bill with ordinary, authenticated requests.

Keyed by workspace rather than by IP. The workspace is what the token names and
what the spend is attributable to; an IP is neither, and behind a proxy it is not
even distinct.

Fixed windows rather than a token bucket. The imprecision at a window edge (up to
twice the limit across a boundary) does not matter for a ceiling whose job is to
turn "unbounded" into "bounded" — and a fixed window costs one INCR, which keeps
the limiter off the critical path of a request that is about to do far more work.
"""

from __future__ import annotations

import time

import structlog
from fastapi import HTTPException, status

from app.core.events import get_redis
from app.core.scoping import Scope

log = structlog.get_logger(__name__)


class RateLimitExceeded(HTTPException):
    def __init__(self, retry_after: int, limit: int, window_seconds: int):
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"that is more than {limit} of these in "
                f"{window_seconds // 60 or 1} minutes — try again shortly"
            ),
            # Standard, and the only part of a 429 a client can act on.
            headers={"Retry-After": str(retry_after)},
        )


async def check(scope: Scope, *, name: str, limit: int, window_seconds: int) -> None:
    """Count one use, raising once the workspace is over its allowance.

    Redis being unreachable does not block the request. A limiter that takes the
    API down when its own store is unavailable has converted a cost control into
    an outage; the compile queue and the model client have their own failure
    handling, and losing the ceiling for the duration is the lesser harm.
    """
    window = int(time.time()) // window_seconds
    key = f"ratelimit:{name}:{scope.workspace_id}:{window}"

    try:
        client = get_redis()
        used = await client.incr(key)
        if used == 1:
            # Only on creation, so the window cannot be extended by later hits.
            await client.expire(key, window_seconds)
    except Exception as exc:  # noqa: BLE001 - deliberately broad; see docstring
        log.warning("ratelimit_unavailable", name=name, error=str(exc))
        return

    if used > limit:
        retry_after = window_seconds - (int(time.time()) % window_seconds)
        log.info(
            "ratelimit_exceeded",
            name=name,
            workspace_id=scope.workspace_id,
            used=used,
            limit=limit,
        )
        raise RateLimitExceeded(retry_after, limit, window_seconds)


async def check_hourly(scope: Scope, *, name: str, limit: int) -> None:
    """The common case: an allowance per workspace per hour."""
    await check(scope, name=name, limit=limit, window_seconds=3600)
