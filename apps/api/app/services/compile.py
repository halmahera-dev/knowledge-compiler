"""Applying a compile result to the knowledge base.

This is the only place the agent's output becomes durable state, and it happens
in a single transaction: a compile either lands completely or not at all. That
matters because a half-applied compile would leave a page whose claims cite
sources that were never recorded, which is worse than a failed run.

Claims are revision-scoped, so a merge copies the previous revision's claims
forward alongside the new ones. Every revision is therefore self-contained, which
is what makes revert a pointer change rather than a replay.
"""

from __future__ import annotations

import datetime as dt
import uuid

import structlog
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.scoping import Scope
from app.models import (
    ClaimSource,
    CompileRun,
    GraphEdge,
    GraphNode,
    GraphNodeSource,
    KnowledgeGap,
    RawItem,
    WikiClaim,
    WikiPage,
    WikiPageRevision,
    WikiPageSource,
)
from app.schemas import (
    ApplyCompileRequest,
    CompileDiff,
    CompileDiffEdge,
    CompileDiffPage,
)
from app.services.anchoring import locate_quote
from app.services.clustering import detect_communities
from app.services.extraction import slugify
from app.services.matching import find_similar_pages

log = structlog.get_logger(__name__)


class CompileError(RuntimeError):
    pass


#: Slugs the web app already serves as static routes.
#:
#: Compiled pages live at `/{slug}`, and Next resolves a static segment before a
#: dynamic one — so a page titled "Capture" would take the slug `capture` and
#: then be unreachable forever, with nothing to indicate why. These are claimed
#: up front and suffixed instead. "Graph", "Gaps" and "Settings" are all
#: plausible titles for a knowledge base about this kind of software.
#:
#: "capture" is kept although that route was removed when saving moved into the
#: conversation. Freeing it would let one workspace's page take a slug that
#: every older workspace's page was refused, so the same title would resolve
#: differently depending on when it was compiled.
RESERVED_SLUGS = frozenset(
    {
        "activity",
        "agent",
        "ai-logs",
        "api",
        "capture",
        "disputes",
        "gaps",
        "graph",
        "landing",
        "login",
        "register",
        "settings",
        "wiki",
        "workspace",
    }
)


async def _unique_slug(db: AsyncSession, wiki_id: uuid.UUID, desired: str) -> str:
    """A slug free within this wiki, suffixing on collision."""
    base = slugify(desired)
    # A reserved word is treated exactly like a taken one: the bare form is never
    # offered, so the search starts at the first suffix.
    candidates = [base] if base not in RESERVED_SLUGS else []
    candidates += [f"{base}-{n}" for n in range(2, 50)]

    for slug in candidates:
        existing = await db.scalar(
            select(WikiPage.id).where(WikiPage.wiki_id == wiki_id, WikiPage.slug == slug)
        )
        if existing is None:
            return slug
    return f"{base}-{uuid.uuid4().hex[:6]}"


async def _resolve_page(
    db: AsyncSession, req: ApplyCompileRequest, scope: Scope, wiki_id: uuid.UUID
) -> tuple[WikiPage, bool]:
    """Find or create the page this compile targets."""
    if req.action != "create" and req.target_page_id:
        page = await db.get(WikiPage, req.target_page_id)
        if page is None:
            raise CompileError(f"target page {req.target_page_id} no longer exists")
        return page, False

    # A `create` that collides with an existing slug is treated as a merge — the
    # agent proposed a page that already exists, and duplicating it would split
    # the topic in two.
    existing = await db.scalar(
        select(WikiPage).where(WikiPage.wiki_id == wiki_id, WikiPage.slug == slugify(req.slug))
    )
    if existing is not None:
        return existing, False

    page = WikiPage(
        workspace_id=scope.workspace_id,
        wiki_id=wiki_id,
        slug=await _unique_slug(db, wiki_id, req.slug or req.title),
        title=req.title,
        summary=req.summary,
    )
    db.add(page)
    await db.flush()
    return page, True


async def _carry_forward_claims(
    db: AsyncSession, page: WikiPage, revision: WikiPageRevision
) -> list[WikiClaim]:
    """Copy the live revision's claims onto the new one.

    Without this a merge would silently drop everything previous sources
    contributed, which is the opposite of compiling.
    """
    if page.current_revision_id is None:
        return []

    previous = (
        await db.scalars(
            select(WikiClaim)
            .where(WikiClaim.revision_id == page.current_revision_id)
            .order_by(WikiClaim.position)
        )
    ).all()

    copies: list[WikiClaim] = []
    for old in previous:
        copy = WikiClaim(
            page_id=page.id,
            revision_id=revision.id,
            section=old.section,
            position=old.position,
            text=old.text,
            status=old.status,
            confidence=old.confidence,
        )
        db.add(copy)
        await db.flush()

        # Provenance must survive the copy, or a carried-forward claim would lose
        # the source that justified it.
        for source in old.sources:
            db.add(
                ClaimSource(
                    claim_id=copy.id,
                    raw_item_id=source.raw_item_id,
                    quote=source.quote,
                    char_start=source.char_start,
                    char_end=source.char_end,
                    stance=source.stance,
                )
            )
        # Remember where this copy came from so contradictions can find it.
        copy.__dict__["_origin_id"] = old.id
        copies.append(copy)

    return copies


async def _add_new_claims(
    db: AsyncSession,
    req: ApplyCompileRequest,
    page: WikiPage,
    revision: WikiPageRevision,
    carried: list[WikiClaim],
    start_position: int,
    source_text: str,
) -> tuple[int, int]:
    """Insert this source's claims. Returns (added, disputed)."""
    by_origin = {c.__dict__.get("_origin_id"): c for c in carried}
    disputed = 0

    for offset, incoming in enumerate(req.claims):
        claim = WikiClaim(
            page_id=page.id,
            revision_id=revision.id,
            section=incoming.section,
            position=start_position + offset,
            text=incoming.text,
            status=incoming.status,
            confidence=incoming.confidence,
        )
        db.add(claim)
        await db.flush()

        stance = "supports"
        if incoming.status == "disputed" and incoming.contradicts_claim_id:
            # Flag both sides rather than overwriting the older claim — the reader
            # judges, the agent does not silently pick a winner.
            target = by_origin.get(incoming.contradicts_claim_id)
            if target is not None:
                target.status = "disputed"
                stance = "contradicts"
                disputed += 1

        # Offsets are resolved here rather than taken from the model: a model
        # cannot count characters, so any offsets it supplied would point at the
        # wrong text. A quote that cannot be located is still recorded — the
        # quote itself is the evidence; the offsets only make it highlightable.
        anchor = locate_quote(source_text, incoming.quote)
        if anchor is None and incoming.quote.strip():
            log.info(
                "quote_not_located",
                run_id=str(req.run_id),
                quote=incoming.quote[:80],
            )

        db.add(
            ClaimSource(
                claim_id=claim.id,
                raw_item_id=req.raw_item_id,
                quote=incoming.quote,
                char_start=anchor.start if anchor else None,
                char_end=anchor.end if anchor else None,
                stance=stance,
            )
        )

    return len(req.claims), disputed


async def _upsert_node(
    db: AsyncSession, scope: Scope, label: str, *, page_id: uuid.UUID | None, kind: str
) -> tuple[GraphNode, bool]:
    """Get or create a node, bumping its weight when it already exists."""
    label = label.strip()[:200]
    node = await db.scalar(
        select(GraphNode).where(
            GraphNode.workspace_id == scope.workspace_id, GraphNode.label == label
        )
    )
    if node is not None:
        # Weight is "how much saved content touches this topic" (PRD §6.4).
        node.weight += 1
        node.updated_at = dt.datetime.now(dt.UTC)
        if page_id and node.wiki_page_id is None:
            node.wiki_page_id = page_id
        return node, False

    node = GraphNode(
        workspace_id=scope.workspace_id, label=label, kind=kind, wiki_page_id=page_id, weight=1
    )
    db.add(node)
    await db.flush()
    return node, True


async def _record_node_source(db: AsyncSession, node: GraphNode, raw_item_id: uuid.UUID) -> None:
    """Note that this capture is where the node was seen.

    Nothing else records it. Edges are only ever written between nodes a single
    compile established, so without this the graph has no way to know that two
    concepts came out of the same document — which is the only cheap signal
    available for connecting one save to another.

    Idempotent: a concept named twice in one document, or a node re-seen on a
    later compile of the same item, must not fail the compile.
    """
    exists = await db.scalar(
        select(GraphNodeSource).where(
            GraphNodeSource.node_id == node.id,
            GraphNodeSource.raw_item_id == raw_item_id,
        )
    )
    if exists is None:
        db.add(GraphNodeSource(node_id=node.id, raw_item_id=raw_item_id))


async def _link_candidates(
    db: AsyncSession, scope: Scope, raw_item_id: uuid.UUID, exclude_page_id: uuid.UUID
) -> dict[str, GraphNode]:
    """Existing topics the agent is allowed to link this document to.

    Cross-document edges are the most valuable ones the product can produce — a
    `contradicts` between two things you read weeks apart is the whole argument
    for compiling rather than retrieving. They were also impossible: the edge
    loop below only ever accepted nodes a single compile established, so nothing
    could span two saves.

    The guard that caused it was right, though, and is kept. A saved document is
    untrusted text, and text that can name any topic in the workspace can ask for
    an edge between a company and a crime. So the candidate list is decided
    **here**, from the raw item's own stored embedding, and never taken from the
    request — an agent shaped by injected content can still choose a wrong
    relation, but only among topics this API independently found to be near the
    document. Naming an arbitrary node is not one of the things it can do.

    Re-derived rather than passed through for the same reason. It costs one
    vector query and no embedding call, since the item was embedded on save.
    """
    item = await db.get(RawItem, raw_item_id)
    if item is None or item.embedding is None:
        return {}

    candidates = await find_similar_pages(
        db, workspace_id=scope.workspace_id, embedding=item.embedding
    )
    page_ids = [c.page_id for c in candidates if c.page_id != exclude_page_id]
    if not page_ids:
        return {}

    nodes = (
        await db.scalars(
            select(GraphNode).where(
                GraphNode.workspace_id == scope.workspace_id,
                GraphNode.wiki_page_id.in_(page_ids),
            )
        )
    ).all()
    return {node.label.lower(): node for node in nodes}


async def _apply_graph(
    db: AsyncSession, req: ApplyCompileRequest, page: WikiPage, scope: Scope
) -> tuple[list[str], list[CompileDiffEdge]]:
    """Create topic/concept nodes and the typed edges between them."""
    created_labels: list[str] = []

    topic_node, is_new = await _upsert_node(
        db, scope, req.title, page_id=page.id, kind="topic"
    )
    if is_new:
        created_labels.append(topic_node.label)
    await _record_node_source(db, topic_node, req.raw_item_id)

    nodes: dict[str, GraphNode] = {topic_node.label.lower(): topic_node}
    for concept in req.concepts[:12]:
        if not concept.strip():
            continue
        node, is_new = await _upsert_node(db, scope, concept, page_id=None, kind="entity")
        nodes[node.label.lower()] = node
        await _record_node_source(db, node, req.raw_item_id)
        if is_new:
            created_labels.append(node.label)

    # Topics from elsewhere in the workspace that this document may link to.
    # Added after the compile's own nodes so a label appearing in both resolves
    # to the node this compile just established, not to a namesake.
    candidates = await _link_candidates(db, scope, req.raw_item_id, page.id)
    linkable = {**candidates, **nodes}

    created_edges: list[CompileDiffEdge] = []
    for edge in req.edges[:20]:
        source = linkable.get(edge.source.strip().lower())
        target = linkable.get(edge.target.strip().lower())
        # Only nodes this compile established, or ones the API independently
        # found near this document. The agent never names a topic of its own
        # choosing — see _link_candidates.
        if source is None or target is None or source.id == target.id:
            continue

        existing = await db.scalar(
            select(GraphEdge).where(
                GraphEdge.source_node_id == source.id,
                GraphEdge.target_node_id == target.id,
                GraphEdge.relation == edge.relation,
            )
        )
        if existing is not None:
            existing.weight = min(1.0, existing.weight + 0.1)
            existing.withdrawn_at = None
            continue

        db.add(
            GraphEdge(
                workspace_id=scope.workspace_id,
                source_node_id=source.id,
                target_node_id=target.id,
                relation=edge.relation,
                weight=edge.weight,
                evidence_raw_item_id=req.raw_item_id,
                created_by_run_id=req.run_id,
            )
        )
        created_edges.append(
            CompileDiffEdge(source=source.label, target=target.label, relation=edge.relation)
        )

    return created_labels, created_edges


async def _apply_gaps(
    db: AsyncSession, req: ApplyCompileRequest, scope: Scope
) -> list[str]:
    raised: list[str] = []
    for gap in req.gaps[:5]:
        question = gap.question.strip()
        if not question:
            continue
        exists = await db.scalar(
            select(KnowledgeGap.id).where(
                KnowledgeGap.workspace_id == scope.workspace_id,
                KnowledgeGap.question == question,
            )
        )
        if exists is not None:
            continue

        node_id = None
        if gap.related_to.strip():
            node_id = await db.scalar(
                select(GraphNode.id).where(
                    GraphNode.workspace_id == scope.workspace_id,
                    GraphNode.label == gap.related_to.strip()[:200],
                )
            )

        db.add(
            KnowledgeGap(
                workspace_id=scope.workspace_id,
                node_id=node_id,
                question=question,
                reason=gap.reason,
            )
        )
        raised.append(question)
    return raised


async def apply_compile(
    db: AsyncSession,
    req: ApplyCompileRequest,
    *,
    scope: Scope,
    wiki_id: uuid.UUID,
    embedding: list[float] | None = None,
    embedding_model: str | None = None,
) -> CompileDiff:
    """Persist a compile result and return the diff describing what changed.

    The caller owns the transaction; this function flushes but does not commit,
    so a failure anywhere leaves the knowledge base untouched.
    """
    run = await db.get(CompileRun, req.run_id)
    if run is None:
        raise CompileError(f"compile run {req.run_id} not found")

    item = await db.get(RawItem, req.raw_item_id)
    if item is None:
        raise CompileError(f"raw item {req.raw_item_id} not found")

    page, created = await _resolve_page(db, req, scope, wiki_id)
    action = "create" if created else req.action if req.action != "create" else "merge"

    next_no = (
        await db.scalar(
            select(func.coalesce(func.max(WikiPageRevision.revision_no), 0)).where(
                WikiPageRevision.page_id == page.id
            )
        )
    ) + 1

    previous_headings = set()
    if page.current_revision_id:
        previous = await db.get(WikiPageRevision, page.current_revision_id)
        if previous:
            previous_headings = {s.get("heading", "") for s in (previous.body or [])}

    revision = WikiPageRevision(
        page_id=page.id,
        revision_no=next_no,
        title=req.title,
        summary=req.summary,
        body=[s.model_dump() for s in req.sections],
        compile_run_id=req.run_id,
    )
    db.add(revision)
    await db.flush()

    carried = await _carry_forward_claims(db, page, revision)
    added, disputed = await _add_new_claims(
        db, req, page, revision, carried, len(carried), item.content
    )

    page.title = req.title
    page.summary = req.summary
    page.current_revision_id = revision.id
    page.updated_at = dt.datetime.now(dt.UTC)
    if embedding is not None:
        page.embedding = embedding
        page.embedding_model = embedding_model

    already_sourced = await db.scalar(
        select(WikiPageSource.page_id).where(
            WikiPageSource.page_id == page.id, WikiPageSource.raw_item_id == req.raw_item_id
        )
    )
    if already_sourced is None:
        db.add(WikiPageSource(page_id=page.id, raw_item_id=req.raw_item_id))

    node_labels, edges = await _apply_graph(db, req, page, scope)
    gaps = await _apply_gaps(db, req, scope)

    # Recluster after the graph changed rather than on a schedule. A save is the
    # only thing that moves the topology, and Louvain over a personal knowledge
    # base is milliseconds — cheap enough that stale clusters are not worth the
    # complexity of deciding when to refresh them.
    #
    # Failure is swallowed: a colour on the graph must never be the reason a
    # compiled page is lost.
    try:
        await detect_communities(db, scope)
    except Exception:  # noqa: BLE001 — see above.
        log.warning("community_detection_failed", run_id=str(req.run_id), exc_info=True)

    diff = CompileDiff(
        run_id=req.run_id,
        raw_item_id=req.raw_item_id,
        action=action,
        page=CompileDiffPage(
            id=page.id, slug=page.slug, title=page.title, revision_no=revision.revision_no
        ),
        claims_added=added,
        claims_disputed=disputed,
        sections_added=[
            s.heading for s in req.sections if s.heading and s.heading not in previous_headings
        ],
        nodes_created=node_labels,
        edges_created=edges,
        gaps_raised=gaps,
        reasoning=req.reasoning,
    )

    payload = diff.model_dump(by_alias=True, mode="json")
    revision.diff = payload
    run.status = "succeeded"
    run.diff = payload
    run.finished_at = dt.datetime.now(dt.UTC)
    item.status = "compiled"

    await db.flush()
    return diff


def edge_visible_at(created_at_revision: int, current_revision: int) -> bool:
    """Whether an edge created by a given revision's run should be visible.

    The invariant revert reconciles against, named so the boundary is a decision
    rather than an inequality buried in a query. It is inclusive: reverting *to*
    r2 keeps r2's own edges — the off-by-one here would silently strip the
    connections belonging to the very revision being restored, and the page would
    still look right.
    """
    return created_at_revision <= current_revision


async def revert_page(
    db: AsyncSession, *, page: WikiPage, revision_no: int, scope: Scope
) -> WikiPageRevision:
    """Roll a page back to an earlier revision and withdraw what came after.

    Because claims are revision-scoped, restoring the page is a pointer change.
    Graph edges are not, so they are reconciled explicitly in both directions:
    edges from undone runs are withdrawn, and edges an earlier revert withdrew are
    restored. Doing only the first made revert lossy — the prose came back and the
    connections did not.
    """
    target = await db.scalar(
        select(WikiPageRevision).where(
            WikiPageRevision.page_id == page.id, WikiPageRevision.revision_no == revision_no
        )
    )
    if target is None:
        raise CompileError(f"revision {revision_no} does not exist for this page")

    undone_runs = (
        await db.scalars(
            select(WikiPageRevision.compile_run_id).where(
                WikiPageRevision.page_id == page.id,
                WikiPageRevision.revision_no > revision_no,
                WikiPageRevision.compile_run_id.is_not(None),
            )
        )
    ).all()

    if undone_runs:
        await db.execute(
            update(GraphEdge)
            .where(
                GraphEdge.workspace_id == scope.workspace_id,
                GraphEdge.created_by_run_id.in_(undone_runs),
                GraphEdge.withdrawn_at.is_(None),
            )
            .values(withdrawn_at=dt.datetime.now(dt.UTC))
        )

    # Restore edges an earlier revert took away.
    #
    # Withdrawal used to be one-way, which made revert quietly lossy: the page
    # round-trips perfectly because claims are revision-scoped and restoring is a
    # pointer change, but edges are not, so going back to r1 and then forward to
    # r4 returned the prose and left the connections withdrawn for good. Nothing
    # in the interface hinted at that, and only a later compile happening to
    # produce the same edge would have brought it back.
    #
    # Stating it as an invariant instead of an action makes revert symmetric and
    # repeatable: an edge is visible exactly when the run that created it belongs
    # to a revision at or before the current one.
    kept_runs = (
        await db.scalars(
            select(WikiPageRevision.compile_run_id).where(
                WikiPageRevision.page_id == page.id,
                # Inclusive — see edge_visible_at.
                WikiPageRevision.revision_no <= revision_no,
                WikiPageRevision.compile_run_id.is_not(None),
            )
        )
    ).all()

    if kept_runs:
        await db.execute(
            update(GraphEdge)
            .where(
                GraphEdge.workspace_id == scope.workspace_id,
                GraphEdge.created_by_run_id.in_(kept_runs),
                GraphEdge.withdrawn_at.is_not(None),
            )
            .values(withdrawn_at=None)
        )

    page.current_revision_id = target.id
    page.title = target.title
    page.summary = target.summary
    page.updated_at = dt.datetime.now(dt.UTC)

    await db.flush()
    log.info(
        "page_reverted",
        page_id=str(page.id),
        to_revision=revision_no,
        withdrawn_runs=len(undone_runs),
    )
    return target
