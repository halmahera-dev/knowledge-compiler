"""Topic matching: which existing page, if any, does a new item belong to?

Uses CockroachDB's native cosine distance operator (``<=>``) against the vector
index on ``wiki_pages.embedding``. Cosine because embeddings are compared by
direction, not magnitude.
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..schemas import PageCandidate

# `1 - (a <=> b)` converts cosine distance into the similarity users reason about.
# The vector literal is bound as text and cast, because asyncpg has no VECTOR codec.
_SEARCH_SQL = text(
    """
    SELECT
        id,
        slug,
        title,
        summary,
        1 - (embedding <=> CAST(:query_vector AS VECTOR(1024))) AS similarity
    FROM wiki_pages
    WHERE workspace_id = :workspace_id
      AND embedding IS NOT NULL
    ORDER BY embedding <=> CAST(:query_vector AS VECTOR(1024))
    LIMIT :limit
    """
)


def to_vector_literal(vector: list[float]) -> str:
    """Render a vector in the literal form CockroachDB parses for VECTOR columns."""
    return "[" + ",".join(repr(float(x)) for x in vector) + "]"


async def find_similar_pages(
    db: AsyncSession,
    *,
    workspace_id: str,
    embedding: list[float],
    top_k: int | None = None,
) -> list[PageCandidate]:
    """Return the closest pages, most similar first.

    Returns every neighbour rather than only those above the merge threshold —
    the agent decides what to do with them, and seeing near-misses is useful
    context for that decision.
    """
    settings = get_settings()
    limit = top_k or settings.match_top_k

    rows = (
        await db.execute(
            _SEARCH_SQL,
            {
                "query_vector": to_vector_literal(embedding),
                "workspace_id": workspace_id,
                "limit": limit,
            },
        )
    ).mappings()

    return [
        PageCandidate(
            page_id=row["id"],
            slug=row["slug"],
            title=row["title"],
            summary=row["summary"] or "",
            similarity=float(row["similarity"]),
        )
        for row in rows
    ]


def resolve_threshold(provider_default: float) -> float:
    """The merge threshold: an explicit MATCH_THRESHOLD, else the provider's."""
    override = get_settings().match_threshold
    return override if override is not None else provider_default


def best_match(candidates: list[PageCandidate], *, threshold: float) -> PageCandidate | None:
    """The single candidate similar enough to merge into, if any."""
    if candidates and candidates[0].similarity >= threshold:
        return candidates[0]
    return None
