"""The topic graph (PRD §6.4)."""

from __future__ import annotations

from fastapi import APIRouter, Query
from sqlalchemy import select

from ..deps import DbDep, ScopeDep
from ..models import GraphEdge, GraphNode, WikiPage
from ..schemas import DerivedEdgeOut, GraphEdgeOut, GraphNodeOut, GraphOut
from ..services.clustering import derived_edges

router = APIRouter(prefix="/api/v1/graph", tags=["graph"])


@router.get("", response_model=GraphOut)
async def get_graph(
    db: DbDep,
    scope: ScopeDep,
    min_weight: int = Query(1, ge=1, description="Hide nodes below this weight"),
) -> GraphOut:
    """The whole graph, in one payload.

    Sending it whole is deliberate: force-directed layout needs the full edge set
    to place anything correctly, and at personal-knowledge-base scale (hundreds of
    nodes) that is a small response. Paginating would produce a wrong layout.
    """
    rows = (
        await db.execute(
            select(GraphNode, WikiPage.slug)
            .join(WikiPage, WikiPage.id == GraphNode.wiki_page_id, isouter=True)
            .where(GraphNode.workspace_id == scope.workspace_id, GraphNode.weight >= min_weight)
        )
    ).all()

    nodes = [
        GraphNodeOut(
            id=node.id,
            label=node.label,
            kind=node.kind,
            weight=node.weight,
            slug=slug,
            community=node.community,
        )
        for node, slug in rows
    ]
    node_ids = {n.id for n in nodes}

    edges = (
        await db.scalars(
            select(GraphEdge).where(
                GraphEdge.workspace_id == scope.workspace_id,
                # Withdrawn edges belong to compiles that were undone.
                GraphEdge.withdrawn_at.is_(None),
            )
        )
    ).all()

    return GraphOut(
        nodes=nodes,
        edges=[
            GraphEdgeOut(
                id=edge.id,
                source=edge.source_node_id,
                target=edge.target_node_id,
                relation=edge.relation,
                weight=edge.weight,
            )
            for edge in edges
            # Dropping edges whose endpoints were filtered out keeps the payload
            # renderable; a dangling edge id would break the layout.
            if edge.source_node_id in node_ids and edge.target_node_id in node_ids
        ],
        # Computed from provenance on every request rather than stored. At this
        # scale the work is negligible, and a second edge table would have to be
        # kept in step with the first — a synchronisation problem bought before
        # there is evidence it is needed.
        derived_edges=[
            DerivedEdgeOut(
                source=edge.source_id,
                target=edge.target_id,
                kind=edge.kind,
                shared_sources=edge.shared_sources,
            )
            for edge in await derived_edges(db, scope)
            if edge.source_id in node_ids and edge.target_id in node_ids
        ],
    )
