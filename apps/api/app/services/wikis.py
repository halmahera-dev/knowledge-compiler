"""Wikis within a workspace.

A workspace always has at least one wiki, because a capture has to land
somewhere. Rather than making the caller create one first — which would mean a
brand-new workspace rejects the first thing you save — the default is created on
demand the first time it is needed.
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.scoping import Scope
from app.models import Wiki
from app.services.extraction import slugify

DEFAULT_WIKI_NAME = "Knowledge base"
DEFAULT_WIKI_SLUG = "knowledge-base"


async def list_wikis(db: AsyncSession, scope: Scope) -> list[Wiki]:
    return list(
        (
            await db.scalars(
                select(Wiki)
                .where(Wiki.workspace_id == scope.workspace_id)
                .order_by(Wiki.created_at)
            )
        ).all()
    )


async def get_default_wiki(db: AsyncSession, scope: Scope) -> Wiki:
    """The workspace's default wiki, created on first use.

    Created lazily rather than at workspace-creation time so the two services
    stay decoupled: Better Auth creates organizations and knows nothing about
    wikis, and this API never has to hook into that.
    """
    existing = await db.scalar(
        select(Wiki)
        .where(Wiki.workspace_id == scope.workspace_id)
        .order_by(Wiki.created_at)
        .limit(1)
    )
    if existing is not None:
        return existing

    wiki = Wiki(
        workspace_id=scope.workspace_id,
        name=DEFAULT_WIKI_NAME,
        slug=DEFAULT_WIKI_SLUG,
        description="Everything you save, compiled.",
    )
    db.add(wiki)
    await db.flush()
    return wiki


async def resolve_wiki(db: AsyncSession, scope: Scope, wiki_id: uuid.UUID | None) -> Wiki:
    """The wiki a capture belongs to.

    An explicit id is checked against the caller's workspace before use — without
    that check, passing another workspace's wiki id would file content there.
    """
    if wiki_id is None:
        return await get_default_wiki(db, scope)

    wiki = await db.get(Wiki, wiki_id)
    if wiki is None or wiki.workspace_id != scope.workspace_id:
        # 404 rather than 403: confirming the id exists elsewhere is itself a leak.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="wiki not found")
    return wiki


async def create_wiki(db: AsyncSession, scope: Scope, *, name: str, description: str = "") -> Wiki:
    base = slugify(name, fallback="wiki")
    slug = base
    for attempt in range(2, 50):
        clash = await db.scalar(
            select(Wiki.id).where(Wiki.workspace_id == scope.workspace_id, Wiki.slug == slug)
        )
        if clash is None:
            break
        slug = f"{base}-{attempt}"

    wiki = Wiki(
        workspace_id=scope.workspace_id, name=name, slug=slug, description=description
    )
    db.add(wiki)
    await db.flush()
    return wiki
