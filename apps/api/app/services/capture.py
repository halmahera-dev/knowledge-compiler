"""Saving a captured item and queueing it for compilation.

Extracted from the `POST /api/v1/items` handler so PDF upload can reuse it
verbatim. Every capture mode — paste, clip, link, pdf — has to do the same five
things in the same order (dedupe, resolve the wiki, persist, embed, enqueue), and
having that sequence in one place is what stops a new capture mode from quietly
skipping the dedupe check or forgetting to stamp the workspace.
"""

from __future__ import annotations

import uuid

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..embeddings import EmbeddingProvider, build_embedding_input
from ..extraction import content_hash
from ..models import CompileRun, RawItem
from ..queue import enqueue_compile
from ..scoping import Scope
from .wikis import resolve_wiki

log = structlog.get_logger(__name__)


class SavedItem:
    """What a save produced: the item, its run, and whether it was a duplicate."""

    __slots__ = ("item_id", "run_id", "duplicate")

    def __init__(self, item_id: uuid.UUID, run_id: uuid.UUID | None, duplicate: bool) -> None:
        self.item_id = item_id
        self.run_id = run_id
        self.duplicate = duplicate


async def save_and_queue(
    db: AsyncSession,
    *,
    scope: Scope,
    embedder: EmbeddingProvider,
    capture_type: str,
    content: str,
    title: str,
    source_url: str | None = None,
    wiki_id: uuid.UUID | None = None,
    commit: bool = True,
) -> SavedItem:
    """Persist one captured item and queue its compile.

    `commit=False` lets a caller save several chunks of one document in a single
    transaction — a half-ingested PDF, where three chunks landed and two did not,
    would leave a page citing sources that were never stored.
    """
    digest = content_hash(content)

    # Re-saving the same content is a no-op rather than a duplicate page. Scoped
    # to the workspace, so two people saving the same article collaborate on one
    # item instead of racing two compiles.
    existing = await db.scalar(
        select(RawItem).where(
            RawItem.workspace_id == scope.workspace_id, RawItem.content_hash == digest
        )
    )
    if existing is not None:
        return SavedItem(item_id=existing.id, run_id=None, duplicate=True)

    wiki = await resolve_wiki(db, scope, wiki_id)

    item = RawItem(
        workspace_id=scope.workspace_id,
        wiki_id=wiki.id,
        user_id=scope.user_id,
        capture_type=capture_type,
        source_url=source_url,
        title=title,
        content=content,
        content_hash=digest,
        status="pending",
    )
    db.add(item)
    await db.flush()

    # Embedded here rather than in the agent so the vector is written by the same
    # process that owns the database.
    try:
        vectors = await embedder.embed([build_embedding_input(title, content)])
        item.embedding = vectors[0]
        item.embedding_model = embedder.name
    except Exception as exc:
        # A missing embedding weakens topic matching for this item; it does not
        # justify discarding what the user saved.
        log.warning("item_embedding_failed", item_id=str(item.id), error=str(exc))

    run = CompileRun(
        workspace_id=scope.workspace_id,
        user_id=scope.user_id,
        raw_item_id=item.id,
        status="queued",
    )
    db.add(run)
    # Flushed even when the caller owns the commit: the run id is part of the
    # response and is what the enqueue call keys on, and it does not exist until
    # the row reaches the database.
    await db.flush()

    if commit:
        await db.commit()
        await enqueue_compile(
            run_id=run.id, raw_item_id=item.id, workspace_id=scope.workspace_id
        )

    return SavedItem(item_id=item.id, run_id=run.id, duplicate=False)
