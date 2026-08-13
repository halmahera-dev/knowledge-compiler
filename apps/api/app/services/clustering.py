"""Making the topic graph connected, then finding the clusters in it.

The graph could not cluster because it was barely a graph. Edges are written by
the compile agent and only between nodes that one compile established — a
deliberate guard, so the agent cannot invent relationships between topics it
never read. The consequence is structural: **no edge can ever span two saves.**
Measured on a real workspace, 68 nodes came out as 28 disconnected components,
30% of them isolated. Running community detection over that returns the
components back, which is a fact you can get from a union-find.

So two things happen here, in order.

**Derived edges** reconnect what the guard keeps apart, using only
`graph_node_sources` — no model call, nothing to get wrong at inference time.
They are kept apart from `GraphEdge` on purpose. A typed relation is a *claim the
agent made* and can be wrong, which is why pages can be reverted. Co-occurrence
is a *statistic*: it cannot be wrong, only uninteresting. Storing them together
would let a statistic pass for a judgement, with a boolean column as the only
thing standing between them — and "remember to filter" is the failure mode this
codebase already rejected for workspace scoping.

**Louvain** then runs over both kinds at once, because a cluster should reflect
everything known about how ideas sit together, not only the half a model wrote
down.
"""

from __future__ import annotations

import hashlib
import uuid
from collections import defaultdict
from dataclasses import dataclass

import structlog
from networkx import Graph
from networkx.algorithms.community import louvain_communities
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import GraphCommunity, GraphEdge, GraphNode, GraphNodeSource
from ..scoping import Scope

log = structlog.get_logger(__name__)

#: How many separate captures two concepts must share before an edge is drawn.
#:
#: Two, not one. Everything inside a single document co-occurs, so at one the
#: rule says nothing and a twelve-concept save would emit sixty-six edges — a
#: clique, which is as unreadable as the dust it replaced. At two the edge means
#: something a reader would recognise: these ideas keep turning up together.
MIN_SHARED_SOURCES = 2

#: Louvain is randomised. A fixed seed keeps a workspace's clusters stable across
#: runs, so a colour on the graph does not change meaning on every save.
LOUVAIN_SEED = 20260809

#: How much a derived edge counts against an authored one when clustering.
#:
#: Below 1.0 because the agent's typed relations are the stronger evidence: it
#: read both sides and asserted a relationship. Co-occurrence only observes that
#: two things were nearby.
MENTION_WEIGHT = 0.6
CO_OCCURRENCE_WEIGHT = 0.4


@dataclass(frozen=True)
class DerivedEdge:
    """An edge nobody wrote down, computed from where nodes were seen."""

    source_id: uuid.UUID
    target_id: uuid.UUID
    #: `mentions` or `co_occurs` — shown differently, and never mixed into GraphEdge.
    kind: str
    #: How many captures support it. Drives line weight, and explains itself.
    shared_sources: int


def mention_edges(
    items_by_node: dict[uuid.UUID, set[uuid.UUID]],
    kinds: dict[uuid.UUID, str],
) -> list[DerivedEdge]:
    """Each concept, joined to the topic of the document it was found in.

    One edge per pair rather than a clique, and unambiguous: this concept appears
    on that page. This is the rule that rescues the isolated nodes — a concept
    extracted once and never linked has exactly this and nothing else.
    """
    topics = [node for node, kind in kinds.items() if kind == "topic"]
    edges: list[DerivedEdge] = []

    for entity, entity_items in items_by_node.items():
        if kinds.get(entity) != "entity":
            continue
        for topic in topics:
            shared = entity_items & items_by_node.get(topic, set())
            if shared:
                edges.append(
                    DerivedEdge(
                        source_id=entity,
                        target_id=topic,
                        kind="mentions",
                        shared_sources=len(shared),
                    )
                )
    return edges


def co_occurrence_edges(
    items_by_node: dict[uuid.UUID, set[uuid.UUID]],
    kinds: dict[uuid.UUID, str],
    min_shared: int = MIN_SHARED_SOURCES,
) -> list[DerivedEdge]:
    """Concepts that keep appearing in the same captures.

    Emitted once per pair, ordered by id, so the caller never has to dedupe two
    directions of the same fact.
    """
    entities = sorted(node for node, kind in kinds.items() if kind == "entity")
    edges: list[DerivedEdge] = []

    for i, left in enumerate(entities):
        left_items = items_by_node.get(left, set())
        if not left_items:
            continue
        for right in entities[i + 1 :]:
            shared = left_items & items_by_node.get(right, set())
            if len(shared) >= min_shared:
                edges.append(
                    DerivedEdge(
                        source_id=left,
                        target_id=right,
                        kind="co_occurs",
                        shared_sources=len(shared),
                    )
                )
    return edges


async def _provenance(
    db: AsyncSession, scope: Scope
) -> tuple[dict[uuid.UUID, set[uuid.UUID]], dict[uuid.UUID, str]]:
    """Which captures each node was seen in, and what kind of node it is."""
    rows = (
        await db.execute(
            select(GraphNodeSource.node_id, GraphNodeSource.raw_item_id, GraphNode.kind)
            .join(GraphNode, GraphNode.id == GraphNodeSource.node_id)
            .where(GraphNode.workspace_id == scope.workspace_id)
        )
    ).all()

    items_by_node: dict[uuid.UUID, set[uuid.UUID]] = defaultdict(set)
    kinds: dict[uuid.UUID, str] = {}
    for node_id, raw_item_id, kind in rows:
        items_by_node[node_id].add(raw_item_id)
        kinds[node_id] = kind
    return items_by_node, kinds


async def derived_edges(db: AsyncSession, scope: Scope) -> list[DerivedEdge]:
    """Every edge computable from provenance, for this workspace.

    Computed on read rather than stored. At the sizes this runs at the work is
    trivial, and a second edge table would have to be kept in step with the first
    — a synchronisation problem bought before there is any evidence it is needed.
    """
    items_by_node, kinds = await _provenance(db, scope)
    return mention_edges(items_by_node, kinds) + co_occurrence_edges(items_by_node, kinds)


def build_graph(
    node_ids: list[uuid.UUID],
    authored: list[tuple[uuid.UUID, uuid.UUID, float]],
    derived: list[DerivedEdge],
) -> Graph:
    """One weighted graph from both kinds of edge.

    Every node is added first, including the ones nothing touches. Louvain would
    otherwise never see them, and a node absent from the result is
    indistinguishable from one it declined to cluster.
    """
    graph = Graph()
    graph.add_nodes_from(node_ids)

    for source, target, weight in authored:
        if source == target:
            continue
        # Repeated pairs accumulate rather than overwrite: two typed relations
        # between the same nodes is stronger evidence than one.
        current = graph.get_edge_data(source, target, {}).get("weight", 0.0)
        graph.add_edge(source, target, weight=current + weight)

    for edge in derived:
        if edge.source_id == edge.target_id:
            continue
        base = MENTION_WEIGHT if edge.kind == "mentions" else CO_OCCURRENCE_WEIGHT
        current = graph.get_edge_data(edge.source_id, edge.target_id, {}).get("weight", 0.0)
        graph.add_edge(
            edge.source_id, edge.target_id, weight=current + base * edge.shared_sources
        )

    return graph


def assign_communities(graph: Graph) -> dict[uuid.UUID, int]:
    """Louvain over the graph, as node id to community number.

    Communities are numbered by descending size, so 0 is always the largest. The
    numbers themselves carry no meaning between runs — they are a colour index,
    and anything durable hung off them would be wrong after the next save.
    """
    if graph.number_of_nodes() == 0:
        return {}

    groups = louvain_communities(graph, weight="weight", seed=LOUVAIN_SEED)
    ordered = sorted(groups, key=len, reverse=True)
    return {node: index for index, group in enumerate(ordered) for node in group}


def fingerprint(node_ids: list[uuid.UUID]) -> str:
    """A stable name for a cluster, derived from who is in it.

    Louvain renumbers on every run — cluster 3 today is a different set of nodes
    tomorrow — so anything durable hung off the number describes the wrong thing
    after the next save. Hashing the sorted membership gives an identity that
    survives renumbering, which is what lets a summary be reused instead of
    regenerated: same members, same paragraph, no model call.
    """
    joined = ",".join(sorted(str(node_id) for node_id in node_ids))
    return hashlib.sha256(joined.encode()).hexdigest()


async def _record_communities(
    db: AsyncSession,
    scope: Scope,
    members: dict[int, list[uuid.UUID]],
    pages_by_node: dict[uuid.UUID, bool],
) -> None:
    """Store each cluster's membership, keeping any summary still valid.

    A row survives across runs when its fingerprint does, carrying its prose with
    it. Rows whose membership no longer exists are removed rather than left to
    accumulate — a stale summary of a cluster that has since split is worse than
    none, because it reads as current.
    """
    seen: set[str] = set()

    for community, node_ids in members.items():
        mark = fingerprint(node_ids)
        seen.add(mark)
        page_count = sum(1 for node_id in node_ids if pages_by_node.get(node_id))

        existing = await db.scalar(
            select(GraphCommunity).where(
                GraphCommunity.workspace_id == scope.workspace_id,
                GraphCommunity.fingerprint == mark,
            )
        )
        if existing is not None:
            # Membership unchanged, so the summary still holds. Only the number
            # it currently carries is refreshed.
            existing.community = community
            existing.node_count = len(node_ids)
            existing.page_count = page_count
            continue

        db.add(
            GraphCommunity(
                workspace_id=scope.workspace_id,
                fingerprint=mark,
                community=community,
                node_count=len(node_ids),
                page_count=page_count,
            )
        )

    await db.flush()
    stale = select(GraphCommunity.id).where(
        GraphCommunity.workspace_id == scope.workspace_id,
        GraphCommunity.fingerprint.notin_(seen) if seen else True,
    )
    await db.execute(delete(GraphCommunity).where(GraphCommunity.id.in_(stale)))


async def detect_communities(db: AsyncSession, scope: Scope) -> dict[str, int]:
    """Recompute this workspace's clusters and store them on the nodes.

    Returns a small summary for the caller to log or show. Does not commit — the
    caller owns the transaction, as everywhere else in this API.
    """
    nodes = (
        await db.execute(
            select(GraphNode.id).where(GraphNode.workspace_id == scope.workspace_id)
        )
    ).scalars().all()

    if not nodes:
        return {"nodes": 0, "communities": 0, "edges": 0}

    authored = [
        (source, target, float(weight or 1.0))
        for source, target, weight in (
            await db.execute(
                select(GraphEdge.source_node_id, GraphEdge.target_node_id, GraphEdge.weight).where(
                    GraphEdge.workspace_id == scope.workspace_id,
                    GraphEdge.withdrawn_at.is_(None),
                )
            )
        ).all()
    ]

    derived = await derived_edges(db, scope)
    graph = build_graph(list(nodes), authored, derived)
    communities = assign_communities(graph)

    # Grouped into one UPDATE per community rather than one per node: a workspace
    # with a few thousand concepts would otherwise issue a few thousand
    # statements on every save.
    by_community: dict[int, list[uuid.UUID]] = defaultdict(list)
    for node_id, community in communities.items():
        by_community[community].append(node_id)

    for community, members in by_community.items():
        await db.execute(
            update(GraphNode).where(GraphNode.id.in_(members)).values(community=community)
        )

    pages_by_node = {
        node_id: page_id is not None
        for node_id, page_id in (
            await db.execute(
                select(GraphNode.id, GraphNode.wiki_page_id).where(
                    GraphNode.workspace_id == scope.workspace_id
                )
            )
        ).all()
    }
    await _record_communities(db, scope, by_community, pages_by_node)

    summary = {
        "nodes": len(nodes),
        "communities": len(by_community),
        "edges": graph.number_of_edges(),
        "derived_edges": len(derived),
    }
    log.info("communities_detected", workspace_id=scope.workspace_id, **summary)
    return summary
