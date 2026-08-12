"""Workspace scoping.

There are 80-odd places in this API that read or write workspace-owned rows. A
convention like "remember to add `.where(workspace_id == ...)`" fails the first
time someone adds an endpoint in a hurry, and the failure mode is the worst one
available: a user reading another workspace's knowledge base.

So scoping goes through here. `Scope.select(Model)` returns a statement that is
already filtered, and `Scope.owns(row)` is the guard for anything fetched by
primary key (`session.get` cannot be filtered).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, TypeVar

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import (
    AiUsageEvent,
    ChatMessage,
    ChatSession,
    ClaimSource,
    CompileRun,
    GraphCommunity,
    GraphEdge,
    GraphNode,
    GraphNodeSource,
    KnowledgeGap,
    RawItem,
    Wiki,
    WikiClaim,
    WikiPage,
    WikiPageRevision,
    WikiPageSource,
)

T = TypeVar("T")

#: Models carrying `workspace_id` directly. Anything here can be filtered in one hop.
WORKSPACE_OWNED = (
    RawItem,
    WikiPage,
    GraphNode,
    GraphEdge,
    CompileRun,
    KnowledgeGap,
    Wiki,
    ChatSession,
    AiUsageEvent,
    GraphCommunity,
)

#: Models reachable only through a parent. Listing them explicitly means a new
#: model is a loud KeyError rather than a silently unscoped query.
DERIVED_OWNERSHIP = {
    WikiPageRevision: "page_id",
    WikiClaim: "page_id",
    WikiPageSource: "page_id",
    ClaimSource: "claim_id",
    ChatMessage: "session_id",
    GraphNodeSource: "node_id",
}


class ScopeError(RuntimeError):
    """A query was attempted without a workspace, or against the wrong one."""


@dataclass(frozen=True)
class Scope:
    """The workspace a request is confined to."""

    workspace_id: str
    user_id: str
    role: str | None = None

    def select(self, model: type[T]) -> Select[tuple[T]]:
        """A SELECT already filtered to this workspace.

        Raises for models that have no `workspace_id`, rather than returning an
        unfiltered statement — an unscoped query is a data leak, so it must be a
        crash and not a default.
        """
        if model not in WORKSPACE_OWNED:
            raise ScopeError(
                f"{model.__name__} is not workspace-owned; reach it through its parent "
                f"(see DERIVED_OWNERSHIP) rather than scoping it directly"
            )
        return select(model).where(model.workspace_id == self.workspace_id)  # type: ignore[attr-defined]

    def owns(self, row: Any | None) -> bool:
        """Whether a row fetched outside `select()` belongs to this workspace."""
        if row is None:
            return False
        owner = getattr(row, "workspace_id", None)
        return owner is not None and owner == self.workspace_id

    async def get(self, db: AsyncSession, model: type[T], pk: Any) -> T | None:
        """`session.get`, but returning None when the row is another workspace's.

        Callers then raise 404 rather than 403: revealing that an id exists but
        belongs to someone else is itself a leak.
        """
        row = await db.get(model, pk)
        return row if self.owns(row) else None

    def stamp(self, **extra: Any) -> dict[str, Any]:
        """Column values every new workspace-owned row must carry."""
        return {"workspace_id": self.workspace_id, **extra}
