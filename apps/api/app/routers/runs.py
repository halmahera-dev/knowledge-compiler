"""Compile runs — the activity feed's history, and the live SSE stream."""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import uuid

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import select
from sse_starlette.sse import EventSourceResponse

from .. import events
from ..auth import AuthError, get_verifier
from ..config import get_settings
from ..deps import DbDep, MemberScope, ScopeDep, SettingsDep
from ..models import CompileRun, RawItem
from ..queue import enqueue_compile
from ..ratelimit import check_hourly
from ..schemas import GapOut, RunOut

router = APIRouter(prefix="/api/v1", tags=["runs"])

#: Run states that may be queued again.
#:
#: Named rather than inlined because the exclusions carry the reasoning, and both
#: are dangerous to get wrong: re-running a ``succeeded`` compile merges the same
#: claims into the page a second time, and re-queueing a ``running`` one has two
#: workers compiling one item concurrently. A new status must be added here
#: deliberately — ``test_runs.py`` fails until someone decides which side it is on.
RETRYABLE_STATUSES = frozenset({"failed", "queued"})


@router.get("/runs", response_model=list[RunOut])
async def list_runs(
    db: DbDep,
    scope: ScopeDep,
    limit: int = Query(30, ge=1, le=200),
) -> list[RunOut]:
    """Recent compiles, newest first. This is the activity feed on page load."""
    rows = (
        await db.execute(
            select(CompileRun, RawItem.title, RawItem.source_url)
            .join(RawItem, RawItem.id == CompileRun.raw_item_id)
            .where(CompileRun.workspace_id == scope.workspace_id)
            .order_by(CompileRun.created_at.desc())
            .limit(limit)
        )
    ).all()

    return [
        RunOut(
            id=run.id,
            raw_item_id=run.raw_item_id,
            status=run.status,
            diff=run.diff,
            error=run.error,
            created_at=run.created_at,
            finished_at=run.finished_at,
            item_title=title,
            source_url=url,
        )
        for run, title, url in rows
    ]


@router.get("/runs/{run_id}", response_model=RunOut)
async def get_run(run_id: uuid.UUID, db: DbDep, scope: ScopeDep) -> RunOut:
    run = await db.get(CompileRun, run_id)
    if run is None or run.workspace_id != scope.workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="run not found")
    item = await db.get(RawItem, run.raw_item_id)
    return RunOut(
        id=run.id,
        raw_item_id=run.raw_item_id,
        status=run.status,
        diff=run.diff,
        error=run.error,
        created_at=run.created_at,
        finished_at=run.finished_at,
        item_title=item.title if item else None,
        source_url=item.source_url if item else None,
    )


@router.post("/runs/{run_id}/retry", response_model=RunOut)
async def retry_run(run_id: uuid.UUID, db: DbDep, scope: MemberScope) -> RunOut:
    """Queue a finished-badly run again.

    Resets the existing row rather than inserting a new one. A run is a unit of
    work, not an audit record — what actually happened to the wiki is kept in page
    revisions — and leaving the old card behind next to its retry would mean the
    feed grows every time the agent is briefly unreachable.

    Only `failed` and `queued` runs qualify. A `succeeded` run has already been
    merged and recompiling it would duplicate claims; a `running` one is in the
    agent's hands and re-queueing it would compile the same item twice at once.
    """
    await check_hourly(
        scope, name="compile", limit=get_settings().compile_rate_limit_per_hour
    )

    run = await db.get(CompileRun, run_id)
    if run is None or run.workspace_id != scope.workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="run not found")

    if run.status not in RETRYABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"a {run.status} run cannot be retried",
        )

    item = await db.get(RawItem, run.raw_item_id)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="the saved item is gone"
        )

    run.status = "queued"
    run.error = None
    run.started_at = None
    run.finished_at = None
    # Bumped so the feed stops treating it as stalled — that check is purely
    # age-based, and without this the retry would look dead on arrival.
    run.created_at = dt.datetime.now(dt.UTC)
    await db.commit()

    await enqueue_compile(
        run_id=run.id, raw_item_id=run.raw_item_id, workspace_id=scope.workspace_id
    )

    return RunOut(
        id=run.id,
        raw_item_id=run.raw_item_id,
        status=run.status,
        diff=run.diff,
        error=run.error,
        created_at=run.created_at,
        finished_at=run.finished_at,
        item_title=item.title,
        source_url=item.source_url,
    )


@router.get("/stream")
async def stream(
    request: Request,
    settings: SettingsDep,
    token: str | None = Query(None, description="Bearer token; EventSource cannot set headers"),
) -> EventSourceResponse:
    """Server-sent events for the live compile feed.

    Watching the pipeline move through extract → match → compile → link is the
    point: it is what makes the compile step visible rather than a black box.

    Authenticated via a query parameter because `EventSource` cannot set headers.
    That is acceptable for this endpoint — the token is short-lived and the stream
    is read-only — but it is not a pattern to copy onto a write endpoint.

    Events are filtered to the caller's workspace. One Redis channel carries every
    tenant's events, so without this filter a compile in one workspace would
    appear live in every other workspace's activity feed.
    """
    workspace_id: str | None = None
    if token:
        try:
            workspace_id = get_verifier().verify(token).workspace_id
        except AuthError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
            ) from exc
    elif settings.allow_anonymous:
        workspace_id = settings.default_workspace_id

    if not workspace_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="sign in to watch the feed"
        )

    async def publisher():
        # A periodic comment keeps proxies from closing an idle connection and
        # lets the client notice a dead stream.
        keepalive = 15.0
        queue: asyncio.Queue[dict] = asyncio.Queue()

        async def pump() -> None:
            async for event in events.subscribe():
                await queue.put(event)

        task = asyncio.create_task(pump())
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=keepalive)
                except TimeoutError:
                    yield {"event": "ping", "data": "{}"}
                    continue

                # Drop other tenants' events. An event with no workspace is also
                # dropped: unattributable is treated as not-ours, which fails
                # closed rather than broadcasting it to everyone.
                if event.get("workspaceId") != workspace_id:
                    continue

                yield {"event": "message", "data": json.dumps(event)}
        finally:
            task.cancel()

    return EventSourceResponse(publisher())


@router.get("/gaps", response_model=list[GapOut])
async def list_gaps(db: DbDep, scope: ScopeDep, limit: int = Query(50, ge=1, le=200)):
    """Open questions the knowledge base cannot yet answer."""
    from ..models import GraphNode, KnowledgeGap, WikiPage

    rows = (
        await db.execute(
            select(KnowledgeGap, GraphNode.label, WikiPage.slug)
            .join(GraphNode, GraphNode.id == KnowledgeGap.node_id, isouter=True)
            .join(WikiPage, WikiPage.id == GraphNode.wiki_page_id, isouter=True)
            .where(KnowledgeGap.workspace_id == scope.workspace_id, KnowledgeGap.status == "open")
            .order_by(KnowledgeGap.created_at.desc())
            .limit(limit)
        )
    ).all()

    return [
        GapOut(
            id=gap.id,
            question=gap.question,
            reason=gap.reason,
            status=gap.status,
            created_at=gap.created_at,
            node_label=label,
            node_slug=slug,
        )
        for gap, label, slug in rows
    ]


@router.post("/gaps/{gap_id}/dismiss", status_code=status.HTTP_204_NO_CONTENT)
async def dismiss_gap(gap_id: uuid.UUID, db: DbDep, scope: ScopeDep) -> None:
    from ..models import KnowledgeGap

    gap = await db.get(KnowledgeGap, gap_id)
    if gap is None or gap.workspace_id != scope.workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="gap not found")
    gap.status = "dismissed"
    await db.commit()
