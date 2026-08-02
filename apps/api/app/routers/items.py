"""Capture: the four ways content enters the system.

Paste, clip, and link arrive as JSON on `POST /items` (PRD §6.1). PDF arrives as
multipart on `POST /items/pdf`, because a file upload cannot share that body —
and because a long PDF becomes several items rather than one, which the JSON
response shape does not describe.

All four converge on `services.capture.save_and_queue`, so no capture mode can
skip the dedupe check or forget to stamp the workspace.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Annotated

import structlog
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select

from ..config import get_settings
from ..deps import DbDep, EmbedderDep, MemberScope, ScopeDep
from ..extraction import FetchError, derive_title, fetch_readable, normalize_content
from ..models import RawItem, WikiPage, WikiPageSource
from ..queue import enqueue_compile
from ..ratelimit import check_hourly
from ..schemas import CreateItemRequest, CreateItemResponse, DuplicateOf, RawItemOut
from ..services.capture import SavedItem, save_and_queue
from ..services.chunking import chunk_text, chunk_title
from ..services.pdf import PdfError, extract_pdf
from ..services.storage import get_object_store

router = APIRouter(prefix="/api/v1/items", tags=["capture"])
log = structlog.get_logger(__name__)


async def _describe_duplicate(db: DbDep, saved: SavedItem, scope) -> DuplicateOf | None:
    """Name what a re-save collided with, and where to read it.

    A refusal the reader cannot check is indistinguishable from a bug: told only
    "already saved", they have no way to tell whether the system matched the right
    thing. The page slug is looked up separately because an item saved moments ago
    may not have compiled yet — the title alone is still worth returning.
    """
    if not saved.duplicate:
        return None

    slug = await db.scalar(
        select(WikiPage.slug)
        .join(WikiPageSource, WikiPageSource.page_id == WikiPage.id)
        .where(
            WikiPageSource.raw_item_id == saved.item_id,
            WikiPage.workspace_id == scope.workspace_id,
        )
        .limit(1)
    )
    return DuplicateOf(item_id=saved.item_id, title=saved.existing_title, page_slug=slug)


@router.post("", response_model=CreateItemResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_item(
    payload: CreateItemRequest,
    db: DbDep,
    scope: MemberScope,
    embedder: EmbedderDep,
) -> CreateItemResponse:
    """Save a raw item and queue it for compilation.

    All three capture modes converge on the same artifact, so downstream code
    never branches on how something was saved.
    """
    await check_hourly(
        scope, name="compile", limit=get_settings().compile_rate_limit_per_hour
    )

    settings = get_settings()

    if payload.capture_type == "link":
        try:
            content, fetched_title = await fetch_readable(payload.source_url or "")
        except FetchError as exc:
            # The URL came from the user, so the reason it failed is actionable.
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
            ) from exc
        title = derive_title(payload.title or fetched_title, content, payload.source_url)
    else:
        content = normalize_content(payload.content or "")
        title = derive_title(payload.title, content, payload.source_url)

    if len(content) < 40:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="content is too short to compile — save at least a paragraph",
        )

    content = content[: settings.max_content_chars]

    saved = await save_and_queue(
        db,
        scope=scope,
        embedder=embedder,
        capture_type=payload.capture_type,
        content=content,
        title=title,
        source_url=payload.source_url,
        wiki_id=payload.wiki_id,
    )

    return CreateItemResponse(
        item_id=saved.item_id,
        run_id=saved.run_id,
        status="succeeded" if saved.duplicate else "queued",
        duplicate=saved.duplicate,
        duplicate_of=await _describe_duplicate(db, saved, scope),
    )


@router.post("/pdf", response_model=CreateItemResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_pdf(
    db: DbDep,
    scope: MemberScope,
    embedder: EmbedderDep,
    file: Annotated[UploadFile, File(description="A PDF with a text layer")],
    wiki_id: Annotated[uuid.UUID | None, Form()] = None,
) -> CreateItemResponse:
    """Save a PDF and queue it for compilation.

    Long documents are split into several items rather than stored whole: the
    agent only sends ~24k characters to the model, so a book kept as one item
    would be compiled from its opening pages while the rest vanished silently.
    The parts land on the same topic and merge, which is what the pipeline is for.
    """
    await check_hourly(
        scope, name="compile", limit=get_settings().compile_rate_limit_per_hour
    )

    settings = get_settings()

    # Read one byte past the cap so an oversized file is detected without
    # buffering all of it.
    data = await file.read(settings.max_pdf_bytes + 1)
    if len(data) > settings.max_pdf_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"that PDF is larger than {settings.max_pdf_bytes // (1024 * 1024)}MB",
        )

    try:
        # PDFium is synchronous and CPU-bound; a 300-page book would otherwise
        # stall every other request on the event loop.
        extracted = await asyncio.to_thread(extract_pdf, data)
    except PdfError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    base_title = derive_title(
        extracted.title or (file.filename or "").removesuffix(".pdf"), extracted.text, None
    )
    chunks = chunk_text(extracted.text[: settings.max_content_chars])
    if not chunks:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="no readable text in that PDF",
        )

    # Archive the original so a page citation ("page 42") stays checkable.
    # Deliberately not awaited into the failure path: see ObjectStore.put.
    archived = await get_object_store().put(
        workspace_id=scope.workspace_id,
        data=data,
        filename=file.filename or "upload.pdf",
        content_type=file.content_type or "application/pdf",
    )

    log.info(
        "pdf_ingested",
        pages=extracted.page_count,
        chars=len(extracted.text),
        parts=len(chunks),
        scanned=extracted.is_scanned,
        archived=bool(archived),
    )

    # All parts share one transaction: a half-ingested book would leave pages
    # citing sources that were never stored.
    first: SavedItem | None = None
    queued: list[SavedItem] = []
    for chunk in chunks:
        saved = await save_and_queue(
            db,
            scope=scope,
            embedder=embedder,
            capture_type="pdf",
            content=chunk.text,
            title=chunk_title(base_title, chunk),
            # The archived original is the item's source, so a reader can open
            # the PDF a claim came from.
            source_url=archived.uri if archived else None,
            wiki_id=wiki_id,
            commit=False,
        )
        first = first or saved
        if not saved.duplicate:
            queued.append(saved)

    await db.commit()

    # Enqueued only after the commit, so a worker cannot pick up a job whose row
    # is not yet visible.
    for saved in queued:
        await enqueue_compile(
            run_id=saved.run_id, raw_item_id=saved.item_id, workspace_id=scope.workspace_id
        )

    assert first is not None
    return CreateItemResponse(
        item_id=first.item_id,
        run_id=first.run_id,
        status="succeeded" if not queued else "queued",
        duplicate=not queued,
        duplicate_of=None if queued else await _describe_duplicate(db, first, scope),
        parts_queued=len(queued),
    )


@router.get("", response_model=list[RawItemOut])
async def list_items(
    db: DbDep,
    scope: ScopeDep,
    limit: int = Query(50, ge=1, le=200),
) -> list[RawItemOut]:
    """Recently captured items, newest first — the capture inbox."""
    items = (
        await db.scalars(
            select(RawItem)
            .where(RawItem.workspace_id == scope.workspace_id)
            .order_by(RawItem.created_at.desc())
            .limit(limit)
        )
    ).all()

    return [
        RawItemOut(
            id=item.id,
            capture_type=item.capture_type,
            source_url=item.source_url,
            title=item.title,
            status=item.status,
            created_at=item.created_at,
            excerpt=item.content[:280],
        )
        for item in items
    ]


@router.get("/{item_id}", response_model=RawItemOut)
async def get_item(item_id: uuid.UUID, db: DbDep, scope: ScopeDep) -> RawItemOut:
    item = await db.get(RawItem, item_id)
    if item is None or item.workspace_id != scope.workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="item not found")
    return RawItemOut(
        id=item.id,
        capture_type=item.capture_type,
        source_url=item.source_url,
        title=item.title,
        status=item.status,
        created_at=item.created_at,
        excerpt=item.content[:2000],
    )
