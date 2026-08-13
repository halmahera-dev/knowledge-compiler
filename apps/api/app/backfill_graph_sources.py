"""Reconstructing where graph nodes came from, for saves made before it was recorded.

Run with::

    cd apps/api && uv run python -m app.backfill_graph_sources          # report only
    cd apps/api && uv run python -m app.backfill_graph_sources --write  # insert

`graph_node_sources` is what lets the graph connect one save to another. Nodes
created before that table existed have no rows in it, so on existing data the
derived edges find nothing and the graph stays as fragmented as it was.

Three sources are combined, because no single one covers every node:

    compile diffs        `nodesCreated` lists the labels a run created, and the
                         run records its raw item. This is the only source that
                         reaches nodes with no edges — which is most of the
                         isolated ones, since they are isolated precisely because
                         nothing linked them.
    edge evidence        `GraphEdge.evidence_raw_item_id` names the capture that
                         produced each edge, so both endpoints were seen there.
    page sources         a topic node points at a page, and `wiki_page_sources`
                         says which captures built it.

What this cannot recover is a *second* sighting of a node that was created once
and merely re-seen later: `nodesCreated` lists new labels only. So co-occurrence
counts come out low, and the `mentions` edges — which need one sighting — come
out complete. That asymmetry is worth knowing before reading the numbers: the
graph will connect, but "these keep appearing together" stays understated until
new saves accumulate.

Idempotent. Existing rows are left alone, so running it twice changes nothing.
"""

from __future__ import annotations

import argparse
import asyncio
from collections import Counter, defaultdict

from sqlalchemy import select

from .db import session_scope
from .models import CompileRun, GraphEdge, GraphNode, GraphNodeSource, WikiPageSource


async def backfill(write: bool) -> Counter:
    counts: Counter = Counter()
    #: node id -> raw item ids it was seen in
    seen: dict = defaultdict(set)

    async with session_scope() as db:
        nodes = (
            await db.execute(
                select(
                    GraphNode.id,
                    GraphNode.label,
                    GraphNode.workspace_id,
                    GraphNode.wiki_page_id,
                )
            )
        ).all()
        by_label: dict[tuple[str, str], list] = defaultdict(list)
        for node_id, label, workspace_id, _page in nodes:
            # Matched case-insensitively, the same way _upsert_node dedupes them.
            by_label[(workspace_id, label.lower())].append(node_id)

        # ── compile diffs ────────────────────────────────────────────────────
        runs = (
            await db.execute(
                select(CompileRun.workspace_id, CompileRun.raw_item_id, CompileRun.diff).where(
                    CompileRun.diff.isnot(None)
                )
            )
        ).all()
        for workspace_id, raw_item_id, diff in runs:
            for label in (diff or {}).get("nodesCreated", []) or []:
                if not isinstance(label, str):
                    continue
                for node_id in by_label.get((workspace_id, label.lower()), []):
                    seen[node_id].add(raw_item_id)
                    counts["from compile diffs"] += 1

        # ── edge evidence ────────────────────────────────────────────────────
        edges = (
            await db.execute(
                select(
                    GraphEdge.source_node_id,
                    GraphEdge.target_node_id,
                    GraphEdge.evidence_raw_item_id,
                ).where(GraphEdge.evidence_raw_item_id.isnot(None))
            )
        ).all()
        for source, target, raw_item_id in edges:
            for node_id in (source, target):
                seen[node_id].add(raw_item_id)
                counts["from edge evidence"] += 1

        # ── page sources, for topic nodes ────────────────────────────────────
        pages = (
            await db.execute(
                select(GraphNode.id, WikiPageSource.raw_item_id).join(
                    WikiPageSource, WikiPageSource.page_id == GraphNode.wiki_page_id
                )
            )
        ).all()
        for node_id, raw_item_id in pages:
            seen[node_id].add(raw_item_id)
            counts["from page sources"] += 1

        # ── insert what is missing ───────────────────────────────────────────
        existing = {
            (node_id, raw_item_id)
            for node_id, raw_item_id in (
                await db.execute(select(GraphNodeSource.node_id, GraphNodeSource.raw_item_id))
            ).all()
        }

        for node_id, items in seen.items():
            for raw_item_id in items:
                if (node_id, raw_item_id) in existing:
                    counts["already recorded"] += 1
                    continue
                counts["inserted"] += 1
                if write:
                    db.add(GraphNodeSource(node_id=node_id, raw_item_id=raw_item_id))

        counts["nodes with provenance"] = len(seen)
        counts["nodes total"] = len(nodes)

        if write:
            await db.commit()

    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="insert the rows")
    args = parser.parse_args()

    counts = asyncio.run(backfill(args.write))

    print()
    print("  Reconstructed graph node provenance" if args.write else "  Dry run — nothing written")
    print()
    for key in sorted(counts):
        print(f"    {key:26} {counts[key]:>6}")
    missing = counts["nodes total"] - counts["nodes with provenance"]
    if missing:
        print(f"\n    {missing} node(s) could not be attributed to any capture.")
    print()
    if not args.write:
        print("  Re-run with --write to insert.")
        print()


if __name__ == "__main__":
    main()
