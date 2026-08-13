"""The wiki: compiled encyclopedia pages, their provenance, and their history."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select

from app.api.deps import DbDep, MemberScope, ScopeDep
from app.core.scoping import Scope
from app.models import (
    ClaimSource,
    GraphEdge,
    GraphNode,
    RawItem,
    WikiClaim,
    WikiPage,
    WikiPageRevision,
    WikiPageSource,
)
from app.schemas import (
    ClaimOut,
    ClaimSourceOut,
    PageDetailOut,
    PageSummaryOut,
    RawItemOut,
    RevertRequest,
    RevisionMetaOut,
    SectionOut,
)
from app.services.compile import CompileError, revert_page

router = APIRouter(prefix="/api/v1/pages", tags=["wiki"])


async def _summarize(db: DbDep, page: WikiPage) -> PageSummaryOut:
    source_count = (
        await db.scalar(
            select(func.count())
            .select_from(WikiPageSource)
            .where(WikiPageSource.page_id == page.id)
        )
    ) or 0

    claim_count = 0
    disputed = 0
    if page.current_revision_id:
        claim_count = (
            await db.scalar(
                select(func.count())
                .select_from(WikiClaim)
                .where(WikiClaim.revision_id == page.current_revision_id)
            )
        ) or 0
        disputed = (
            await db.scalar(
                select(func.count())
                .select_from(WikiClaim)
                .where(
                    WikiClaim.revision_id == page.current_revision_id,
                    WikiClaim.status == "disputed",
                )
            )
        ) or 0

    return PageSummaryOut(
        id=page.id,
        slug=page.slug,
        title=page.title,
        summary=page.summary,
        updated_at=page.updated_at,
        source_count=source_count,
        claim_count=claim_count,
        disputed_count=disputed,
    )


@router.get("", response_model=list[PageSummaryOut])
async def list_pages(
    db: DbDep,
    scope: ScopeDep,
    q: str | None = Query(None, description="Case-insensitive title/summary filter"),
    limit: int = Query(100, ge=1, le=500),
) -> list[PageSummaryOut]:
    stmt = select(WikiPage).where(WikiPage.workspace_id == scope.workspace_id)
    if q:
        pattern = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(WikiPage.title).like(pattern),
                func.lower(WikiPage.summary).like(pattern),
            )
        )
    pages = (await db.scalars(stmt.order_by(WikiPage.updated_at.desc()).limit(limit))).all()
    return [await _summarize(db, page) for page in pages]


async def _load_claims(db: DbDep, revision_id: uuid.UUID) -> list[ClaimOut]:
    """Claims with their source spans, so the page can show where each line came from."""
    claims = (
        await db.scalars(
            select(WikiClaim)
            .where(WikiClaim.revision_id == revision_id)
            .order_by(WikiClaim.position)
        )
    ).all()
    if not claims:
        return []

    rows = (
        await db.execute(
            select(ClaimSource, RawItem.source_url, RawItem.title)
            .join(RawItem, RawItem.id == ClaimSource.raw_item_id)
            .where(ClaimSource.claim_id.in_([c.id for c in claims]))
        )
    ).all()

    by_claim: dict[uuid.UUID, list[ClaimSourceOut]] = {}
    for source, url, title in rows:
        by_claim.setdefault(source.claim_id, []).append(
            ClaimSourceOut(
                raw_item_id=source.raw_item_id,
                quote=source.quote,
                stance=source.stance,
                source_url=url,
                source_title=title,
            )
        )

    return [
        ClaimOut(
            id=claim.id,
            section=claim.section,
            position=claim.position,
            text=claim.text,
            status=claim.status,
            confidence=claim.confidence,
            sources=by_claim.get(claim.id, []),
        )
        for claim in claims
    ]


async def _load_backlinks(db: DbDep, page: WikiPage, scope: Scope) -> list[PageSummaryOut]:
    """Pages one hop away in the graph — the 'see also' rail.

    Withdrawn edges are excluded so an undone compile stops suggesting the
    connections it made.
    """
    node_id = await db.scalar(select(GraphNode.id).where(GraphNode.wiki_page_id == page.id))
    if node_id is None:
        return []

    neighbour_ids = (
        await db.scalars(
            select(GraphEdge.target_node_id)
            .where(GraphEdge.source_node_id == node_id, GraphEdge.withdrawn_at.is_(None))
            .union(
                select(GraphEdge.source_node_id).where(
                    GraphEdge.target_node_id == node_id, GraphEdge.withdrawn_at.is_(None)
                )
            )
        )
    ).all()
    if not neighbour_ids:
        return []

    pages = (
        await db.scalars(
            select(WikiPage)
            .join(GraphNode, GraphNode.wiki_page_id == WikiPage.id)
            .where(
                GraphNode.id.in_(neighbour_ids),
                WikiPage.workspace_id == scope.workspace_id,
                WikiPage.id != page.id,
            )
            .limit(12)
        )
    ).all()

    return [await _summarize(db, p) for p in pages]


@router.get("/{slug}", response_model=PageDetailOut)
async def get_page(slug: str, db: DbDep, scope: ScopeDep) -> PageDetailOut:
    page = await db.scalar(
        select(WikiPage).where(WikiPage.workspace_id == scope.workspace_id, WikiPage.slug == slug)
    )
    if page is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="page not found")

    revisions = (
        await db.scalars(
            select(WikiPageRevision)
            .where(WikiPageRevision.page_id == page.id)
            .order_by(WikiPageRevision.revision_no.desc())
        )
    ).all()
    live = next((r for r in revisions if r.id == page.current_revision_id), None)
    if live is None and revisions:
        live = revisions[0]

    sources = (
        await db.scalars(
            select(RawItem)
            .join(WikiPageSource, WikiPageSource.raw_item_id == RawItem.id)
            .where(WikiPageSource.page_id == page.id)
            .order_by(RawItem.created_at)
        )
    ).all()

    return PageDetailOut(
        id=page.id,
        slug=page.slug,
        title=page.title,
        summary=page.summary,
        created_at=page.created_at,
        updated_at=page.updated_at,
        revision_no=live.revision_no if live else 0,
        sections=[SectionOut(**s) for s in (live.body if live else [])],
        claims=await _load_claims(db, live.id) if live else [],
        sources=[
            RawItemOut(
                id=item.id,
                capture_type=item.capture_type,
                source_url=item.source_url,
                title=item.title,
                status=item.status,
                created_at=item.created_at,
                excerpt=item.content[:280],
            )
            for item in sources
        ],
        backlinks=await _load_backlinks(db, page, scope),
        revisions=[
            RevisionMetaOut(
                id=r.id,
                revision_no=r.revision_no,
                created_at=r.created_at,
                action=(r.diff or {}).get("action"),
            )
            for r in revisions
        ],
    )


@router.get("/{slug}/revisions/{revision_no}", response_model=PageDetailOut)
async def get_revision(
    slug: str, revision_no: int, db: DbDep, scope: ScopeDep
) -> PageDetailOut:
    """A historical revision, rendered exactly as it was."""
    page = await db.scalar(
        select(WikiPage).where(WikiPage.workspace_id == scope.workspace_id, WikiPage.slug == slug)
    )
    if page is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="page not found")

    revision = await db.scalar(
        select(WikiPageRevision).where(
            WikiPageRevision.page_id == page.id, WikiPageRevision.revision_no == revision_no
        )
    )
    if revision is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="revision not found")

    return PageDetailOut(
        id=page.id,
        slug=page.slug,
        title=revision.title,
        summary=revision.summary,
        created_at=page.created_at,
        updated_at=revision.created_at,
        revision_no=revision.revision_no,
        sections=[SectionOut(**s) for s in (revision.body or [])],
        claims=await _load_claims(db, revision.id),
    )


@router.post("/{page_id}/revert", response_model=PageDetailOut)
async def revert(
    page_id: uuid.UUID, payload: RevertRequest, db: DbDep, scope: MemberScope
) -> PageDetailOut:
    """Undo a bad compile by rolling the page back to an earlier revision."""
    page = await db.get(WikiPage, page_id)
    if page is None or page.workspace_id != scope.workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="page not found")

    try:
        await revert_page(db, page=page, revision_no=payload.revision_no, scope=scope)
    except CompileError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    await db.commit()
    return await get_page(page.slug, db, scope)
