"""Endpoints the Mastra agent calls back into.

The agent holds no database connection. Everything it needs to read or write goes
through here, which keeps a single transactional writer and means a failed agent
run can never leave the knowledge base half-updated.

All routes require the shared internal token — they accept writes that bypass
capture, so they must not be reachable from a browser.
"""

from __future__ import annotations

import datetime as dt
import uuid

import structlog
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from .. import events
from ..deps import DbDep, EmbedderDep, InternalAuth, scope_from_item, scope_from_run
from ..embeddings import build_embedding_input
from ..models import ChatSession, CompileRun, RawItem, WikiClaim, WikiPage, WikiPageRevision
from ..schemas import (
    ApplyCompileRequest,
    CommunityMaterialOut,
    CommunitySummaryRequest,
    CompileDiff,
    EmbedRequest,
    EmbedResponse,
    ExistingClaim,
    MatchRequest,
    MatchResponse,
    PageClaimsResponse,
    PendingCommunitiesRequest,
    PendingCommunitiesResponse,
    RawItemContent,
    RunFailedRequest,
    RunStepRequest,
    SectionOut,
    UsageRecordRequest,
)
from ..services import communities, usage
from ..services.compile import CompileError, apply_compile
from ..services.matching import find_similar_pages, resolve_threshold

router = APIRouter(prefix="/internal", tags=["internal"], dependencies=[InternalAuth])
log = structlog.get_logger(__name__)


@router.get("/items/{item_id}", response_model=RawItemContent)
async def item_content(item_id: uuid.UUID, db: DbDep) -> RawItemContent:
    """The FULL text of a captured item, for the compile pipeline.

    Separate from `GET /api/v1/items/{id}`, which returns a short excerpt because
    it feeds list and detail views in the browser. The agent needs the whole
    document: reading it from the excerpt endpoint silently truncated every
    source to the first 2000 characters, so anything longer than a couple of
    paragraphs was compiled from its opening only.
    """
    item = await db.get(RawItem, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="item not found")

    return RawItemContent(
        id=item.id,
        capture_type=item.capture_type,
        source_url=item.source_url,
        title=item.title,
        content=item.content,
        created_at=item.created_at,
    )


@router.post("/embed", response_model=EmbedResponse)
async def embed(payload: EmbedRequest, embedder: EmbedderDep) -> EmbedResponse:
    vectors = await embedder.embed(payload.texts)
    return EmbedResponse(model=embedder.name, vectors=vectors)


@router.post("/match", response_model=MatchResponse)
async def match(
    payload: MatchRequest, db: DbDep, embedder: EmbedderDep
) -> MatchResponse:
    """Which existing pages is this text closest to?

    Returns neighbours with their similarity and the merge threshold, so the agent
    can see near-misses rather than being handed a single pre-made decision.
    """
    # The workspace is derived from the run, never taken from the request body:
    # the agent is a trusted service but is not trusted to name a workspace, so a
    # buggy or compromised agent cannot search across tenants.
    scope = await scope_from_run(db, payload.run_id)

    vectors = await embedder.embed([payload.text[:8000]])
    candidates = await find_similar_pages(
        db, workspace_id=scope.workspace_id, embedding=vectors[0], top_k=payload.top_k
    )
    return MatchResponse(
        candidates=candidates,
        threshold=resolve_threshold(embedder.suggested_threshold),
    )


@router.get("/pages/{page_id}/claims", response_model=PageClaimsResponse)
async def page_claims(page_id: uuid.UUID, db: DbDep) -> PageClaimsResponse:
    """The live claims on a page, so the agent can spot contradictions."""
    page = await db.get(WikiPage, page_id)
    if page is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="page not found")

    sections: list[SectionOut] = []
    claims: list[ExistingClaim] = []

    if page.current_revision_id:
        revision = await db.get(WikiPageRevision, page.current_revision_id)
        if revision:
            sections = [SectionOut(**s) for s in (revision.body or [])]
        rows = (
            await db.scalars(
                select(WikiClaim)
                .where(WikiClaim.revision_id == page.current_revision_id)
                .order_by(WikiClaim.position)
            )
        ).all()
        claims = [
            ExistingClaim(id=c.id, text=c.text, section=c.section, status=c.status) for c in rows
        ]

    return PageClaimsResponse(
        page_id=page.id,
        title=page.title,
        summary=page.summary,
        sections=sections,
        claims=claims,
    )


@router.post("/apply-compile", response_model=CompileDiff)
async def apply(
    payload: ApplyCompileRequest, db: DbDep, embedder: EmbedderDep
) -> CompileDiff:
    """Persist a compile result. One transaction: it all lands, or none of it does."""
    item = await db.get(RawItem, payload.raw_item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="raw item not found")

    # Scope and destination wiki both come from the stored item, so the agent
    # cannot redirect a compile into another workspace or another wiki.
    scope = await scope_from_item(db, payload.raw_item_id)
    if item.workspace_id != scope.workspace_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="workspace mismatch")

    # The page's embedding represents the compiled topic, not the raw source, so
    # it is computed from the title and summary the agent settled on.
    page_embedding: list[float] | None = None
    embedding_model: str | None = None
    try:
        vectors = await embedder.embed([build_embedding_input(payload.title, payload.summary)])
        page_embedding = vectors[0]
        embedding_model = embedder.name
    except Exception as exc:
        # Losing this embedding weakens future matching against this page but does
        # not invalidate the compile itself.
        log.warning("page_embedding_failed", run_id=str(payload.run_id), error=str(exc))

    try:
        diff = await apply_compile(
            db,
            payload,
            scope=scope,
            wiki_id=item.wiki_id,
            embedding=page_embedding,
            embedding_model=embedding_model,
        )
    except CompileError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    await db.commit()

    await events.publish(
        events.run_succeeded(
            str(payload.run_id),
            diff.model_dump(by_alias=True, mode="json"),
            scope.workspace_id,
        )
    )
    return diff


@router.post("/runs/step", status_code=status.HTTP_204_NO_CONTENT)
async def report_step(payload: RunStepRequest, db: DbDep) -> None:
    """Progress ping from a workflow step, forwarded to the live feed."""
    scope = await scope_from_run(db, payload.run_id)
    await events.publish(
        events.run_step(str(payload.run_id), payload.step, payload.detail, scope.workspace_id)
    )


@router.post("/runs/failed", status_code=status.HTTP_204_NO_CONTENT)
async def report_failure(payload: RunFailedRequest, db: DbDep) -> None:
    """Record a failed compile.

    The raw model output is kept so a schema failure is diagnosable rather than
    just "failed".
    """
    run = await db.get(CompileRun, payload.run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="run not found")

    run.status = "failed"
    run.error = payload.error[:4000]
    run.raw_output = (payload.raw_output or "")[:20000] or None
    run.finished_at = dt.datetime.now(dt.UTC)

    item = await db.get(RawItem, run.raw_item_id)
    if item is not None:
        item.status = "failed"

    await db.commit()
    await events.publish(
        events.run_failed(str(payload.run_id), payload.error, run.workspace_id)
    )


@router.post("/usage", status_code=status.HTTP_204_NO_CONTENT)
async def record_usage(payload: UsageRecordRequest, db: DbDep) -> None:
    """One model call the agent just made.

    The workspace comes from the run or the session, never from the request. The
    agent is trusted to say what it spent; it is not trusted to say whose budget
    it came out of.

    Reported after the call rather than streamed during it, so a failed call
    still lands a row — a compile that burned tokens and then failed schema
    validation is exactly the expensive case worth seeing.
    """
    workspace_id: str | None = None
    raw_item_id: uuid.UUID | None = None

    if payload.run_id is not None:
        run = await db.get(CompileRun, payload.run_id)
        if run is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="run not found")
        workspace_id = run.workspace_id
        raw_item_id = run.raw_item_id
    elif payload.chat_session_id is not None:
        session = await db.get(ChatSession, payload.chat_session_id)
        if session is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session not found")
        workspace_id = session.workspace_id

    if workspace_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="no workspace for this usage"
        )

    await usage.record(
        db,
        workspace_id=workspace_id,
        service=payload.service,
        operation=payload.operation,
        provider=payload.provider,
        model=payload.model,
        input_tokens=payload.input_tokens,
        output_tokens=payload.output_tokens,
        tokens_estimated=payload.tokens_estimated,
        latency_ms=payload.latency_ms,
        status=payload.status,
        error=payload.error,
        compile_run_id=payload.run_id,
        chat_session_id=payload.chat_session_id,
        raw_item_id=raw_item_id,
    )
    await db.commit()


#: The API's own ceiling on how many clusters one compile may name.
#:
#: Enforced here rather than trusted from the request: the agent asking for a
#: larger batch is the exact mistake this is meant to survive, and the cost of
#: getting it wrong is an unbounded number of model calls per save.
MAX_COMMUNITIES_PER_RUN = 5


@router.post("/communities/pending", response_model=PendingCommunitiesResponse)
async def pending_communities(
    payload: PendingCommunitiesRequest, db: DbDep
) -> PendingCommunitiesResponse:
    """Clusters that need naming, with the material to name them from.

    Returns nothing most of the time, which is the point: a cluster keeps its
    summary as long as its membership is unchanged, so a compile that shifted
    nothing pays no model call at all.
    """
    scope = await scope_from_run(db, payload.run_id)
    limit = max(1, min(payload.limit, MAX_COMMUNITIES_PER_RUN))

    return PendingCommunitiesResponse(
        communities=[
            CommunityMaterialOut(
                fingerprint=material.fingerprint,
                community=material.community,
                node_count=material.node_count,
                page_count=material.page_count,
                labels=material.labels,
                pages=material.pages,
            )
            for material in await communities.unsummarised(db, scope, limit)
        ]
    )


@router.post("/communities/summary", status_code=status.HTTP_204_NO_CONTENT)
async def store_community_summary(payload: CommunitySummaryRequest, db: DbDep) -> None:
    """Attach the agent's prose to a cluster.

    A fingerprint that no longer exists is dropped rather than raising: another
    save landed while this summary was being written, so the cluster it describes
    is gone. Failing the call would fail a compile that in fact succeeded.
    """
    scope = await scope_from_run(db, payload.run_id)
    stored = await communities.store_summary(
        db, scope, payload.fingerprint, payload.title.strip(), payload.summary.strip()
    )
    if stored:
        await db.commit()
