"""Shared FastAPI dependencies."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import AuthError, Principal, get_verifier, role_at_least
from .config import Settings, get_settings
from .db import get_db
from .embeddings import EmbeddingProvider
from .models import CompileRun, RawItem, WikiPage
from .scoping import Scope

SettingsDep = Annotated[Settings, Depends(get_settings)]
DbDep = Annotated[AsyncSession, Depends(get_db)]


# ─── who is calling ──────────────────────────────────────────────────────────


def current_principal(
    settings: SettingsDep,
    authorization: Annotated[str | None, Header()] = None,
) -> Principal:
    """Resolve the caller from their Better Auth token.

    `allow_anonymous` exists so the single-user v1 flows keep working while auth
    is being wired through the frontend. It must be off before this is exposed to
    anyone else, and the startup log says so loudly.
    """
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        try:
            return get_verifier().verify(token)
        except AuthError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=str(exc),
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc

    if settings.allow_anonymous:
        return Principal(
            user_id=settings.default_user_id,
            email=None,
            workspace_id=settings.default_workspace_id,
            role="owner",
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="sign in to continue",
        headers={"WWW-Authenticate": "Bearer"},
    )


PrincipalDep = Annotated[Principal, Depends(current_principal)]


def current_scope(principal: PrincipalDep) -> Scope:
    """The workspace this request is confined to.

    A signed-in user with no active workspace is rejected rather than defaulted:
    silently picking one would eventually pick the wrong one.
    """
    if not principal.workspace_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="no active workspace — create or select one first",
        )
    return Scope(
        workspace_id=principal.workspace_id,
        user_id=principal.user_id,
        role=principal.role,
    )


ScopeDep = Annotated[Scope, Depends(current_scope)]


def require_role(minimum: str):
    """Dependency factory gating an endpoint on a workspace role.

    Mirrors the roles in apps/web/src/lib/permissions.ts. That file decides what
    the UI offers; this decides what actually happens, which is the boundary that
    matters.
    """

    def guard(scope: ScopeDep) -> Scope:
        if not role_at_least(scope.role, minimum):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"this action requires the {minimum} role or higher",
            )
        return scope

    return guard


#: Can save sources and undo compiles.
MemberScope = Annotated[Scope, Depends(require_role("member"))]
#: Can manage wikis and members.
AdminScope = Annotated[Scope, Depends(require_role("admin"))]


# ─── service-to-service ──────────────────────────────────────────────────────


def require_internal_token(
    settings: SettingsDep,
    x_internal_token: Annotated[str | None, Header()] = None,
) -> None:
    """Guard the endpoints the Mastra agent calls back into.

    These accept writes to the knowledge base without going through capture, so
    they must not be reachable from a browser.
    """
    if x_internal_token != settings.internal_api_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid internal token"
        )


InternalAuth = Depends(require_internal_token)


async def scope_from_run(db: DbDep, run_id: uuid.UUID) -> Scope:
    """The workspace a compile run belongs to.

    Internal callers are trusted services, but they are NOT trusted to name a
    workspace: the agent passes a run id and the scope is derived from the stored
    row. A compromised or buggy agent therefore cannot write across workspaces
    even though its token is valid for all of them.
    """
    run = await db.get(CompileRun, run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="run not found")
    return Scope(workspace_id=run.workspace_id, user_id=run.user_id, role="owner")


async def scope_from_item(db: DbDep, item_id: uuid.UUID) -> Scope:
    """The workspace a raw item belongs to. Same reasoning as `scope_from_run`."""
    item = await db.get(RawItem, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="item not found")
    return Scope(workspace_id=item.workspace_id, user_id=item.user_id, role="owner")


async def scope_from_page(db: DbDep, page_id: uuid.UUID) -> Scope:
    """The workspace a wiki page belongs to. Same reasoning as `scope_from_run`."""
    page = await db.get(WikiPage, page_id)
    if page is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="page not found")
    return Scope(workspace_id=page.workspace_id, user_id="agent", role="owner")


# ─── embeddings ──────────────────────────────────────────────────────────────


def get_embedder(request: Request) -> EmbeddingProvider:
    """The embedding provider chosen by the startup probe."""
    provider = getattr(request.app.state, "embedder", None)
    if provider is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No embedding provider is available; check the API startup logs.",
        )
    return provider


EmbedderDep = Annotated[EmbeddingProvider, Depends(get_embedder)]
