"""Reading and naming the clusters Louvain found.

Detection (`clustering.py`) answers *which nodes belong together*. That is a
number on a node, and a number is not something a reader can use. This module is
the other half: what each cluster is made of, and the prose that names it.

The prose is written by the agent, not here — the API owns data, the agent owns
reasoning, as everywhere else in this codebase. What lives here is the selection
of which clusters are worth naming and what material to name them from.

Two rules shape that selection, and both are about cost.

**Only clusters worth a sentence.** A pair of nodes that happen to co-occur is
not a theme, and paying a model call to be told so is waste. `MIN_SUMMARY_NODES`
is the floor.

**Only a few per compile.** A save shifts the membership of the clusters it
touches, and each shifted cluster needs new prose. Left uncapped that is an
unbounded number of model calls hanging off one save. Capped, the map fills in
over successive saves and the cost per save stays flat and predictable.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import GraphCommunity, GraphNode, WikiPage
from ..scoping import Scope

log = structlog.get_logger(__name__)

#: Below this a cluster is a coincidence, not a theme worth naming.
MIN_SUMMARY_NODES = 4

#: How many concept labels to carry into a summary prompt, largest first.
#:
#: Enough to characterise a cluster; not so many that a hundred-node cluster
#: sends a hundred labels and buries the pages, which are the better evidence.
MAX_LABELS = 40

#: How many pages' prose to include. Pages are what the summary is really about.
MAX_PAGES = 8

#: Summary text is truncated per page. A theme is characterised by what its pages
#: are about, and the opening of a page summary already says that.
PAGE_SUMMARY_CHARS = 400


@dataclass(frozen=True)
class CommunityMaterial:
    """One cluster and the material to write about it."""

    fingerprint: str
    community: int
    node_count: int
    page_count: int
    labels: list[str]
    pages: list[tuple[str, str]]


@dataclass(frozen=True)
class CommunityView:
    """One cluster as a reader sees it."""

    community: int
    title: str | None
    summary: str | None
    node_count: int
    page_count: int
    labels: list[str]
    summarised_at: dt.datetime | None


async def _labels_by_community(
    db: AsyncSession, scope: Scope, limit: int
) -> dict[int, list[str]]:
    """The heaviest concepts in each cluster.

    Ordered by weight, which is how often a concept has been seen, so the labels
    that characterise a cluster come first rather than whichever the database
    happened to return.
    """
    rows = (
        await db.execute(
            select(GraphNode.community, GraphNode.label)
            .where(
                GraphNode.workspace_id == scope.workspace_id,
                GraphNode.community.is_not(None),
            )
            .order_by(GraphNode.community, GraphNode.weight.desc(), GraphNode.label)
        )
    ).all()

    labels: dict[int, list[str]] = {}
    for community, label in rows:
        bucket = labels.setdefault(community, [])
        if len(bucket) < limit:
            bucket.append(label)
    return labels


async def _pages_by_community(
    db: AsyncSession, scope: Scope, limit: int
) -> dict[int, list[tuple[str, str]]]:
    """The compiled pages inside each cluster, title and summary."""
    rows = (
        await db.execute(
            select(GraphNode.community, WikiPage.title, WikiPage.summary)
            .join(WikiPage, WikiPage.id == GraphNode.wiki_page_id)
            .where(
                GraphNode.workspace_id == scope.workspace_id,
                GraphNode.community.is_not(None),
            )
            .order_by(GraphNode.community, GraphNode.weight.desc())
        )
    ).all()

    pages: dict[int, list[tuple[str, str]]] = {}
    for community, title, summary in rows:
        bucket = pages.setdefault(community, [])
        if len(bucket) < limit:
            bucket.append((title, (summary or "")[:PAGE_SUMMARY_CHARS]))
    return pages


async def unsummarised(
    db: AsyncSession, scope: Scope, limit: int
) -> list[CommunityMaterial]:
    """Clusters big enough to name that have no prose for their current membership.

    A cluster whose membership changed lost its summary with its fingerprint, so
    it reappears here — which is the intended behaviour. Prose describing a set of
    nodes that has since changed is worse than no prose, because it reads as
    current.
    """
    rows = (
        await db.scalars(
            select(GraphCommunity)
            .where(
                GraphCommunity.workspace_id == scope.workspace_id,
                GraphCommunity.summary.is_(None),
                GraphCommunity.node_count >= MIN_SUMMARY_NODES,
            )
            # Largest first: the biggest cluster is the one a reader is most
            # likely to be looking at, and the one most worth the call.
            .order_by(GraphCommunity.node_count.desc())
            .limit(limit)
        )
    ).all()

    if not rows:
        return []

    labels = await _labels_by_community(db, scope, MAX_LABELS)
    pages = await _pages_by_community(db, scope, MAX_PAGES)

    return [
        CommunityMaterial(
            fingerprint=row.fingerprint,
            community=row.community,
            node_count=row.node_count,
            page_count=row.page_count,
            labels=labels.get(row.community, []),
            pages=pages.get(row.community, []),
        )
        for row in rows
    ]


async def store_summary(
    db: AsyncSession, scope: Scope, fingerprint: str, title: str, summary: str
) -> bool:
    """Attach prose to a cluster, addressed by membership rather than number.

    Returns False when the fingerprint no longer exists, which happens when a
    save landed while the summary was being written. Dropping it is correct: the
    cluster it describes is gone, and there is no number to re-file it under
    that would not be a guess.
    """
    row = await db.scalar(
        select(GraphCommunity).where(
            GraphCommunity.workspace_id == scope.workspace_id,
            GraphCommunity.fingerprint == fingerprint,
        )
    )
    if row is None:
        log.info("community_summary_stale", workspace_id=scope.workspace_id)
        return False

    row.title = title
    row.summary = summary
    row.summarised_at = dt.datetime.now(dt.UTC)
    return True


async def overview(db: AsyncSession, scope: Scope, label_limit: int = 8) -> list[CommunityView]:
    """Every cluster in the workspace, largest first.

    Includes the ones with no prose yet. A cluster that exists but has not been
    named is a fact about the workspace; hiding it would make the graph and this
    list disagree about how many clusters there are.
    """
    rows = (
        await db.scalars(
            select(GraphCommunity)
            .where(GraphCommunity.workspace_id == scope.workspace_id)
            .order_by(GraphCommunity.node_count.desc(), GraphCommunity.community)
        )
    ).all()

    if not rows:
        return []

    labels = await _labels_by_community(db, scope, label_limit)

    return [
        CommunityView(
            community=row.community,
            title=row.title,
            summary=row.summary,
            node_count=row.node_count,
            page_count=row.page_count,
            labels=labels.get(row.community, []),
            summarised_at=row.summarised_at,
        )
        for row in rows
    ]
